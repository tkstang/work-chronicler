import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';

import {
  IMPORT_TRANSACTION_DIRECTORY,
  IMPORTED_RECORD_DIRECTORIES,
} from '@storage/paths';
import {
  acquireWorkLogLock,
  describeOwner,
  holderCommand,
  IMPORT_LOCK,
  type LockAcquisition,
  type LockFs,
  type LockOwner,
  ownerIsAlive,
  readLockState,
} from '@storage/work-log-lock';
import { IMPORT_SOURCES } from '@wc-types/imported-record';
import { z } from 'zod';

import {
  codedError,
  entryAt,
  errorCode,
  type ImportEnv,
  type ImportFs,
} from './import-fs';
import { describeFsError, type ImportIssue, importIssue } from './issues';
import {
  displayPath,
  type FileId,
  type ImportPlan,
  type PlannedRecord,
  resolveWorkLogRoot,
  sha256,
} from './plan';
import { MAX_STORED_BYTES } from './staging';

/**
 * Batch commit and recovery.
 *
 * An import runs under the work-log lock it shares with `filter` (see
 * `@storage/work-log-lock`: a directory renamed into place complete with its
 * owner's process, host, boot and run, under `.import-lock` and then
 * `.filter-lock`), so one import or filter runs per work log at a time. A
 * batch is committed through a write-ahead journal in `.import-transaction/`:
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

/** The work-log lock name every import holds (it takes `.filter-lock` too) */
export const LOCK_NAME = IMPORT_LOCK;
export const TRANSACTION_NAME = IMPORT_TRANSACTION_DIRECTORY;
const DONE_PREFIX = `${TRANSACTION_NAME}.done-`;
const JOURNAL = 'journal.json';
const JOURNAL_TMP = 'journal.json.tmp';
const STAGED_DIR = 'staged';
const BACKUP_DIR = 'backup';
/** One empty marker per operation, written just before it is applied */
const APPLYING_DIR = 'applying';
/** New work-log directories, made here and then moved into place */
const DIRS_DIR = 'dirs';
const FOLDERS = [STAGED_DIR, BACKUP_DIR, APPLYING_DIR, DIRS_DIR] as const;
const OWNER_MAX_BYTES = 4096;
const JOURNAL_MAX_BYTES = 32 * 1024 * 1024;

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
/** A directory's identity (device and inode) as decimal strings */
const IdSchema = z.strictObject({
  dev: z.string().regex(/^\d+$/),
  ino: z.string().regex(/^\d+$/),
});
type Id = z.infer<typeof IdSchema>;

