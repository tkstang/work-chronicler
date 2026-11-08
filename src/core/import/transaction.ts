import { basename, dirname, join } from 'node:path';

import { IMPORTED_RECORD_DIRECTORIES } from '@storage/paths';
import { IMPORT_SOURCES } from '@wc-types/imported-record';
import { z } from 'zod';

import type { ImportEnv, ImportFs } from './import-fs';
import {
  describeFsError,
  errorCode,
  type ImportIssue,
  importIssue,
} from './issues';
import {
  displayPath,
  type FileId,
  type ImportPlan,
  type PlannedRecord,
  sha256,
} from './plan';
import { MAX_STORED_BYTES } from './staging';

/**
 * Batch commit and recovery.
 *
 * One import runs per work log at a time, under `.import-lock` (created
 * atomically with a hard link, so it always holds its owner's process ID,
 * host and start time). A batch is committed through a write-ahead journal
 * in `.import-transaction/`:
 *
 * 1. Prepare (nothing in the work log changes): write every new record and a
 *    backup of every record it replaces into the transaction directory, read
 *    each back and check its hash, then write the journal (`prepared`).
 * 2. Create missing directories (listed in the journal), mark the journal
 *    `committing`, then for each record: re-check the work log, every
 *    directory on the way and the destination (absent, or still the exact
 *    file and contents that were planned), write the record's `applying`
 *    marker, then link a new record into place (which fails rather than
 *    replace anything) or rename a replacement over the old one, and check
 *    the stored hash.
 * 3. Mark the journal `committed` and remove the transaction directory.
 *
 * Any failure rolls back, by content hash, every record whose marker was
 * written: a record still holding the new contents is removed (create) or
 * restored from its backup (update). A
 * record holding anything else was changed by someone else; it is left as it
 * is and reported, never guessed at. An import interrupted by a crash is
 * recovered the same way by the next import: `prepared` is discarded,
 * `committing` is rolled back, and only `committed` (every record stored and
 * verified) is reported as imported.
 */

export const LOCK_NAME = '.import-lock';
export const TRANSACTION_NAME = '.import-transaction';
const CLAIM_PREFIX = `${LOCK_NAME}.claim-`;
const STALE_PREFIX = `${LOCK_NAME}.stale-`;
const DONE_PREFIX = `${TRANSACTION_NAME}.done-`;
const JOURNAL = 'journal.json';
const JOURNAL_TMP = 'journal.json.tmp';
const STAGED_DIR = 'staged';
const BACKUP_DIR = 'backup';
/** One empty marker per operation, written just before it is applied */
const APPLYING_DIR = 'applying';
const OWNER_MAX_BYTES = 4096;
const JOURNAL_MAX_BYTES = 32 * 1024 * 1024;

const OwnerSchema = z.strictObject({
  version: z.literal(1),
  pid: z.int().positive(),
  hostname: z.string(),
  startedAt: z.number(),
  batchId: z.string(),
});
type LockOwner = z.infer<typeof OwnerSchema>;

const RECORD_DIRECTORIES: string[] = Object.values(IMPORTED_RECORD_DIRECTORIES);
const SOURCES: string[] = [...IMPORT_SOURCES];

/** A journal path must be one an import could have written */
function isRecordDirectory(segments: string[]): boolean {
  const [type, source] = segments;
  if (type === undefined || !RECORD_DIRECTORIES.includes(type)) return false;
  if (segments.length === 1) return true;
  return (
    segments.length === 2 && source !== undefined && SOURCES.includes(source)
  );
}

function isRecordDestination(segments: string[]): boolean {
  const name = segments[2];
  return (
    segments.length === 3 &&
    isRecordDirectory(segments.slice(0, 2)) &&
    name !== undefined &&
    /^[0-9a-f]{32}\.md$/.test(name)
  );
}

const HashSchema = z.string().regex(/^[0-9a-f]{64}$/);
const TransactionFileSchema = z.string().regex(/^\d+\.md$/);

