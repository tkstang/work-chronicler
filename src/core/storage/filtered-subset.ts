import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, sep } from 'node:path';

import {
  createImportEnv,
  createProcessEnv,
  entryAt,
  errorCode,
  type FsEntry,
  fsEntry,
  type ImportEnv,
  type ImportFs,
  nodeImportFs,
  type ProcessEnv,
  removeQuietly,
} from '@core/import/import-fs';
import { settleInterruptedImport } from '@core/import/transaction';
import { IsoDateTimeSchema } from '@wc-types/pr';
import { z } from 'zod';

import { DIRECTORIES } from './paths';
import {
  acquireWorkLogLock,
  describeOwner,
  FILTER_LOCK,
  holderCommand,
  type LockFs,
  type LockHolder,
  type LockOwner,
  readLockOwner,
  readWorkLogLock,
} from './work-log-lock';

export { FILTER_LOCK } from './work-log-lock';

/**
 * The `filtered/` subset of a work log.
 *
 * `filter` writes a subset of the work log to `filtered/`, and read commands
 * (the MCP server, `analyze`) use it instead of the full work log while it
 * exists. The subset is selected by the directory existing, whatever it
 * holds, so an empty result is still a selection and is never silently
 * bypassed for the full work log.
 *
 * A new subset is built and checked in a sibling staging directory, then
 * swapped in with two renames: `filtered/` to `.filter-previous-<id>`, then
 * the staging directory to `filtered/`. Any failure before the swap leaves
 * the previous subset as it was. If a run stops between the two renames,
 * `filtered/` is missing while `.filter-previous-<id>` exists: readers refuse
 * to guess (`interrupted`), and the next `filter` puts the previous subset
 * back before it does anything else.
 *
 * `filter` and `filter --clear` run under the work-log lock, which `import`
 * holds too (see `./work-log-lock`): one of them runs per work log at a
 * time, and a second run is refused rather than racing the first, so one run
 * can never move or delete another run's subsets, nor read records an import
 * is changing. A lock left by a process on this machine that has exited (or
 * ran in an earlier boot) is taken over; any other lock is respected.
 */

/** The selection marker, written inside the subset with its contents */
export const FILTER_SELECTION_FILE = '.filter.json';
const STAGING_PREFIX = '.filter-staging-';
const PREVIOUS_PREFIX = '.filter-previous-';
/** A subset `filter --clear` deselected; never restored */
const CLEARED_PREFIX = '.filter-cleared-';

/**
 * Record directories a subset can be missing because it was written before
 * the full work log had any such records.
 */
const LATER_RECORD_DIRECTORIES = [
  DIRECTORIES.PR_REVIEWS,
  DIRECTORIES.MESSAGES,
] as const;
export type SubsetRecordDirectory = (typeof LATER_RECORD_DIRECTORIES)[number];

const CountSchema = z.int().min(0);
const RecordCountsSchema = z.object({
  pullRequests: CountSchema,
  tickets: CountSchema,
  prReviews: CountSchema,
  messages: CountSchema,
});
export type SubsetRecordCounts = z.infer<typeof RecordCountsSchema>;

/**
 * What a subset holds and how it was chosen, published inside the subset.
 */
export const FilterSelectionSchema = z.object({
  version: z.literal(1),
  createdAt: IsoDateTimeSchema,
  /** The filters, as `filter` described them */
  filters: z.array(z.string()),
  /**
   * Records in the subset (`prReviews`: only review records attributed to
   * the configured GitHub user)
   */
  counts: RecordCountsSchema,
  /** Records in the full work log when the subset was made */
  totals: RecordCountsSchema,
});
export type FilterSelection = z.infer<typeof FilterSelectionSchema>;

export type FilteredSubsetState =
  /** No subset: read the full work log */
  | { status: 'none' }
  /** A subset is selected: read `dir` */
  | {
      status: 'selected';
      dir: string;
      /** The selection marker; null for a subset from before 0.6.0 */
      selection: FilterSelection | null;
      /**
       * Which subset this is. Every replacement puts a new directory in
       * place, so two subsets in turn never share it, even when their
       * markers match or they have none (subsets from before 0.6.0).
       */
      generation: string;
      /**
       * Record directories the full work log has and the subset lacks: the
       * subset was made before those records existed, so it is out of date.
       */
      missing: SubsetRecordDirectory[];
    }
  /**
   * `filtered/` is missing while an earlier subset waits beside it: a
   * `filter` run is swapping subsets right now (`locked`: a filter holds the
   * work-log lock), or stopped while swapping them
   */
  | { status: 'interrupted'; previous: string[]; locked: boolean };