const JournalSchema = z.strictObject({
  version: z.literal(3),
  batchId: z.string(),
  state: z.enum(['prepared', 'committing', 'committed']),
  /** The work log, the transaction directory and each of its folders */
  root: IdSchema,
  transaction: IdSchema,
  folders: z.strictObject({
    staged: IdSchema,
    backup: IdSchema,
    applying: IdSchema,
    dirs: IdSchema,
  }),
  /**
   * Every work-log directory on the way to a destination, with its identity.
   * `created` is where in `dirs/` this import made it (`0`, or `0/slack`
   * inside another new one) when it is new; only such a directory may be
   * removed on rollback.
   */
  directories: z.array(
    z.strictObject({
      segments: z.array(z.string()).refine(isRecordDirectory),
      id: IdSchema,
      created: z
        .string()
        .regex(/^\d+(?:\/[a-z0-9-]+)*$/)
        .nullable(),
    }),
  ),
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
  readonly code = 'ECHANGED';
  constructor(readonly destination?: string) {
    super('changed');
  }
}

function toId(id: FileId): Id {
  return { dev: String(id.dev), ino: String(id.ino) };
}

function hasId(entry: FileId, id: Id): boolean {
  return String(entry.dev) === id.dev && String(entry.ino) === id.ino;
}

/**
 * The only way this module changes the filesystem, and the only place that
 * checks the directories on the way to a path.
 *
 * A guard knows the identity of every directory it vouches for: the work
 * log, the transaction directory, its folders and the directories a batch
 * uses (at both their staged and their final paths). Before any change it
 * checks every directory from the work log down to the target's parent:
 * each must be a real directory (never a link) holding its recorded
 * identity. A directory it cannot vouch for refuses the change with
 * {@link ChangedError}, so no call site can skip a component on the way.
 * Reads that must not pass through a substituted directory use
 * {@link PathGuard.reach} the same way.
 */
class PathGuard {
  private readonly known = new Map<string, Id>();

  constructor(
    /** For reads only; every change goes through the guard's methods */
    readonly fs: ImportFs,
    readonly root: string,
    rootId: Id,
  ) {
    this.known.set(root, rootId);
  }

  /** A guard for the work log as it is now (for the lock and leftovers) */
  static atRoot(fs: ImportFs, root: string): PathGuard {
    const entry = fs.lstat(root);
    if (entry.kind !== 'directory') throw new ChangedError();
    return new PathGuard(fs, root, toId(entry));
  }

  /**
   * A guard for reading below a work log that nothing has vouched for (the
   * imported-record readers). The work log's own path is trusted as given
   * (configured paths may pass through links); every directory below it is
   * vouched for as {@link PathGuard.learn} first finds it. It makes no
   * changes: any it is asked for fails with EROFS.
   */
  static forReading(lstat: ImportFs['lstat'], root: string): PathGuard {
    const refuse = (): never => {
      throw codedError('EROFS');
    };
    const fs: ImportFs = {
      realpath: refuse,
      lstat,
      readdir: refuse,
      readFile: refuse,
      writeFile: refuse,
      mkdir: refuse,
      rename: refuse,
      link: refuse,
      unlink: refuse,
      rmdir: refuse,
      removeTree: refuse,
      syncDirectory: refuse,
    };
    return new PathGuard(fs, root, { dev: '', ino: '' });
  }

  /** A guard for everything a journal recorded */
  static forJournal(fs: ImportFs, root: string, journal: Journal): PathGuard {
    const guard = new PathGuard(fs, root, journal.root);
    const txn = join(root, TRANSACTION_NAME);
    guard.vouch(txn, journal.transaction);
    for (const folder of FOLDERS) {
      guard.vouch(join(txn, folder), journal.folders[folder]);
    }
    for (const dir of journal.directories) {
      guard.vouch(join(root, ...dir.segments), dir.id);
      if (dir.created !== null) {
        guard.vouch(stagedDirectory(txn, dir.created), dir.id);
      }
    }
    return guard;
  }

  /** Record that `path` is the directory with this identity */
  vouch(path: string, id: Id): void {
    this.known.set(path, id);
  }

  /** Check every directory from the work log down to `dir` itself */
  check(dir: string): void {
    const paths = this.below(dir);
    this.expect(this.root, '.');
    for (const current of paths) {
      this.expect(current, this.display(current));
    }
  }

  /**
   * The work log must still be where it was resolved to (no symlinked
   * directory above it) and the directory with its recorded identity.
   * Throws {@link ChangedError} without a destination otherwise.
   */
  checkRoot(): void {
    try {
      const entry = this.fs.lstat(this.root);
      const id = this.known.get(this.root);
      if (
        this.fs.realpath(this.root) !== this.root ||
        entry.kind !== 'directory' ||
        !id ||
        !hasId(entry, id)
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

  /**
   * Check one directory the guard vouches for, at `path` itself (its
   * ancestors are checked separately, by {@link PathGuard.check} or
   * {@link PathGuard.reach}).
   */
  checkAt(path: string): void {
    this.expect(path, this.display(path));
  }

  /**
   * For reading through the work log: check every directory below it down
   * to `dir` itself, from the top, as {@link PathGuard.check} does, except
   * that one that is absent ends the walk, so nothing below it exists
   * (returns false). The work log itself must be a directory; its identity
   * is checked before any change by {@link PathGuard.check}.
   */
  reach(dir: string): boolean {
    if (this.fs.lstat(this.root).kind !== 'directory') {
      throw new ChangedError();
    }
    return this.walk(dir, false);
  }

  /**
   * For reading through a work log nothing has vouched for: the same walk as
   * {@link PathGuard.reach} below the work log, except that a real directory
   * the guard does not know yet is vouched for as found. A symlink or
   * anything else that is not a directory throws {@link ChangedError}
   * naming it; an absent one ends the walk (returns false).
   */
  learn(dir: string): boolean {
    return this.walk(dir, true);
  }

  private walk(dir: string, learn: boolean): boolean {
    for (const current of this.below(dir)) {
      const where = this.display(current);
      let entry;
      try {
        entry = this.fs.lstat(current);
      } catch (error) {
        if (errorCode(error) === 'ENOENT') return false;
        throw error;
      }
      if (learn && entry.kind === 'directory' && !this.known.has(current)) {
        this.vouch(current, toId(entry));
      }
      const id = this.known.get(current);
      if (entry.kind !== 'directory' || !id || !hasId(entry, id)) {
        throw new ChangedError(where);
      }
    }
    return true;
  }

  /** A path below the work log as reported in issues: `/`-separated on every platform */
  private display(path: string): string {
    return relative(this.root, path).split(sep).join('/');
  }

  /** Each directory from just below the work log down to `dir` itself */
  private below(dir: string): string[] {
    const rel = relative(this.root, dir);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new ChangedError(rel);
    if (rel === '') return [];
    const paths: string[] = [];
    let current = this.root;
    // `rel` is built from this module's own joins, never from input text
    for (const part of rel.split(sep)) {
      current = join(current, part);
      paths.push(current);
    }
    return paths;
  }

  /**
   * Require a real directory (never a symlink) with its vouched identity at
   * `path`. Anything else, including its absence, means the path is not the
   * one the import recorded.
   */
  private expect(path: string, where: string): void {
    const id = this.known.get(path);
    if (!id) throw new ChangedError(where);
    let entry;
    try {
      entry = this.fs.lstat(path);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') throw new ChangedError(where);
      throw error;
    }
    if (entry.kind !== 'directory' || !hasId(entry, id)) {
      throw new ChangedError(where);
    }
  }

  /** Make a directory below a vouched one and vouch for it */
  mkdir(path: string): Id {
    this.check(dirname(path));
    this.fs.mkdir(path);
    const entry = this.fs.lstat(path);
    if (entry.kind !== 'directory') throw new ChangedError(path);
    const id = toId(entry);
    this.vouch(path, id);
    return id;
  }

  writeFile(path: string, data: Uint8Array): void {
    this.check(dirname(path));
    this.fs.writeFile(path, data);
  }

  rename(from: string, to: string): void {
    this.check(dirname(from));
    this.check(dirname(to));
    this.fs.rename(from, to);
  }

  link(from: string, to: string): void {
    this.check(dirname(from));
    this.check(dirname(to));
    this.fs.link(from, to);
  }

  unlink(path: string): void {
    this.check(dirname(path));
    this.fs.unlink(path);
  }

  /** Remove an empty directory, only one the guard vouches for */
  rmdir(path: string): void {
    this.check(path);
    this.fs.rmdir(path);
  }

  /**
   * Remove a directory tree below a vouched directory. The tree itself must
   * be a real directory, with identity `id` when one is known.
   */
  removeTree(path: string, id?: Id): void {
    this.check(dirname(path));
    const entry = this.fs.lstat(path);
    if (entry.kind !== 'directory' || (id && !hasId(entry, id))) {
      throw new ChangedError(basename(path));
    }
    this.fs.removeTree(path);
  }
}

/**
 * For readers of imported records: whether `dir`, below the work log `root`,
 * can be listed as the work log's own. It is checked by the same
 * {@link PathGuard} walk every import change uses: each directory from just
 * below `root` down to `dir` must be a real directory, never a symlink (a
 * linked `messages/slack/` would read another work log's records). `root`
 * itself is trusted as given.
 *
 * @param lstat - What is at a path, not following a final symlink
 * @param root - The work log (or a `filtered/` subset)
 * @param dir - A directory below it
 * @returns False when a directory on the way is absent (nothing below it
 *   exists)
 * @throws An error with code `ECHANGED` and, in `destination`, the
 *   `/`-separated path below `root` of the first directory that is a symlink
 *   or not a directory; any other filesystem error as it was raised
 */
export function reachBelowWorkLog(
  lstat: ImportFs['lstat'],
  root: string,
  dir: string,
): boolean {
  return PathGuard.forReading(lstat, root).learn(dir);
}

// ---------------------------------------------------------------------------
// Lock

/** The lock an import holds while it runs */
export interface ImportLock {
  root: string;
  /** Release the lock; returns any warnings */
  release: () => string[];
}

const LOCK_HELD =
  'another import is running in this work log (or was started on another machine); try again when it finishes';

/** Why the work-log lock is held, by the command holding it */
function lockHeldBy(name: string, owner: LockOwner): string {
  return holderCommand(name, owner) === 'filter'
    ? `a \`work-chronicler filter\` run (${describeOwner(owner)}) holds the work-log lock (${name}); try again when it finishes`
    : LOCK_HELD;
}

/**
 * The shared work-log lock's filesystem for import: every change goes
 * through the path guard, so the lock and its claims are made, moved and
 * removed only directly below the work log it vouches for.
 */
function lockFsFor(guard: PathGuard): LockFs {
  const { fs } = guard;
  return {
    readFile: (path) => fs.readFile(path, OWNER_MAX_BYTES).data,
    readdir: (path) => fs.readdir(path),
    mtimeMs: (path) => fs.lstat(path).mtimeMs,
    exists: (path) => entryAt(fs, path) !== null,
    mkdir: (path) => {
      try {
        guard.mkdir(path);
      } catch (error) {
        // The directory may exist although its check failed; claim names
        // are unique to this run, so it is ours to remove
        if (errorCode(error) !== 'EEXIST') {
          try {
            guard.removeTree(path);
          } catch {
            // Left for a later run's leftover cleanup
          }
        }
        throw error;
      }
    },
    writeFile: (path, contents) => guard.writeFile(path, Buffer.from(contents)),
    rename: (from, to) => guard.rename(from, to),
    rm: (path) => guard.removeTree(path),
  };
}

/**
 * Take the work-log lock for an import (`.import-lock`, then `.filter-lock`;
 * see `@storage/work-log-lock`), shared with `filter`. A lock whose owner is
 * provably gone is taken over, one run at a time, under `<lock>.takeover`;
 * a live owner's lock is never moved.
 *
 * @param root - Resolved work-log directory
 * @param env - Environment
 * @param batchId - ID of the batch being imported (the lock's run ID)
 */
export function acquireImportLock(
  root: string,
  env: ImportEnv,
  batchId: string,
): { lock?: ImportLock; issue?: ImportIssue; warnings: string[] } {
  const warnings: string[] = [];
  const lockFailed = (error: unknown) =>
    importIssue(
      'COMMIT_FAILED',
      `the import lock could not be created (${describeFsError(error)}); nothing was changed`,
    );
  const inProgress = (message: string) => ({
    issue: importIssue('IMPORT_IN_PROGRESS', message),
    warnings,
  });

  let acquired: LockAcquisition;
  try {
    acquired = acquireWorkLogLock({
      fs: lockFsFor(PathGuard.atRoot(env.fs, root)),
      env,
      dir: root,
      command: 'import',
      runId: batchId,
    });
  } catch (error) {
    return { issue: lockFailed(error), warnings };
  }
  if (acquired.held) {
    return { lock: { root, release: acquired.release }, warnings };
  }
  warnings.push(...acquired.warnings);
  const { name } = acquired;
  switch (acquired.reason) {
    case 'held':
      return inProgress(
        acquired.owner
          ? lockHeldBy(name, acquired.owner)
          : `the work-log lock (${name}) exists but could not be read; if no import or filter is running, remove it`,
      );
    case 'takeover-abandoned':
      return inProgress(
        `a \`work-chronicler ${holderCommand(name, acquired.taker)}\` run (${describeOwner(acquired.taker)}) exited while taking over a lock left by an earlier run, and left ${name}.takeover behind; if no import or filter is running, remove it and try again`,
      );
    case 'takeover-busy':
      return inProgress(
        'another run is taking over a lock left by a run that has exited; try again in a moment',
      );
    default:
      return inProgress(
        acquired.owner ? lockHeldBy(name, acquired.owner) : LOCK_HELD,
      );
  }
}

/**
 * Release the lock if it is still this import's.
 *
 * @param lock - The held lock
 * @returns Warnings
 */
export function releaseImportLock(lock: ImportLock): string[] {
  try {
    return lock.release();
  } catch (error) {
    return [
      `the import lock could not be removed (${describeFsError(error)}); the next import will take it over`,
    ];
  }
}

/**
 * With the lock held, remove finished transaction directories that
 * interrupted imports left behind. (The lock removes its own leftovers.)
 *
 * @param root - Resolved work-log directory
 * @param env - Environment
 * @returns Warnings
 */
export function removeLeftovers(root: string, env: ImportEnv): string[] {
  const { fs } = env;
  const warnings: string[] = [];
  let names: string[];
  let guard: PathGuard;
  try {
    guard = PathGuard.atRoot(fs, root);
    names = fs.readdir(root);
  } catch (error) {
    return [`could not list the work log (${describeFsError(error)})`];
  }
  for (const name of names) {
    if (!name.startsWith(DONE_PREFIX)) continue;
    const path = join(root, name);
    try {
      if (fs.lstat(path).kind === 'directory') guard.removeTree(path);
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
  // Every import holds `.import-lock`. A filter holding it changes records
  // only while finishing an interrupted import, and `.import-transaction/`
  // exists throughout (reported below as RECOVERY_REQUIRED), so only an
  // import's (or an unreadable) lock is in progress
  const held = readLockState(
    { readFile: (path) => env.fs.readFile(path, OWNER_MAX_BYTES).data },
    join(root, LOCK_NAME),
  );
  if (
    held.kind === 'unreadable' ||
    (held.kind === 'owner' &&
      holderCommand(LOCK_NAME, held.owner) === 'import' &&
      ownerIsAlive(held.owner, env))
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

function writeJournal(guard: PathGuard, txn: string, journal: Journal): void {
  const tmp = join(txn, JOURNAL_TMP);
  try {
    guard.unlink(tmp);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') throw error;
  }
  guard.writeFile(tmp, Buffer.from(JSON.stringify(journal)));
  guard.rename(tmp, join(txn, JOURNAL));
  guard.fs.syncDirectory(txn);
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
  guard: PathGuard,
  txn: string,
  journal: Journal,
  warnings: string[],
): CommitRecord {
  const { fs } = guard;
  const tmp = join(txn, JOURNAL_TMP);
  try {
    try {
      guard.unlink(tmp);
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
    }
    guard.writeFile(
      tmp,
      Buffer.from(JSON.stringify({ ...journal, state: 'committed' })),
    );
  } catch (error) {
    // journal.json was not touched: it still says `committing`
    return { state: 'not-committed', error };
  }
  try {
    guard.rename(tmp, join(txn, JOURNAL));
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
  guard: PathGuard,
  path: string,
  data: Buffer,
  hash: string,
): void {
  guard.writeFile(path, data);
  if (sha256(guard.fs.readFile(path, MAX_STORED_BYTES).data) !== hash) {
    throw codedError('EVERIFY');
  }
}

/**
 * Remove a finished transaction directory: first move it aside (one atomic
 * step, after which it is no longer pending), then delete it.
 */
function discardTransaction(
  guard: PathGuard,
  txn: string,
  env: ImportEnv,
  warnings: string[],
  id?: Id,
): void {
  const done = join(dirname(txn), `${DONE_PREFIX}${env.randomId()}`);
  try {
    guard.rename(txn, done);
  } catch (error) {
    warnings.push(
      `import bookkeeping (${TRANSACTION_NAME}) could not be removed (${describeFsError(error)}); the next import will finish it`,
    );
    return;
  }
  try {
    // Moving an entry never follows a link; deleting a tree must only ever
    // delete the transaction directory itself
    guard.removeTree(done, id);
  } catch (error) {
    if (error instanceof ChangedError) {
      warnings.push(
        `${basename(done)} is not this import's bookkeeping and was left alone`,
      );
      return;
    }
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
  guard: PathGuard,
  segments: string[],
): DestinationState {
  const { fs, root } = guard;
  if (!guard.reach(dirname(join(root, ...segments)))) return 'absent';
  try {
    if (fs.lstat(join(root, ...segments)).kind !== 'file') return 'unsafe';
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return 'absent';
    throw error;
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
  guard: PathGuard,
  txn: string,
  journal: Journal,
  attempted: (index: number) => boolean,
): ImportIssue[] {
  const { fs, root } = guard;
  const issues: ImportIssue[] = [];
  for (let index = journal.operations.length - 1; index >= 0; index--) {
    const op = journal.operations[index];
    // Operations never started cannot need undoing
    if (!op || !attempted(index)) continue;
    const destination = displayPath(op.destination);
    const dest = join(root, ...op.destination);
    try {
      const state = destinationState(guard, op.destination);
      const hash = hashOf(state);
      if (op.action === 'create') {
        if (state === 'absent') continue;
        if (hash === op.newHash) {
          guard.unlink(dest);
          fs.syncDirectory(dirname(dest));
          continue;
        }
      } else {
        if (hash !== undefined && hash === op.oldHash) continue;
        if (hash === op.newHash && op.backup !== null) {
          const backupPath = join(txn, BACKUP_DIR, op.backup);
          // Read through the guard's checks too, so a linked folder is
          // reported rather than read
          guard.check(join(txn, BACKUP_DIR));
          const backup = fs.readFile(backupPath, MAX_STORED_BYTES);
          if (sha256(backup.data) === op.oldHash) {
            guard.rename(backupPath, dest);
            fs.syncDirectory(dirname(dest));
            if (
              hashOf(destinationState(guard, op.destination)) === op.oldHash
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
        error instanceof ChangedError
          ? unsafePathIssue(error, destination)
          : importIssue(
              'ROLLBACK_INCOMPLETE',
              `this record could not be restored yet (${describeFsError(error)}); the next import will retry`,
              { destination },
            ),
      );
    }
  }
  issues.push(...removeCreatedDirectories(guard, txn, journal));
  return issues;
}

/** Where a new directory sits inside the transaction before it is placed */
function stagedDirectory(txn: string, created: string): string {
  // `created` is this module's own "<slot>/<name>" format, never input text
  return join(txn, DIRS_DIR, ...created.split('/'));
}

/** A path the import cannot vouch for: left alone and reported */
function unsafePathIssue(
  error: ChangedError,
  destination: string,
): ImportIssue {
  return importIssue(
    'RECOVERY_CONFLICT',
    `${error.destination ?? 'a directory'} is not the directory this import recorded (it was moved, replaced or made a link), so nothing was changed through it; the journal and previous versions are kept in ${TRANSACTION_NAME}`,
    { destination },
  );
}

/**
 * Remove the directories this import created, deepest first, if they are
 * still empty. A directory is removed only when it is provably the one the
 * import made: every directory above it and the directory itself hold the
 * identities in the journal. One still in the transaction (never moved into
 * place) needs nothing; one replaced by something else is left alone; one
 * reached through a moved, replaced or linked directory is reported.
 */
function removeCreatedDirectories(
  guard: PathGuard,
  txn: string,
  journal: Journal,
): ImportIssue[] {
  const { fs, root } = guard;
  const issues: ImportIssue[] = [];
  const created = journal.directories.filter((d) => d.created !== null);
  for (const dir of created.reverse()) {
    const destination = displayPath(dir.segments);
    const path = join(root, ...dir.segments);
    try {
      // Never moved into place: it goes with the transaction directory
      guard.check(join(txn, DIRS_DIR));
      try {
        const staged = fs.lstat(stagedDirectory(txn, dir.created ?? ''));
        if (staged.kind === 'directory' && hasId(staged, dir.id)) continue;
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') throw error;
      }
      if (!guard.reach(dirname(path))) continue;
      let entry;
      try {
        entry = fs.lstat(path);
      } catch (error) {
        if (errorCode(error) === 'ENOENT') continue;
        throw error;
      }
      // Something else is there now: not ours to remove
      if (entry.kind !== 'directory' || !hasId(entry, dir.id)) continue;
      guard.rmdir(path);
    } catch (error) {
      const code = errorCode(error);
      // Gone already, or now holding something that is not ours to remove
      if (code === 'ENOENT' || code === 'ENOTEMPTY' || code === 'EEXIST') {
        continue;
      }
      issues.push(
        error instanceof ChangedError
          ? unsafePathIssue(error, destination)
          : importIssue(
              'ROLLBACK_INCOMPLETE',
              `a directory the import created could not be removed yet (${describeFsError(error)}); the next import will retry`,
              { destination },
            ),
      );
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Recovery

/**
 * Whether an operation may have been applied; unsure counts as yes. Its
 * marker is written first; its staged copy is consumed (an update is
 * renamed into place) or gains a second link (a create) when it is applied.
 */
function mayHaveApplied(
  fs: ImportFs,
  txn: string,
  op: Journal['operations'][number],
  index: number,
): boolean {
  try {
    fs.lstat(join(txn, APPLYING_DIR, String(index)));
    return true;
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') return true;
  }
  try {
    const staged = fs.lstat(join(txn, STAGED_DIR, op.staged));
    return staged.kind !== 'file' || staged.nlink > 1;
  } catch {
    return true;
  }
}

/** Names in a transaction folder; a missing folder has none */
function listFolder(fs: ImportFs, path: string): string[] {
  try {
    return fs.readdir(path);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return [];
    throw error;
  }
}

/**
 * Evidence, in the transaction itself, that an interrupted import began
 * changing the work log. Preparation writes only staged copies, backups,
 * new directories (in `dirs/`) and the first journal; applying is what
 * writes markers, moves directories and consumes or links staged copies.
 *
 * @returns What shows application began (or that it cannot be ruled out),
 *   or null when the transaction is provably still in preparation
 */
function applicationEvidence(
  fs: ImportFs,
  txn: string,
  journal: Journal | null,
): string | null {
  try {
    if (listFolder(fs, join(txn, APPLYING_DIR)).length > 0) {
      return 'it marked records as being applied';
    }
    // Without a journal, a temporary journal can only be the first one
    // (state `prepared`): any later write renames over an existing journal.
    // Beside a journal, a later state is normal (it was not renamed yet).
    if (!journal) {
      try {
        const tmp = fs.readFile(join(txn, JOURNAL_TMP), JOURNAL_MAX_BYTES).data;
        let state: unknown;
        try {
          state = (JSON.parse(tmp.toString('utf-8')) as { state?: unknown })
            ?.state;
        } catch {
          // A half-written first journal: no state to read
        }
        if (state !== undefined && state !== 'prepared') {
          return 'its journal was being moved past preparation';
        }
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') throw error;
      }
    }
    const staged = listFolder(fs, join(txn, STAGED_DIR));
    for (const name of staged) {
      const entry = fs.lstat(join(txn, STAGED_DIR, name));
      if (entry.kind !== 'file' || entry.nlink > 1) {
        return 'a staged record was linked into place';
      }
    }
    for (const name of listFolder(fs, join(txn, BACKUP_DIR))) {
      // Preparation writes each staged copy before its backup
      if (!staged.includes(name)) {
        return 'a replacement record was moved into place';
      }
    }
    if (journal) {
      for (const op of journal.operations) {
        if (!staged.includes(op.staged)) {
          return 'a staged record was moved into place';
        }
      }
      for (const dir of journal.directories) {
        if (dir.created === null) continue;
        const entry = fs.lstat(stagedDirectory(txn, dir.created));
        if (entry.kind !== 'directory' || !hasId(entry, dir.id)) {
          return 'a new directory was moved into place';
        }
      }
    } else {
      const known = new Set<string>([...FOLDERS, JOURNAL_TMP]);
      if (fs.readdir(txn).some((name) => !known.has(name))) {
        return 'it holds files preparation does not make';
      }
    }
    return null;
  } catch (error) {
    return `its bookkeeping could not be checked (${describeFsError(error)})`;
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
    // Only a transaction proven to be in preparation can be discarded
    // without its journal; anything else keeps every file for inspection
    const evidence = applicationEvidence(fs, txn, null);
    if (evidence !== null) {
      return conflict(
        `the journal of an interrupted import is missing, but ${evidence}, so records may have changed; nothing was changed, and every file is kept in ${TRANSACTION_NAME}. Check the records, then remove ${TRANSACTION_NAME}`,
      );
    }
    try {
      discardTransaction(PathGuard.atRoot(fs, root), txn, env, warnings);
    } catch (error) {
      return conflict(
        `the work log could not be checked (${describeFsError(error)}); nothing was changed`,
      );
    }
    return {
      report: { batchId: null, outcome: 'discarded', records: 0 },
      issues: [],
      warnings,
    };
  }

  const { journal } = read;
  const guard = PathGuard.forJournal(fs, root, journal);
  // Before changing anything, the work log, the transaction directory and
  // every folder of it must be the ones the journal recorded: never followed
  // links, never replaced directories.
  try {
    for (const folder of FOLDERS) guard.check(join(txn, folder));
    // A new directory not yet moved into place must still be the one made
    for (const dir of journal.directories) {
      if (dir.created === null) continue;
      const staged = stagedDirectory(txn, dir.created);
      try {
        guard.check(staged);
      } catch (error) {
        if (!(error instanceof ChangedError)) throw error;
        // Absent means it was moved into place; anything else is a conflict
        try {
          fs.lstat(staged);
        } catch (missing) {
          if (errorCode(missing) === 'ENOENT') continue;
        }
        throw error;
      }
    }
  } catch (error) {
    return conflict(
      error instanceof ChangedError
        ? `${error.destination ?? TRANSACTION_NAME} is not the directory the interrupted import made (it was moved, replaced or made a link), so nothing was changed; check it, then remove ${TRANSACTION_NAME}`
        : `the bookkeeping of an interrupted import could not be checked (${describeFsError(error)}); nothing was changed`,
    );
  }
  const report = (outcome: RecoveryReport['outcome']): RecoveryReport => ({
    batchId: journal.batchId,
    outcome,
    records: journal.operations.length,
  });

  if (journal.state === 'committed') {
    // Only a batch whose every record holds its new version is completed
    const unverified = journal.operations.filter((op) => {
      try {
        return hashOf(destinationState(guard, op.destination)) !== op.newHash;
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
            `an earlier import was recorded as stored, but this record no longer holds the version it stored; it was left as it is, and the journal and any replaced versions are kept in ${TRANSACTION_NAME}`,
            { destination: displayPath(op.destination) },
          ),
        ),
        warnings,
      };
    }
    discardTransaction(guard, txn, env, warnings, journal.transaction);
    return { report: report('completed'), issues: [], warnings };
  }

  // `prepared`: nothing in the work log may have changed, which the
  // transaction must show. `committing`: some records may be stored; undo
  // every one that may have been applied.
  if (journal.state === 'prepared') {
    const evidence = applicationEvidence(fs, txn, journal);
    if (evidence !== null) {
      return conflict(
        `an interrupted import's journal says it was still preparing, but ${evidence}; nothing was changed, and every file is kept in ${TRANSACTION_NAME}. Check the records, then remove ${TRANSACTION_NAME}`,
      );
    }
  }
  const issues =
    journal.state === 'prepared'
      ? []
      : rollBack(guard, txn, journal, (index) => {
          const op = journal.operations[index];
          return op === undefined || mayHaveApplied(fs, txn, op, index);
        });
  if (issues.length > 0) return { report: null, issues, warnings };
  discardTransaction(guard, txn, env, warnings, journal.transaction);
  return {
    report: report(journal.state === 'prepared' ? 'discarded' : 'rolled-back'),
    issues: [],
    warnings,
  };
}

/**
 * With the work-log lock held (by `import` or `filter`): remove what
 * finished imports left, then finish any interrupted import, so the work log
 * holds whole batches only. Issues mean an interrupted import could not be
 * finished (its records may hold part of a batch): the caller must not read
 * or change records.
 *
 * @param workLogRoot - Work-log directory (resolved here, as `import` does)
 * @param env - Environment
 */
export function settleInterruptedImport(
  workLogRoot: string,
  env: ImportEnv,
): {
  report: RecoveryReport | null;
  issues: ImportIssue[];
  warnings: string[];
} {
  const resolved = resolveWorkLogRoot(workLogRoot, env.fs);
  if ('issue' in resolved) {
    return { report: null, issues: [resolved.issue], warnings: [] };
  }
  const warnings = removeLeftovers(resolved.root, env);
  const recovered = recoverInterruptedImport(resolved.root, env);
  return {
    report: recovered.report,
    issues: recovered.issues,
    warnings: [...warnings, ...recovered.warnings],
  };
}

// ---------------------------------------------------------------------------
// Commit

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
  const unchanged = plan.records.filter((r) => r.action === 'unchanged');

  // Every change below goes through the guard, which checks the recorded
  // identity of every directory from the work log down to its target
  const guard = new PathGuard(fs, plan.root, toId(plan.rootId));
  for (const dir of plan.directories) {
    if (dir.existing) {
      guard.vouch(join(plan.root, ...dir.segments), toId(dir.existing));
    }
  }

  /**
   * Records the batch leaves unchanged are part of it too: each must still
   * be the file and contents that were planned, below the recorded
   * directories, before the batch is accepted.
   */
  const verifyUnchanged = () => {
    for (const record of unchanged) {
      guard.check(dirname(join(plan.root, ...record.segments)));
      verifyDestination(plan, record, fs);
    }
  };

  if (records.length === 0) {
    try {
      guard.checkRoot();
      verifyUnchanged();
    } catch (error) {
      return { ok: false, issues: [failureIssue(error, true)], warnings };
    }
    return { ok: true, issues: [], warnings };
  }

  const txn = join(plan.root, TRANSACTION_NAME);
  const operations: Journal['operations'] = records.map((r, i) => ({
    destination: r.segments,
    action: r.action === 'create' ? 'create' : 'update',
    staged: `${i}.md`,
    backup: r.existing ? `${i}.md` : null,
    oldHash: r.existing?.hash ?? null,
    newHash: r.hash,
  }));

  // 1. Prepare. Nothing in the work log changes: new records, backups and
  // new directories are all made inside the transaction directory, and the
  // journal records the identity of each directory before any is used.
  let transaction: Id;
  try {
    guard.checkRoot();
    transaction = guard.mkdir(txn);
  } catch (error) {
    return { ok: false, issues: [failureIssue(error, true)], warnings };
  }
  let journal: Journal;
  try {
    const folders = {} as Journal['folders'];
    for (const folder of FOLDERS) {
      folders[folder] = guard.mkdir(join(txn, folder));
    }
    // New directories are built as one tree per topmost new directory, so
    // placing it is a single rename whose parent is the work log itself
    const createdAt = new Map<string, string>();
    journal = {
      version: 3,
      batchId,
      state: 'prepared',
      root: toId(plan.rootId),
      transaction,
      folders,
      directories: plan.directories.map((dir, k) => {
        if (dir.existing) {
          return {
            segments: dir.segments,
            id: toId(dir.existing),
            created: null,
          };
        }
        const parent = createdAt.get(displayPath(dir.segments.slice(0, -1)));
        const created = parent
          ? `${parent}/${dir.segments[dir.segments.length - 1]}`
          : String(k);
        createdAt.set(displayPath(dir.segments), created);
        // Made in the transaction (checked down to its staged parent), and
        // vouched for at its final path, where the same directory will go
        const id = guard.mkdir(stagedDirectory(txn, created));
        guard.vouch(join(plan.root, ...dir.segments), id);
        return { segments: dir.segments, id, created };
      }),
      operations,
    };
    records.forEach((r, i) => {
      writeVerified(guard, join(txn, STAGED_DIR, `${i}.md`), r.content, r.hash);
      if (r.existing) {
        writeVerified(
          guard,
          join(txn, BACKUP_DIR, `${i}.md`),
          r.existing.content,
          r.existing.hash,
        );
      }
    });
    fs.syncDirectory(join(txn, STAGED_DIR));
    fs.syncDirectory(join(txn, BACKUP_DIR));
    fs.syncDirectory(join(txn, DIRS_DIR));
    writeJournal(guard, txn, journal);
    // The transaction directory's own entry in the work log must reach the
    // disk before any record changes: after a power failure, a replaced
    // record whose journal and backup were lost could not be rolled back
    fs.syncDirectory(plan.root);
  } catch (error) {
    discardTransaction(guard, txn, env, warnings, transaction);
    return { ok: false, issues: [failureIssue(error, true)], warnings };
  }

  // 2. Commit, re-checking everything before each change.
  let attempted = 0;
  try {
    guard.checkRoot();
    journal.state = 'committing';
    writeJournal(guard, txn, journal);

    // Move each topmost new directory (with any new ones inside it) into
    // place, only onto an absent name below verified directories. Every new
    // directory must still be the one the journal recorded once it is there.
    for (const dir of journal.directories) {
      if (dir.created === null || dir.created.includes('/')) continue;
      const path = join(plan.root, ...dir.segments);
      guard.checkRoot();
      if (!guard.reach(dirname(path))) {
        throw new ChangedError(displayPath(dir.segments.slice(0, -1)));
      }
      try {
        fs.lstat(path);
        throw new ChangedError(displayPath(dir.segments));
      } catch (error) {
        if (errorCode(error) !== 'ENOENT') throw error;
      }
      try {
        guard.rename(stagedDirectory(txn, dir.created), path);
      } catch (error) {
        const code = errorCode(error);
        // The name was taken meanwhile (by a directory, file or link)
        if (
          code === 'EEXIST' ||
          code === 'ENOTEMPTY' ||
          code === 'ENOTDIR' ||
          code === 'EISDIR'
        ) {
          throw new ChangedError(displayPath(dir.segments));
        }
        throw error;
      }
      guard.checkAt(path);
      fs.syncDirectory(dirname(path));
    }

    records.forEach((record, i) => {
      guard.checkRoot();
      // Every work-log directory the batch uses must be the recorded one
      for (const dir of journal.directories) {
        guard.checkAt(join(plan.root, ...dir.segments));
      }
      verifyDestination(plan, record, fs);
      const dest = join(plan.root, ...record.segments);
      const staged = join(txn, STAGED_DIR, `${i}.md`);
      guard.writeFile(join(txn, APPLYING_DIR, String(i)), Buffer.alloc(0));
      fs.syncDirectory(join(txn, APPLYING_DIR));
      attempted = i + 1;
      if (record.existing === null) {
        try {
          guard.link(staged, dest);
        } catch (error) {
          if (errorCode(error) === 'EEXIST') {
            throw new ChangedError(displayPath(record.segments));
          }
          throw error;
        }
      } else {
        guard.rename(staged, dest);
      }
      fs.syncDirectory(dirname(dest));
      if (sha256(fs.readFile(dest, MAX_STORED_BYTES).data) !== record.hash) {
        throw new ChangedError(displayPath(record.segments));
      }
    });
    verifyUnchanged();
  } catch (error) {
    // The journal on disk says `prepared` or `committing`: undo
    return undo(error);
  }

  // 3. Record the batch as stored. From here the journal on disk decides.
  const record = writeCommittedJournal(guard, txn, journal, warnings);
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
  discardTransaction(guard, txn, env, warnings, transaction);
  return { ok: true, issues: [], warnings };

  /** Roll back the records this import may have changed */
  function undo(error: unknown) {
    const unrestored = rollBack(
      guard,
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
    discardTransaction(guard, txn, env, warnings, transaction);
    return { ok: false, issues: [failureIssue(error, true)], warnings };
  }
}