const JournalSchema = z.strictObject({
  version: z.literal(1),
  batchId: z.string(),
  state: z.enum(['prepared', 'committing', 'committed']),
  createdDirectories: z.array(z.array(z.string()).refine(isRecordDirectory)),
  operations: z.array(
    z
      .strictObject({
        destination: z.array(z.string()).refine(isRecordDestination),
        action: z.enum(['create', 'update']),
        staged: TransactionFileSchema,
        backup: TransactionFileSchema.nullable(),
        oldHash: HashSchema.nullable(),
        newHash: HashSchema,
      })
      .refine(
        (op) =>
          (op.action === 'update') ===
          (op.backup !== null && op.oldHash !== null),
      ),
  ),
});
type Journal = z.infer<typeof JournalSchema>;

/** Raised when the work log no longer matches what was planned */
class ChangedError extends Error {
  constructor(readonly destination?: string) {
    super('changed');
  }
}

function codedError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

function removeQuietly(fs: ImportFs, path: string, warnings: string[]): void {
  try {
    fs.unlink(path);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') {
      warnings.push(
        `could not remove ${basename(path)} (${describeFsError(error)})`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Lock

/** The lock an import holds while it runs */
export interface ImportLock {
  root: string;
  owner: LockOwner;
}

type OwnerRead =
  | { kind: 'owner'; owner: LockOwner }
  | { kind: 'missing' }
  | { kind: 'unreadable' };

function readOwner(fs: ImportFs, path: string): OwnerRead {
  try {
    const { data } = fs.readFile(path, OWNER_MAX_BYTES);
    const owner = OwnerSchema.safeParse(JSON.parse(data.toString('utf-8')));
    return owner.success
      ? { kind: 'owner', owner: owner.data }
      : { kind: 'unreadable' };
  } catch (error) {
    return errorCode(error) === 'ENOENT'
      ? { kind: 'missing' }
      : { kind: 'unreadable' };
  }
}

function sameOwner(a: LockOwner, b: LockOwner): boolean {
  return (
    a.pid === b.pid &&
    a.hostname === b.hostname &&
    a.startedAt === b.startedAt &&
    a.batchId === b.batchId
  );
}

/**
 * Whether a lock's owner may still be running. Only a process on this host
 * that is provably gone (not running, or started before the last boot)
 * counts as dead; anything else is treated as a running import.
 */
function ownerIsAlive(owner: LockOwner, env: ImportEnv): boolean {
  if (owner.hostname !== env.hostname) return true;
  if (owner.startedAt < env.bootTime()) return false;
  return env.isProcessAlive(owner.pid);
}

const LOCK_HELD =
  'another import is running in this work log (or was started on another machine); try again when it finishes';

/**
 * Take the work log's import lock, taking over a lock whose owner is
 * provably gone.
 *
 * @param root - Resolved work-log directory
 * @param env - Environment
 * @param batchId - ID of the batch being imported
 */
export function acquireImportLock(
  root: string,
  env: ImportEnv,
  batchId: string,
): { lock?: ImportLock; issue?: ImportIssue; warnings: string[] } {
  const { fs } = env;
  const warnings: string[] = [];
  const owner: LockOwner = {
    version: 1,
    pid: env.pid,
    hostname: env.hostname,
    startedAt: env.now(),
    batchId,
  };
  const lockPath = join(root, LOCK_NAME);
  const claim = join(root, `${CLAIM_PREFIX}${env.randomId()}`);
  const lockFailed = (error: unknown) =>
    importIssue(
      'COMMIT_FAILED',
      `the import lock could not be created (${describeFsError(error)}); nothing was changed`,
    );

  try {
    fs.writeFile(claim, Buffer.from(JSON.stringify(owner)));
  } catch (error) {
    removeQuietly(fs, claim, warnings);
    return { issue: lockFailed(error), warnings };
  }

  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        fs.link(claim, lockPath);
        return { lock: { root, owner }, warnings };
      } catch (error) {
        if (errorCode(error) !== 'EEXIST') {
          return { issue: lockFailed(error), warnings };
        }
      }

      const held = readOwner(fs, lockPath);
      if (held.kind === 'missing') continue;
      if (held.kind === 'unreadable') {
        return {
          issue: importIssue(
            'IMPORT_IN_PROGRESS',
            'the import lock (.import-lock) exists but could not be read; if no import is running, remove it',
          ),
          warnings,
        };
      }
      if (attempt > 0 || ownerIsAlive(held.owner, env)) {
        return {
          issue: importIssue('IMPORT_IN_PROGRESS', LOCK_HELD),
          warnings,
        };
      }

      // The owner is gone: move its lock aside, then make sure the lock we
      // moved is the one we judged (another process may have taken over).
      const stale = join(root, `${STALE_PREFIX}${env.randomId()}`);
      try {
        fs.rename(lockPath, stale);
      } catch (error) {
        if (errorCode(error) === 'ENOENT') continue;
        return {
          issue: importIssue(
            'IMPORT_IN_PROGRESS',
            `a stale import lock could not be removed (${describeFsError(error)})`,
          ),
          warnings,
        };
      }
      const moved = readOwner(fs, stale);
      if (moved.kind !== 'owner' || !sameOwner(moved.owner, held.owner)) {
        try {
          fs.link(stale, lockPath);
        } catch (error) {
          warnings.push(
            `could not restore another import's lock (${describeFsError(error)})`,
          );
        }
        removeQuietly(fs, stale, warnings);
        return {
          issue: importIssue('IMPORT_IN_PROGRESS', LOCK_HELD),
          warnings,
        };
      }
      removeQuietly(fs, stale, warnings);
    }
    return { issue: importIssue('IMPORT_IN_PROGRESS', LOCK_HELD), warnings };
  } finally {
    removeQuietly(fs, claim, warnings);
  }
}