/**
 * Raised when the subset cannot be told apart from an interrupted swap.
 */
export class FilteredSubsetInterruptedError extends Error {
  constructor(outputDir: string, locked = false) {
    super(
      locked
        ? `A \`work-chronicler filter\` run is replacing ${join(outputDir, DIRECTORIES.FILTERED)} (it holds ${FILTER_LOCK}). ` +
            'Try again when it finishes. If no filter is running, run `work-chronicler filter` again ' +
            'to restore the previous subset, or `work-chronicler filter --clear` to use the full work log.'
        : `A \`work-chronicler filter\` run was interrupted while replacing ${join(outputDir, DIRECTORIES.FILTERED)}. ` +
            'Run `work-chronicler filter` again to restore the previous subset and apply your filters, ' +
            'or `work-chronicler filter --clear` to use the full work log.',
    );
    this.name = 'FilteredSubsetInterruptedError';
  }
}

/**
 * Raised when neither the new subset nor the previous one could be put in
 * place: unlike every other failure, the subset has changed (readers see an
 * interrupted swap until `filter` runs again).
 */
export class FilteredSubsetNotRestoredError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'FilteredSubsetNotRestoredError';
  }
}

/**
 * Raised when an interrupted `import` could not be finished before `filter`
 * read the work log: its records may hold part of a batch, so the subset is
 * not changed.
 */
export class InterruptedImportError extends Error {
  constructor(
    outputDir: string,
    issues: { code: string; message: string; destination?: string }[],
  ) {
    const details = issues
      .map(
        (issue) =>
          `${issue.code}${issue.destination ? ` (${issue.destination})` : ''}: ${issue.message}`,
      )
      .join('; ');
    super(
      `An interrupted \`work-chronicler import\` in ${outputDir} could not be finished, so its records may hold part of a batch: ${details}. ` +
        'The subset was not changed. Run `work-chronicler import` with an empty directory to see what it needs, then filter again.',
    );
    this.name = 'InterruptedImportError';
  }
}

/**
 * Raised when another run (a `filter` or an `import`) holds the work-log
 * lock.
 */
export class FilterInProgressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilterInProgressError';
  }
}

/**
 * The filesystem the subset uses, so tests can inject failures without
 * relying on permissions: the shared seam's operations (`lstat`, `readdir`,
 * `mkdir`, `rename`, `removeTree`; see `@core/import/import-fs`), plus the
 * few the subset needs with other semantics.
 */
export interface SubsetFs extends Pick<
  ImportFs,
  'lstat' | 'readdir' | 'mkdir' | 'rename' | 'removeTree'
> {
  /** What is at a path, following a final symlink (`filtered/` may be one) */
  stat(path: string): FsEntry;
  /** Read a whole file, following a final symlink */
  readFile(path: string): Buffer;
  /** Create a directory and any missing parents */
  mkdirp(path: string): void;
  /**
   * Write a file, replacing any there. Not flushed file by file: the subset
   * is read back before it is swapped in.
   */
  writeFile(path: string, contents: string | Buffer): void;
}

export const nodeSubsetFs: SubsetFs = {
  lstat: nodeImportFs.lstat,
  readdir: nodeImportFs.readdir,
  mkdir: nodeImportFs.mkdir,
  rename: nodeImportFs.rename,
  removeTree: nodeImportFs.removeTree,
  stat: (path) => fsEntry(statSync(path, { bigint: true })),
  readFile: (path) => readFileSync(path),
  mkdirp: (path) => {
    mkdirSync(path, { recursive: true });
  },
  writeFile: (path, contents) => writeFileSync(path, contents),
};

/**
 * Names in the work-log root left by earlier `filter` runs.
 */
function findLeftovers(
  fs: SubsetFs,
  outputDir: string,
): { staging: string[]; previous: string[]; cleared: string[] } {
  let names: string[];
  try {
    names = fs.readdir(outputDir);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      return { staging: [], previous: [], cleared: [] };
    }
    throw error;
  }
  const withPrefix = (prefix: string) =>
    names.filter((n) => n.startsWith(prefix)).sort();
  return {
    staging: withPrefix(STAGING_PREFIX),
    previous: withPrefix(PREVIOUS_PREFIX),
    cleared: withPrefix(CLEARED_PREFIX),
  };
}