/**
 * Release the lock if it is still this import's.
 *
 * @param lock - The held lock
 * @param env - Environment
 * @returns Warnings
 */
export function releaseImportLock(lock: ImportLock, env: ImportEnv): string[] {
  const lockPath = join(lock.root, LOCK_NAME);
  const held = readOwner(env.fs, lockPath);
  if (held.kind !== 'owner' || !sameOwner(held.owner, lock.owner)) {
    return ['the import lock was no longer this import’s and was left alone'];
  }
  const warnings: string[] = [];
  try {
    env.fs.unlink(lockPath);
  } catch (error) {
    warnings.push(
      `the import lock could not be removed (${describeFsError(error)}); the next import will take it over`,
    );
  }
  return warnings;
}

/**
 * With the lock held, remove what interrupted imports left behind: lock
 * claims, moved-aside stale locks and finished transaction directories.
 *
 * @param root - Resolved work-log directory
 * @param env - Environment
 * @returns Warnings
 */
export function removeLeftovers(root: string, env: ImportEnv): string[] {
  const { fs } = env;
  const warnings: string[] = [];
  let names: string[];
  try {
    names = fs.readdir(root);
  } catch (error) {
    return [`could not list the work log (${describeFsError(error)})`];
  }
  for (const name of names) {
    const lockFile =
      name.startsWith(CLAIM_PREFIX) || name.startsWith(STALE_PREFIX);
    const done = name.startsWith(DONE_PREFIX);
    if (!lockFile && !done) continue;
    const path = join(root, name);
    try {
      const entry = fs.lstat(path);
      if (done && entry.kind === 'directory') fs.removeTree(path);
      else if (entry.kind === 'file' || entry.kind === 'symlink')
        fs.unlink(path);
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') {
        warnings.push(
          `could not remove ${name} (${describeFsError(error)}); a later import will retry`,
        );
      }
    }
  }
  return warnings;
}

/**
 * For `validate`: report an import that is running or needs recovery,
 * without changing anything.
 *
 * @param root - Resolved work-log directory
 * @param env - Environment
 */