/**
 * Whether `filtered/` exists, as a directory. Only a proven ENOENT counts as
 * absent; anything else that is not a directory is an error.
 */
function subsetExists(fs: SubsetFs, filteredDir: string): boolean {
  return subsetGeneration(fs, filteredDir) !== null;
}

/**
 * The identity of `filtered/` (and of the directory it links to, if it is a
 * link), or null when it is absent; throws as {@link subsetExists} does.
 */
function subsetGeneration(fs: SubsetFs, filteredDir: string): string | null {
  const named = entryAt(fs, filteredDir);
  if (named === null) return null;
  let entry = named;
  if (entry.kind === 'symlink') {
    try {
      entry = fs.stat(filteredDir);
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
      throw new Error(
        `${filteredDir} is a symbolic link to something that does not exist, so it is not a filtered subset. ` +
          'Remove the link (or point it at a directory), then run `work-chronicler filter` again.',
      );
    }
  }
  if (entry.kind !== 'directory') {
    throw new Error(
      `${filteredDir} exists but is not a directory, so it is not a filtered subset. ` +
        'Move or remove it, then run `work-chronicler filter` again.',
    );
  }
  const id = (e: FsEntry) => `${e.dev}:${e.ino}:${e.mtimeMs}`;
  return entry === named ? id(named) : `${id(named)}>${id(entry)}`;
}

/**
 * Read a subset's selection marker.
 *
 * @returns The marker, or null when the subset has none or it is unreadable
 */
export function readFilterSelection(
  subsetDir: string,
  fs: SubsetFs = nodeSubsetFs,
): FilterSelection | null {
  try {
    const data: unknown = JSON.parse(
      fs.readFile(join(subsetDir, FILTER_SELECTION_FILE)).toString('utf-8'),
    );
    const parsed = FilterSelectionSchema.safeParse(data);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Find out whether a work log has a selected subset.
 *
 * @param outputDir - Base work-log directory (not `filtered/`)
 * @throws When `filtered/` exists but is not a directory, or cannot be read
 */
export function getFilteredSubsetState(
  outputDir: string,
  fs: SubsetFs = nodeSubsetFs,
): FilteredSubsetState {
  const dir = join(outputDir, DIRECTORIES.FILTERED);
  const generation = subsetGeneration(fs, dir);
  if (generation === null) {
    const { previous } = findLeftovers(fs, outputDir);
    return previous.length > 0
      ? {
          status: 'interrupted',
          previous,
          locked: readWorkLogLockHolders(outputDir, fs).some(
            (holder) => holder.command === 'filter',
          ),
        }
      : { status: 'none' };
  }
  const missing = LATER_RECORD_DIRECTORIES.filter(
    (name) =>
      entryAt(fs, join(dir, name)) === null &&
      entryAt(fs, join(outputDir, name)) !== null,
  );
  return {
    status: 'selected',
    dir,
    selection: readFilterSelection(dir, fs),
    generation,
    missing,
  };
}

/**
 * Get the directory read commands should use: the `filtered/` subset when
 * one is selected (even an empty one), otherwise the full work log.
 *
 * @param outputDir - Base work-log output directory
 * @returns `dir` (path to use) and `isFiltered` (whether it is the subset)
 * @throws {FilteredSubsetInterruptedError} When a `filter` run stopped while
 *   swapping subsets, rather than silently reading the full work log
 *
 * @example
 * ```ts
 * const { dir, isFiltered } = getEffectiveOutputDir('/path/to/work-log');
 * ```
 */
export function getEffectiveOutputDir(outputDir: string): {
  dir: string;
  isFiltered: boolean;
} {
  const state = getFilteredSubsetState(outputDir);
  if (state.status === 'interrupted') {
    throw new FilteredSubsetInterruptedError(outputDir, state.locked);
  }
  if (state.status === 'selected') return { dir: state.dir, isFiltered: true };
  return { dir: outputDir, isFiltered: false };
}

/** One file in a subset, by path relative to the subset root */
export interface SubsetFile {
  path: string;
  contents: string | Buffer;
}

/** Everything a new subset holds */
export interface SubsetPlan {
  files: SubsetFile[];
  /** Directories to create even when empty, relative to the subset root */
  directories: string[];
  selection: FilterSelection;
  /**
   * An extra check of the staged subset (such as reading every record back);
   * throw to reject it. The previous subset is kept.
   */
  validate?: (stagingDir: string) => void | Promise<void>;
}

export interface SubsetOptions {
  fs?: SubsetFs;
  /**
   * This process and machine (for the work-log lock and temporary names),
   * and the filesystem for finishing an interrupted import. Tests replace
   * members; the rest are the real ones.
   */
  env?: Partial<ImportEnv>;
}

/**
 * Why a run could not take the lock, with a recovery step that is safe: the
 * lock is removed only by someone who knows no such run is going.
 */
function lockHeldMessage(
  lockPath: string,
  owner: LockOwner | null,
  command: string,
): string {
  const who = owner
    ? `Another \`work-chronicler ${command}\` run (${describeOwner(owner)}) holds ${lockPath}`
    : `${lockPath} exists but does not say which run holds it`;
  return (
    `${who}. If it is still running, try again when it finishes. ` +
    `If you know no ${command} is running (it was stopped, or the machine was renamed), remove ${lockPath} and try again. ` +
    'The subset was not changed.'
  );
}

/**
 * The work log's filter lock name (`.filter-lock`), for diagnostics: its
 * path and owner (null when the owner cannot be read), or null when it is
 * not held. See {@link readWorkLogLockHolders} for the whole work-log lock.
 */
export function readFilterLock(
  outputDir: string,
  fs: SubsetFs = nodeSubsetFs,
): { path: string; owner: Omit<LockOwner, 'version' | 'runId'> | null } | null {
  const path = join(outputDir, FILTER_LOCK);
  if (entryAt(fs, path) === null) return null;
  const owner = readLockOwner(fs, path);
  return {
    path,
    owner: owner
      ? { pid: owner.pid, hostname: owner.hostname, startedAt: owner.startedAt }
      : null,
  };
}

/**
 * Who holds the work-log lock (shared by `import` and `filter`): each of
 * its names that exists, with its owner and command. Empty when it is free.
 */
export function readWorkLogLockHolders(
  outputDir: string,
  fs: SubsetFs = nodeSubsetFs,
): LockHolder[] {
  return readWorkLogLock(lockFs(fs), outputDir);
}

/** The subset's filesystem, as the shared work-log lock uses it */
function lockFs(fs: SubsetFs): LockFs {
  return {
    readFile: (path) => fs.readFile(path),
    readdir: (path) => fs.readdir(path),
    mtimeMs: (path) => fs.lstat(path).mtimeMs,
    exists: (path) => entryAt(fs, path) !== null,
    mkdir: (path) => fs.mkdir(path),
    writeFile: (path, contents) => fs.writeFile(path, contents),
    rename: (from, to) => fs.rename(from, to),
    rm: (path) => fs.removeTree(path),
  };
}

/**
 * Take the work-log lock for `filter` (see `./work-log-lock`). A lock whose
 * owner is provably gone is taken over, one run at a time, under
 * `<lock>.takeover`.
 *
 * @returns A function that releases the lock and returns any warnings
 * @throws {FilterInProgressError} When another run (an `import` or a
 *   `filter`) holds the lock
 */
function acquireFilterLock(
  fs: SubsetFs,
  env: ProcessEnv,
  outputDir: string,
): () => string[] {
  fs.mkdirp(outputDir);
  const lock = acquireWorkLogLock({
    fs: lockFs(fs),
    env,
    dir: outputDir,
    command: 'filter',
  });
  if (lock.held) return lock.release;
  const lockPath = join(outputDir, lock.name);
  const guardPath = `${lockPath}.takeover`;
  const releaseNotes = lock.warnings.length
    ? ` ${lock.warnings.join(' ')}`
    : '';
  switch (lock.reason) {
    case 'held':
      throw new FilterInProgressError(
        lockHeldMessage(
          lockPath,
          lock.owner,
          holderCommand(lock.name, lock.owner),
        ) + releaseNotes,
      );
    case 'takeover-abandoned':
      throw new FilterInProgressError(
        `A \`work-chronicler ${holderCommand(lock.name, lock.taker)}\` run (${describeOwner(lock.taker)}) exited while taking over ${lockPath} and left ${guardPath} behind. ` +
          `If no import or filter is running, remove ${guardPath} and try again. The subset was not changed.${releaseNotes}`,
      );
    case 'takeover-busy':
      throw new FilterInProgressError(
        `Another run${lock.taker ? ` (${describeOwner(lock.taker)})` : ''} is taking over ${lockPath} from a run that has exited. ` +
          `Try again in a moment. If no import or filter is running, remove ${guardPath} and try again. The subset was not changed.${releaseNotes}`,
      );
    default:
      throw new FilterInProgressError(
        (lock.owner || lock.exists
          ? lockHeldMessage(
              lockPath,
              lock.owner,
              holderCommand(lock.name, lock.owner),
            )
          : 'Other `work-chronicler import` or `filter` runs kept taking and releasing the lock; try again. The subset was not changed.') +
          releaseNotes,
      );
  }
}

/** A relative path that stays inside the subset */
function checkRelativePath(path: string): string {
  const normalized = normalize(path);
  if (
    !path ||
    isAbsolute(path) ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith(`..${sep}`)
  ) {
    throw new Error(`Refusing to write ${path} outside the filtered subset`);
  }
  return normalized;
}

/** Remove something no subset uses; a failure is only a warning */
function removeUnused(fs: SubsetFs, path: string, warnings: string[]): void {
  removeQuietly(
    () => fs.removeTree(path),
    (error) =>
      warnings.push(
        `Could not remove ${path} (${errorCode(error) ?? 'error'}); it is not used and can be deleted.`,
      ),
  );
}

/**
 * Put the previous subset back after an interrupted swap, so this run starts
 * from a work log that has its last good subset.
 */
function restoreInterrupted(
  fs: SubsetFs,
  outputDir: string,
  filteredDir: string,
): void {
  if (subsetExists(fs, filteredDir)) return;
  const { previous } = findLeftovers(fs, outputDir);
  if (previous.length === 0) return;
  if (previous.length > 1) {
    throw new Error(
      `Several earlier subsets were left by interrupted \`filter\` runs (${previous.join(', ')}); ` +
        'run `work-chronicler filter --clear`, then filter again',
    );
  }
  fs.rename(join(outputDir, previous[0] ?? ''), filteredDir);
}

/** A plan checked and ready to write */
interface PreparedPlan {
  files: SubsetFile[];
  directories: string[];
  marker: string;
  validate: SubsetPlan['validate'];
}

/** Check a plan before anything is written for it */
function preparePlan(plan: SubsetPlan): PreparedPlan {
  const files = plan.files.map((file) => ({
    path: checkRelativePath(file.path),
    contents: file.contents,
  }));
  const seen = new Set<string>();
  for (const file of files) {
    if (seen.has(file.path) || file.path === FILTER_SELECTION_FILE) {
      throw new Error(`The filtered subset lists ${file.path} twice`);
    }
    seen.add(file.path);
  }
  const directories = plan.directories.map(checkRelativePath);
  const selection = FilterSelectionSchema.parse(plan.selection);
  const marker = `${JSON.stringify(selection, null, 2)}\n`;
  return { files, directories, marker, validate: plan.validate };
}

/**
 * Under the work-log lock: finish any interrupted import, so records are
 * read only when the work log holds whole batches.
 *
 * @throws {InterruptedImportError} When it cannot be finished
 */
function settleImport(
  outputDir: string,
  env: ImportEnv,
  warnings: string[],
): void {
  const settled = settleInterruptedImport(outputDir, env);
  warnings.push(...settled.warnings);
  if (settled.issues.length > 0) {
    throw new InterruptedImportError(outputDir, settled.issues);
  }
  if (settled.report) {
    const { outcome, records } = settled.report;
    const done = {
      discarded: 'discarded',
      'rolled-back': 'rolled back',
      completed: 'completed',
    }[outcome];
    warnings.push(
      `An interrupted import was ${done} before filtering (${records} record${records === 1 ? '' : 's'} in its batch${outcome === 'rolled-back' ? ', none kept' : ''}).`,
    );
  }
}

/**
 * Build a complete subset beside `filtered/`, check it, and swap it in. On any
 * failure before the swap completes, the previous subset (if any) is left as
 * it was and the error is thrown.
 *
 * Everything happens under the work-log lock, after any interrupted import
 * is finished (or, when it cannot be, `filter` is refused): a plan built
 * from the work log's records must be passed as a function, which is called
 * then, so it never reads records an import is changing or left half done.
 *
 * @param outputDir - Base work-log directory
 * @param plan - The new subset's contents, or a function that builds them
 *   from the work log under the lock
 * @returns The subset directory and warnings about leftovers that could not
 *   be removed after the new subset was in place
 * @throws {FilterInProgressError} When another run holds the work-log lock
 * @throws {InterruptedImportError} When an interrupted import cannot be
 *   finished
 */
export async function replaceFilteredSubset(
  outputDir: string,
  plan: SubsetPlan | (() => SubsetPlan | Promise<SubsetPlan>),
  options: SubsetOptions = {},
): Promise<{ dir: string; warnings: string[] }> {
  const fs = options.fs ?? nodeSubsetFs;
  const warnings: string[] = [];

  // A plan given as is is checked before anything is touched
  const given = typeof plan === 'function' ? null : preparePlan(plan);

  const env: ImportEnv = { ...createImportEnv(), ...options.env };
  const release = acquireFilterLock(fs, env, outputDir);
  try {
    settleImport(outputDir, env, warnings);
    const prepared =
      given ??
      preparePlan(await (plan as () => SubsetPlan | Promise<SubsetPlan>)());
    const dir = await swapInSubset(
      fs,
      env.randomId,
      outputDir,
      prepared,
      warnings,
    );
    return { dir, warnings };
  } finally {
    warnings.push(...release());
  }
}

/**
 * Build, check and swap in a subset. Runs only under the filter lock.
 */
async function swapInSubset(
  fs: SubsetFs,
  randomId: () => string,
  outputDir: string,
  plan: PreparedPlan,
  warnings: string[],
): Promise<string> {
  const { files, directories, marker } = plan;
  const filteredDir = join(outputDir, DIRECTORIES.FILTERED);
  restoreInterrupted(fs, outputDir, filteredDir);
  const hadSubset = subsetExists(fs, filteredDir);

  fs.mkdirp(outputDir);
  const staging = join(outputDir, `${STAGING_PREFIX}${randomId()}`);
  fs.mkdir(staging);

  try {
    for (const directory of directories) fs.mkdirp(join(staging, directory));
    for (const file of files) {
      const path = join(staging, file.path);
      fs.mkdirp(dirname(path));
      fs.writeFile(path, file.contents);
    }
    fs.writeFile(join(staging, FILTER_SELECTION_FILE), marker);

    // Read everything back before it can replace the previous subset
    for (const file of files) {
      const expected = Buffer.isBuffer(file.contents)
        ? file.contents
        : Buffer.from(file.contents, 'utf-8');
      if (!fs.readFile(join(staging, file.path)).equals(expected)) {
        throw new Error(
          `The new filtered subset did not read back as written (${file.path}); the previous subset is unchanged`,
        );
      }
    }
    for (const directory of directories) {
      if (fs.stat(join(staging, directory)).kind !== 'directory') {
        throw new Error(`The new filtered subset is missing ${directory}`);
      }
    }
    if (readFilterSelection(staging, fs) === null) {
      throw new Error('The new filtered subset has no readable selection');
    }
    await plan.validate?.(staging);
  } catch (error) {
    removeQuietly(() => fs.removeTree(staging));
    throw error;
  }

  // Swap: previous subset aside, new subset in, previous subset removed
  let previous: string | null = null;
  if (hadSubset) {
    previous = join(outputDir, `${PREVIOUS_PREFIX}${randomId()}`);
    try {
      fs.rename(filteredDir, previous);
    } catch (error) {
      removeQuietly(() => fs.removeTree(staging));
      throw error;
    }
  }
  try {
    fs.rename(staging, filteredDir);
  } catch (error) {
    if (previous) {
      try {
        fs.rename(previous, filteredDir);
      } catch {
        throw new FilteredSubsetNotRestoredError(
          `Could not put the new filtered subset in place, nor the previous one back; it is kept at ${previous}. ` +
            'Run `work-chronicler filter` again to restore it.',
          { cause: error },
        );
      }
    }
    removeQuietly(() => fs.removeTree(staging));
    throw error;
  }

  // The new subset is in place. Under the lock, no other run is using any
  // leftover, so all of them are unused. From here nothing may fail the run:
  // the new subset is selected, so problems are only warnings.
  if (previous) removeUnused(fs, previous, warnings);
  removeLeftoversQuietly(fs, outputDir, warnings);

  return filteredDir;
}

/**
 * Remove what earlier runs left beside the subset, reporting any failure
 * (including failing to list the work log) as a warning.
 */
function removeLeftoversQuietly(
  fs: SubsetFs,
  outputDir: string,
  warnings: string[],
  kinds: ('staging' | 'previous' | 'cleared')[] = [
    'staging',
    'previous',
    'cleared',
  ],
  done = 'the filtered subset is in place',
): void {
  let leftovers: ReturnType<typeof findLeftovers>;
  try {
    leftovers = findLeftovers(fs, outputDir);
  } catch (error) {
    warnings.push(
      `Could not list ${outputDir} to remove what earlier runs left there (${errorCode(error) ?? 'error'}); ${done}, and the next \`work-chronicler filter\` run removes them.`,
    );
    return;
  }
  for (const name of kinds.flatMap((kind) => leftovers[kind])) {
    removeUnused(fs, join(outputDir, name), warnings);
  }
}

/**
 * Remove the subset, so read commands use the full work log. The subset is
 * first renamed aside, so a removal that fails part way never leaves a
 * partial subset selected.
 *
 * @returns Whether there was a subset, and warnings about what could not be
 *   removed after it was deselected
 */
export function clearFilteredSubset(
  outputDir: string,
  options: SubsetOptions = {},
): { cleared: boolean; warnings: string[] } {
  const fs = options.fs ?? nodeSubsetFs;
  const env: ProcessEnv = { ...createProcessEnv(), ...options.env };
  const filteredDir = join(outputDir, DIRECTORIES.FILTERED);
  const warnings: string[] = [];
  // Nothing to clear (and no lock to take) in a work log that does not exist
  if (entryAt(fs, outputDir) === null) return { cleared: false, warnings };

  const release = acquireFilterLock(fs, env, outputDir);
  try {
    return {
      cleared: clearUnderLock(
        fs,
        env.randomId,
        outputDir,
        filteredDir,
        warnings,
      ),
      warnings,
    };
  } finally {
    warnings.push(...release());
  }
}

/**
 * Clear under the lock. Every restorable previous subset is found and set
 * aside first, while the selected subset (if any) is still in place: if
 * listing the work log or setting one aside fails, `filter --clear` is
 * refused with the selection unchanged, and once `filtered/` is renamed
 * aside no previous subset waits beside it for readers to stop at.
 */
function clearUnderLock(
  fs: SubsetFs,
  randomId: () => string,
  outputDir: string,
  filteredDir: string,
  warnings: string[],
): boolean {
  const hadSubset = subsetExists(fs, filteredDir);
  let previous: string[];
  try {
    ({ previous } = findLeftovers(fs, outputDir));
  } catch (error) {
    throw new Error(
      `Could not list ${outputDir} to find subsets earlier runs left there (${errorCode(error) ?? 'error'}). The subset was not changed.`,
      { cause: error },
    );
  }
  // An interrupted run's previous subset is cleared too, so it is not
  // restored
  for (const name of previous) {
    try {
      fs.rename(
        join(outputDir, name),
        join(outputDir, `${CLEARED_PREFIX}${randomId()}`),
      );
    } catch (error) {
      if (errorCode(error) === 'ENOENT') continue;
      throw new Error(
        `Could not set aside ${join(outputDir, name)} (${errorCode(error) ?? 'error'}), a subset an earlier run left. ${
          hadSubset
            ? 'The subset was not changed.'
            : 'Run `work-chronicler filter --clear` again.'
        }`,
        { cause: error },
      );
    }
  }
  if (hadSubset) {
    fs.rename(filteredDir, join(outputDir, `${CLEARED_PREFIX}${randomId()}`));
  }
  // Deselected: failing to tidy up is only a warning
  removeLeftoversQuietly(
    fs,
    outputDir,
    warnings,
    ['staging', 'cleared'],
    'the filtered subset is cleared',
  );
  return hadSubset || previous.length > 0;
}