export function inspectImportState(
  root: string,
  env: ImportEnv,
): ImportIssue | null {
  const held = readOwner(env.fs, join(root, LOCK_NAME));
  if (
    held.kind === 'unreadable' ||
    (held.kind === 'owner' && ownerIsAlive(held.owner, env))
  ) {
    return importIssue('IMPORT_IN_PROGRESS', LOCK_HELD);
  }
  try {
    env.fs.lstat(join(root, TRANSACTION_NAME));
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
  }
  return importIssue(
    'RECOVERY_REQUIRED',
    'an earlier import was interrupted; run import to recover it before relying on this result',
  );
}

// ---------------------------------------------------------------------------
// Journal and transaction directory

function writeJournal(fs: ImportFs, txn: string, journal: Journal): void {
  const tmp = join(txn, JOURNAL_TMP);
  try {
    fs.unlink(tmp);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
  fs.writeFile(tmp, Buffer.from(JSON.stringify(journal)));
  fs.rename(tmp, join(txn, JOURNAL));
  fs.syncDirectory(txn);
}

/** Where the final journal write left the transaction, judged from disk */
type CommitRecord =
  | { state: 'committed' }
  | { state: 'not-committed'; error: unknown }
  | { state: 'unknown'; error: unknown };

/**
 * Write the journal's final `committed` state.
 *
 * What happens next must follow the journal on disk, never the intent: once
 * `journal.json` says `committed`, a later recovery treats the batch as
 * stored, so this import must not roll anything back. Every record is
 * already stored and verified by then, so a failure to flush the directory
 * afterwards is only a warning. If the rename itself fails, the journal is
 * read back to learn which state is on disk.
 */
function writeCommittedJournal(
  fs: ImportFs,
  txn: string,
  journal: Journal,
  warnings: string[],
): CommitRecord {
  const tmp = join(txn, JOURNAL_TMP);
  try {
    try {
      fs.unlink(tmp);
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
    }
    fs.writeFile(
      tmp,
      Buffer.from(JSON.stringify({ ...journal, state: 'committed' })),
    );
  } catch (error) {
    // journal.json was not touched: it still says `committing`
    return { state: 'not-committed', error };
  }
  try {
    fs.rename(tmp, join(txn, JOURNAL));
  } catch (error) {
    const onDisk = readJournal(fs, txn);
    if (!('journal' in onDisk) || onDisk.journal.batchId !== journal.batchId) {
      return { state: 'unknown', error };
    }
    if (onDisk.journal.state === 'committing') {
      return { state: 'not-committed', error };
    }
    if (onDisk.journal.state !== 'committed')
      return { state: 'unknown', error };
  }
  try {
    fs.syncDirectory(txn);
  } catch (error) {
    warnings.push(
      `the import's completion record could not be flushed to disk (${describeFsError(error)}); every record is stored`,
    );
  }
  return { state: 'committed' };
}

function readJournal(
  fs: ImportFs,
  txn: string,
): { journal: Journal } | { missing: true } | { invalid: true } {
  let data: Buffer;
  try {
    data = fs.readFile(join(txn, JOURNAL), JOURNAL_MAX_BYTES).data;
  } catch (error) {
    return errorCode(error) === 'ENOENT'
      ? { missing: true }
      : { invalid: true };
  }
  try {
    const parsed = JournalSchema.safeParse(JSON.parse(data.toString('utf-8')));
    return parsed.success ? { journal: parsed.data } : { invalid: true };
  } catch {
    return { invalid: true };
  }
}

/** Write a file and prove it holds exactly what was meant */
function writeVerified(
  fs: ImportFs,
  path: string,
  data: Buffer,
  hash: string,
): void {
  fs.writeFile(path, data);
  if (sha256(fs.readFile(path, MAX_STORED_BYTES).data) !== hash) {
    throw codedError('EVERIFY');
  }
}

/**
 * Remove a finished transaction directory: first move it aside (one atomic
 * step, after which it is no longer pending), then delete it.
 */
function discardTransaction(
  fs: ImportFs,
  txn: string,
  env: ImportEnv,
  warnings: string[],
): void {
  const done = join(dirname(txn), `${DONE_PREFIX}${env.randomId()}`);
  try {
    fs.rename(txn, done);
  } catch (error) {
    warnings.push(
      `import bookkeeping (${TRANSACTION_NAME}) could not be removed (${describeFsError(error)}); the next import will finish it`,
    );
    return;
  }
  try {
    fs.removeTree(done);
  } catch (error) {
    warnings.push(
      `${basename(done)} could not be removed (${describeFsError(error)}); the next import will remove it`,
    );
  }
}

// ---------------------------------------------------------------------------
// Rollback

type DestinationState = 'absent' | 'unsafe' | { hash: string };

/** A destination's contents, judged without following any symlink */
function destinationState(
  fs: ImportFs,
  root: string,
  segments: string[],
): DestinationState {
  for (let depth = 1; depth <= segments.length; depth++) {
    let entry;
    try {
      entry = fs.lstat(join(root, ...segments.slice(0, depth)));
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return 'absent';
      throw error;
    }
    const expected = depth === segments.length ? 'file' : 'directory';
    if (entry.kind !== expected) return 'unsafe';
  }
  try {
    return {
      hash: sha256(fs.readFile(join(root, ...segments), MAX_STORED_BYTES).data),
    };
  } catch (error) {
    const code = errorCode(error);
    if (code === 'ENOENT') return 'absent';
    if (code === 'ELOOP' || code === 'ENOTREG' || code === 'EFBIG') {
      return 'unsafe';
    }
    throw error;
  }
}

const hashOf = (state: DestinationState) =>
  typeof state === 'object' ? state.hash : undefined;

/**
 * Put every record of a journal back to its state before the batch, judging
 * each by its contents. Returns the issues for records that could not be
 * restored; none means the rollback is complete.
 */
function rollBack(
  fs: ImportFs,
  root: string,
  txn: string,
  journal: Journal,
  attempted: (index: number) => boolean,
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  for (let index = journal.operations.length - 1; index >= 0; index--) {
    const op = journal.operations[index];
    // Operations never started cannot need undoing
    if (!op || !attempted(index)) continue;
    const destination = displayPath(op.destination);
    const dest = join(root, ...op.destination);
    try {
      const state = destinationState(fs, root, op.destination);
      const hash = hashOf(state);
      if (op.action === 'create') {
        if (state === 'absent') continue;
        if (hash === op.newHash) {
          fs.unlink(dest);
          fs.syncDirectory(dirname(dest));
          continue;
        }
      } else {
        if (hash !== undefined && hash === op.oldHash) continue;
        if (hash === op.newHash && op.backup !== null) {
          const backupPath = join(txn, BACKUP_DIR, op.backup);
          const backup = fs.readFile(backupPath, MAX_STORED_BYTES);
          if (sha256(backup.data) === op.oldHash) {
            fs.rename(backupPath, dest);
            fs.syncDirectory(dirname(dest));
            if (
              hashOf(destinationState(fs, root, op.destination)) === op.oldHash
            ) {
              continue;
            }
          }
        }
      }
      issues.push(
        importIssue(
          'RECOVERY_CONFLICT',
          `this record was changed by something other than this import, so it was left as it is; the previous version and the journal are kept in ${TRANSACTION_NAME}`,
          { destination },
        ),
      );
    } catch (error) {
      issues.push(
        importIssue(
          'ROLLBACK_INCOMPLETE',
          `this record could not be restored yet (${describeFsError(error)}); the next import will retry`,
          { destination },
        ),
      );
    }
  }
  issues.push(...removeCreatedDirectories(fs, root, journal));
  return issues;
}

/** Remove directories the batch created, if they are still empty */
function removeCreatedDirectories(
  fs: ImportFs,
  root: string,
  journal: Journal,
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  for (const segments of [...journal.createdDirectories].reverse()) {
    try {
      fs.rmdir(join(root, ...segments));
    } catch (error) {
      const code = errorCode(error);
      // Gone already, or now holding something that is not ours to remove
      if (
        code === 'ENOENT' ||
        code === 'ENOTEMPTY' ||
        code === 'EEXIST' ||
        code === 'ENOTDIR'
      ) {
        continue;
      }
      issues.push(
        importIssue(
          'ROLLBACK_INCOMPLETE',
          `a directory the import created could not be removed yet (${describeFsError(error)}); the next import will retry`,
          { destination: displayPath(segments) },
        ),
      );
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Recovery

/** Whether an operation may have been applied; unsure counts as yes */
function markerMayExist(fs: ImportFs, txn: string, index: number): boolean {
  try {
    fs.lstat(join(txn, APPLYING_DIR, String(index)));
    return true;
  } catch (error) {
    return errorCode(error) !== 'ENOENT';
  }
}

/** What happened to an import that was interrupted */
export interface RecoveryReport {
  batchId: string | null;
  /**
   * `discarded`: it had not changed any record. `rolled-back`: its changes
   * were undone, so none of its records were kept. `completed`: it had
   * stored and verified every record before it stopped.
   */
  outcome: 'discarded' | 'rolled-back' | 'completed';
  /** Records the interrupted batch would have created or updated */
  records: number;
}

/**
 * With the lock held, finish any interrupted import so the work log holds a
 * whole batch: discard a prepared one, roll back one that was committing,
 * and clean up one that had committed.
 *
 * @param root - Resolved work-log directory
 * @param env - Environment
 */
export function recoverInterruptedImport(
  root: string,
  env: ImportEnv,
): {
  report: RecoveryReport | null;
  issues: ImportIssue[];
  warnings: string[];
} {
  const { fs } = env;
  const warnings: string[] = [];
  const txn = join(root, TRANSACTION_NAME);
  const conflict = (message: string) => ({
    report: null,
    issues: [importIssue('RECOVERY_CONFLICT', message)],
    warnings,
  });

  try {
    if (fs.lstat(txn).kind !== 'directory') {
      return conflict(
        `${TRANSACTION_NAME} is not a directory; remove it if no import is running`,
      );
    }
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return { report: null, issues: [], warnings };
    }
    return conflict(
      `${TRANSACTION_NAME} could not be checked (${describeFsError(error)})`,
    );
  }

  const read = readJournal(fs, txn);
  if ('invalid' in read) {
    return conflict(
      `the journal of an interrupted import could not be read, so it was left in ${TRANSACTION_NAME}`,
    );
  }
  if ('missing' in read) {
    // Interrupted while preparing: nothing in the work log changed
    discardTransaction(fs, txn, env, warnings);
    return {
      report: { batchId: null, outcome: 'discarded', records: 0 },
      issues: [],
      warnings,
    };
  }

  const { journal } = read;
  const report = (outcome: RecoveryReport['outcome']): RecoveryReport => ({
    batchId: journal.batchId,
    outcome,
    records: journal.operations.length,
  });

  if (journal.state === 'committed') {
    // Only a batch whose every record holds its new version is completed
    const unverified = journal.operations.filter((op) => {
      try {
        return (
          hashOf(destinationState(fs, root, op.destination)) !== op.newHash
        );
      } catch {
        return true;
      }
    });
    if (unverified.length > 0) {
      return {
        report: null,
        issues: unverified.map((op) =>
          importIssue(
            'RECOVERY_CONFLICT',
            `an interrupted import was recorded as complete, but this record does not hold its new version; it was left as it is, and the previous version and the journal are kept in ${TRANSACTION_NAME}`,
            { destination: displayPath(op.destination) },
          ),
        ),
        warnings,
      };
    }
    discardTransaction(fs, txn, env, warnings);
    return { report: report('completed'), issues: [], warnings };
  }

  // `prepared`: no record was touched, only directories may exist.
  // `committing`: some records may be stored; undo them.
  const issues =
    journal.state === 'prepared'
      ? removeCreatedDirectories(fs, root, journal)
      : rollBack(fs, root, txn, journal, (index) =>
          markerMayExist(fs, txn, index),
        );
  if (issues.length > 0) return { report: null, issues, warnings };
  discardTransaction(fs, txn, env, warnings);
  return {
    report: report(journal.state === 'prepared' ? 'discarded' : 'rolled-back'),
    issues: [],
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Commit

function verifyRoot(plan: ImportPlan, fs: ImportFs): void {
  try {
    const entry = fs.lstat(plan.root);
    if (
      fs.realpath(plan.root) !== plan.root ||
      entry.kind !== 'directory' ||
      entry.dev !== plan.rootId.dev ||
      entry.ino !== plan.rootId.ino
    ) {
      throw new ChangedError();
    }
  } catch (error) {
    if (error instanceof ChangedError || errorCode(error) === 'ENOENT') {
      throw new ChangedError();
    }
    throw error;
  }
}

function verifyDirectories(
  plan: ImportPlan,
  created: Map<string, FileId>,
  fs: ImportFs,
): void {
  for (const dir of plan.directories) {
    const key = displayPath(dir.segments);
    const expected = dir.existing ?? created.get(key);
    let entry;
    try {
      entry = fs.lstat(join(plan.root, ...dir.segments));
    } catch (error) {
      if (errorCode(error) === 'ENOENT') throw new ChangedError(key);
      throw error;
    }
    if (
      entry.kind !== 'directory' ||
      !expected ||
      entry.dev !== expected.dev ||
      entry.ino !== expected.ino
    ) {
      throw new ChangedError(key);
    }
  }
}

/** The destination must still be exactly what was planned */
function verifyDestination(
  plan: ImportPlan,
  record: PlannedRecord,
  fs: ImportFs,
): void {
  const destination = displayPath(record.segments);
  const path = join(plan.root, ...record.segments);
  let entry;
  try {
    entry = fs.lstat(path);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
    if (record.existing === null) return;
    throw new ChangedError(destination);
  }
  const existing = record.existing;
  if (
    existing === null ||
    entry.kind !== 'file' ||
    entry.dev !== existing.dev ||
    entry.ino !== existing.ino
  ) {
    throw new ChangedError(destination);
  }
  let read;
  try {
    read = fs.readFile(path, MAX_STORED_BYTES);
  } catch (error) {
    const code = errorCode(error);
    if (code === 'ENOENT' || code === 'ELOOP' || code === 'ENOTREG') {
      throw new ChangedError(destination);
    }
    throw error;
  }
  if (
    read.dev !== existing.dev ||
    read.ino !== existing.ino ||
    sha256(read.data) !== existing.hash
  ) {
    throw new ChangedError(destination);
  }
}

function failureIssue(error: unknown, rolledBack: boolean): ImportIssue {
  const outcome = rolledBack
    ? 'no records were changed'
    : 'restoring the previous records is not finished';
  if (error instanceof ChangedError) {
    return importIssue(
      'CHANGED_DURING_IMPORT',
      `the work log changed while the batch was being stored; ${outcome}`,
      error.destination ? { destination: error.destination } : {},
    );
  }
  return importIssue(
    'COMMIT_FAILED',
    `the batch could not be stored (${describeFsError(error)}); ${outcome}`,
  );
}

/**
 * Store a planned batch atomically. Call with the import lock held and after
 * recovery.
 *
 * @param plan - Verified plan
 * @param env - Environment
 * @param batchId - Batch ID (recorded in the journal)
 * @returns Whether every record was stored, with issues and warnings
 */
export function commitImportPlan(
  plan: ImportPlan,
  env: ImportEnv,
  batchId: string,
): { ok: boolean; issues: ImportIssue[]; warnings: string[] } {
  const { fs } = env;
  const warnings: string[] = [];
  const records = plan.records.filter((r) => r.action !== 'unchanged');
  if (records.length === 0) return { ok: true, issues: [], warnings };

  const txn = join(plan.root, TRANSACTION_NAME);
  const journal: Journal = {
    version: 1,
    batchId,
    state: 'prepared',
    createdDirectories: plan.directories
      .filter((d) => d.existing === null)
      .map((d) => d.segments),
    operations: records.map((r, i) => ({
      destination: r.segments,
      action: r.action === 'create' ? 'create' : 'update',
      staged: `${i}.md`,
      backup: r.existing ? `${i}.md` : null,
      oldHash: r.existing?.hash ?? null,
      newHash: r.hash,
    })),
  };

  // 1. Prepare. Nothing in the work log changes.
  try {
    verifyRoot(plan, fs);
    fs.mkdir(txn);
  } catch (error) {
    return { ok: false, issues: [failureIssue(error, true)], warnings };
  }
  try {
    fs.mkdir(join(txn, STAGED_DIR));
    fs.mkdir(join(txn, BACKUP_DIR));
    fs.mkdir(join(txn, APPLYING_DIR));
    records.forEach((r, i) => {
      writeVerified(fs, join(txn, STAGED_DIR, `${i}.md`), r.content, r.hash);
      if (r.existing) {
        writeVerified(
          fs,
          join(txn, BACKUP_DIR, `${i}.md`),
          r.existing.content,
          r.existing.hash,
        );
      }
    });
    fs.syncDirectory(join(txn, STAGED_DIR));
    fs.syncDirectory(join(txn, BACKUP_DIR));
    writeJournal(fs, txn, journal);
  } catch (error) {
    discardTransaction(fs, txn, env, warnings);
    return { ok: false, issues: [failureIssue(error, true)], warnings };
  }

  // 2. Commit, re-checking everything before each change.
  let attempted = 0;
  try {
    verifyRoot(plan, fs);
    const created = new Map<string, FileId>();
    for (const segments of journal.createdDirectories) {
      const path = join(plan.root, ...segments);
      try {
        fs.mkdir(path);
      } catch (error) {
        if (errorCode(error) !== 'EEXIST') throw error;
      }
      const entry = fs.lstat(path);
      if (entry.kind !== 'directory') {
        throw new ChangedError(displayPath(segments));
      }
      created.set(displayPath(segments), { dev: entry.dev, ino: entry.ino });
      fs.syncDirectory(dirname(path));
    }
    journal.state = 'committing';
    writeJournal(fs, txn, journal);

    records.forEach((record, i) => {
      verifyRoot(plan, fs);
      verifyDirectories(plan, created, fs);
      verifyDestination(plan, record, fs);
      const dest = join(plan.root, ...record.segments);
      const staged = join(txn, STAGED_DIR, `${i}.md`);
      fs.writeFile(join(txn, APPLYING_DIR, String(i)), Buffer.alloc(0));
      fs.syncDirectory(join(txn, APPLYING_DIR));
      attempted = i + 1;
      if (record.existing === null) {
        try {
          fs.link(staged, dest);
        } catch (error) {
          if (errorCode(error) === 'EEXIST') {
            throw new ChangedError(displayPath(record.segments));
          }
          throw error;
        }
      } else {
        fs.rename(staged, dest);
      }
      fs.syncDirectory(dirname(dest));
      if (sha256(fs.readFile(dest, MAX_STORED_BYTES).data) !== record.hash) {
        throw new ChangedError(displayPath(record.segments));
      }
    });
  } catch (error) {
    // The journal on disk says `prepared` or `committing`: undo
    return undo(error);
  }

  // 3. Record the batch as stored. From here the journal on disk decides.
  const record = writeCommittedJournal(fs, txn, journal, warnings);
  if (record.state === 'not-committed') return undo(record.error);
  if (record.state === 'unknown') {
    return {
      ok: false,
      issues: [
        importIssue(
          'ROLLBACK_INCOMPLETE',
          `whether the batch was recorded as stored could not be confirmed (${describeFsError(record.error)}); nothing was undone, and the next import will finish or undo it`,
        ),
      ],
      warnings,
    };
  }

  // Done: the batch is stored. Leftover bookkeeping is only a warning.
  discardTransaction(fs, txn, env, warnings);
  return { ok: true, issues: [], warnings };

  /** Roll back the records this import may have changed */
  function undo(error: unknown) {
    const unrestored = rollBack(
      fs,
      plan.root,
      txn,
      journal,
      (index) => index < attempted,
    );
    if (unrestored.length > 0) {
      return {
        ok: false,
        issues: [failureIssue(error, false), ...unrestored],
        warnings,
      };
    }
    discardTransaction(fs, txn, env, warnings);
    return { ok: false, issues: [failureIssue(error, true)], warnings };
  }
}
