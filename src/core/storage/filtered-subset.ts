import { randomBytes } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  type Stats,
  statSync,
  writeFileSync,
} from 'node:fs';
import { hostname, uptime } from 'node:os';
import { dirname, isAbsolute, join, normalize, sep } from 'node:path';

import { IsoDateTimeSchema } from '@wc-types/pr';
import { z } from 'zod';

import { DIRECTORIES } from './paths';
import {
  acquireWorkLogLock,
  describeOwner,
  type LockFs,
  type LockOwner,
  readLockOwner,
} from './work-log-lock';

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
 * One `filter` (or `filter --clear`) runs per work log at a time, under
 * `.filter-lock`: a second run is refused rather than racing the first, so
 * one run can never move or delete another run's subsets. A lock left by a
 * process on this machine that has exited (or ran before the last boot) is
 * taken over; any other lock is respected.
 */

/** The selection marker, written inside the subset with its contents */
export const FILTER_SELECTION_FILE = '.filter.json';
const STAGING_PREFIX = '.filter-staging-';
const PREVIOUS_PREFIX = '.filter-previous-';
/** A subset `filter --clear` deselected; never restored */
const CLEARED_PREFIX = '.filter-cleared-';
/** Held while a `filter` run changes the subset */
export const FILTER_LOCK = '.filter-lock';
/** Held while a lock left by an exited run is taken over */
const LOCK_TAKEOVER_GUARD = `${FILTER_LOCK}.takeover`;

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
       * Record directories the full work log has and the subset lacks: the
       * subset was made before those records existed, so it is out of date.
       */
      missing: SubsetRecordDirectory[];
    }
  /**
   * `filtered/` is missing while an earlier subset waits beside it: a
   * `filter` run is swapping subsets right now (`locked`), or stopped while
   * swapping them
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
 * Raised when another `filter` run holds the work log's filter lock.
 */
export class FilterInProgressError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilterInProgressError';
  }
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

/**
 * Filesystem operations the subset uses, so tests can inject failures
 * without relying on permissions.
 */
export interface SubsetFs {
  lstat(path: string): Stats;
  stat(path: string): Stats;
  readdir(path: string): string[];
  readFile(path: string): Buffer;
  /** Create one directory; fails if it exists */
  mkdir(path: string): void;
  /** Create a directory and any missing parents */
  mkdirp(path: string): void;
  writeFile(path: string, contents: string | Buffer): void;
  rename(from: string, to: string): void;
  /** Remove a file or directory tree; a symlink is removed, not followed */
  rm(path: string): void;
}

export const nodeSubsetFs: SubsetFs = {
  lstat: (path) => lstatSync(path),
  stat: (path) => statSync(path),
  readdir: (path) => readdirSync(path),
  readFile: (path) => readFileSync(path),
  mkdir: (path) => mkdirSync(path),
  mkdirp: (path) => {
    mkdirSync(path, { recursive: true });
  },
  writeFile: (path, contents) => writeFileSync(path, contents),
  rename: (from, to) => renameSync(from, to),
  rm: (path) => rmSync(path, { recursive: true }),
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
  let entry: Stats;
  try {
    entry = fs.lstat(filteredDir);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    throw error;
  }
  if (entry.isSymbolicLink()) {
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
  if (!entry.isDirectory()) {
    throw new Error(
      `${filteredDir} exists but is not a directory, so it is not a filtered subset. ` +
        'Move or remove it, then run `work-chronicler filter` again.',
    );
  }
  return true;
}

function exists(fs: SubsetFs, path: string): boolean {
  try {
    fs.lstat(path);
    return true;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    throw error;
  }
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
  if (!subsetExists(fs, dir)) {
    const { previous } = findLeftovers(fs, outputDir);
    return previous.length > 0
      ? {
          status: 'interrupted',
          previous,
          locked: exists(fs, join(outputDir, FILTER_LOCK)),
        }
      : { status: 'none' };
  }
  const missing = LATER_RECORD_DIRECTORIES.filter(
    (name) => !exists(fs, join(dir, name)) && exists(fs, join(outputDir, name)),
  );
  return {
    status: 'selected',
    dir,
    selection: readFilterSelection(dir, fs),
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

/**
 * This process and machine, for the filter lock. Tests replace members.
 */
export interface SubsetEnv {
  pid: number;
  hostname: string;
  now: () => number;
  /** When this machine last booted, as epoch milliseconds */
  bootTime: () => number;
  isProcessAlive: (pid: number) => boolean;
}

/**
 * Whether a process is running. A permission error means it exists; any
 * other doubt also counts as running, so a live run is never taken over.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) !== 'ESRCH';
  }
}

export const nodeSubsetEnv: SubsetEnv = {
  pid: process.pid,
  hostname: hostname(),
  now: () => Date.now(),
  bootTime: () => Date.now() - uptime() * 1000,
  isProcessAlive,
};

export interface SubsetOptions {
  fs?: SubsetFs;
  env?: Partial<SubsetEnv>;
  randomId?: () => string;
}

const defaultRandomId = () => randomBytes(8).toString('hex');

/**
 * Why a run could not take the lock, with a recovery step that is safe: the
 * lock is removed only by someone who knows no filter is running.
 */
function lockHeldMessage(lockPath: string, owner: LockOwner | null): string {
  const who = owner
    ? `Another \`work-chronicler filter\` run (${describeOwner(owner)}) holds ${lockPath}`
    : `${lockPath} exists but does not say which run holds it`;
  return (
    `${who}. If it is still running, try again when it finishes. ` +
    `If you know no filter is running (it was stopped, or the machine was renamed), remove ${lockPath} and try again. ` +
    'The subset was not changed.'
  );
}

/**
 * The work log's filter lock, for diagnostics: its path and owner (null when
 * the owner cannot be read), or null when no lock is held.
 */
export function readFilterLock(
  outputDir: string,
  fs: SubsetFs = nodeSubsetFs,
): { path: string; owner: Omit<LockOwner, 'version' | 'runId'> | null } | null {
  const path = join(outputDir, FILTER_LOCK);
  if (!exists(fs, path)) return null;
  const owner = readLockOwner(fs, path);
  return {
    path,
    owner: owner
      ? { pid: owner.pid, hostname: owner.hostname, startedAt: owner.startedAt }
      : null,
  };
}

/** The subset's filesystem, as the shared work-log lock uses it */
function lockFs(fs: SubsetFs): LockFs {
  return {
    readFile: (path) => fs.readFile(path),
    readdir: (path) => fs.readdir(path),
    mtimeMs: (path) => fs.lstat(path).mtimeMs,
    exists: (path) => exists(fs, path),
    mkdir: (path) => fs.mkdir(path),
    writeFile: (path, contents) => fs.writeFile(path, contents),
    rename: (from, to) => fs.rename(from, to),
    rm: (path) => fs.rm(path),
  };
}

/**
 * Take the work log's filter lock (see `./work-log-lock`). A lock whose
 * owner is provably gone is taken over, one run at a time, under
 * `.filter-lock.takeover`.
 *
 * @returns A function that releases the lock and returns any warnings
 * @throws {FilterInProgressError} When another run holds the lock
 */
function acquireFilterLock(
  fs: SubsetFs,
  env: SubsetEnv,
  outputDir: string,
  randomId: () => string,
): () => string[] {
  const lockPath = join(outputDir, FILTER_LOCK);
  const guardPath = join(outputDir, LOCK_TAKEOVER_GUARD);
  fs.mkdirp(outputDir);
  const lock = acquireWorkLogLock({
    fs: lockFs(fs),
    env,
    dir: outputDir,
    name: FILTER_LOCK,
    command: 'work-chronicler filter',
    randomId,
  });
  if (lock.held) return lock.release;
  switch (lock.reason) {
    case 'held':
      throw new FilterInProgressError(lockHeldMessage(lockPath, lock.owner));
    case 'takeover-abandoned':
      throw new FilterInProgressError(
        `A \`work-chronicler filter\` run (${describeOwner(lock.taker)}) exited while taking over ${lockPath} and left ${guardPath} behind. ` +
          `If no filter is running, remove ${guardPath} and try again. The subset was not changed.`,
      );
    case 'takeover-busy':
      throw new FilterInProgressError(
        `Another \`work-chronicler filter\` run${lock.taker ? ` (${describeOwner(lock.taker)})` : ''} is taking over ${lockPath} from a run that has exited. ` +
          `Try again in a moment. If no filter is running, remove ${guardPath} and try again. The subset was not changed.`,
      );
    default:
      throw new FilterInProgressError(
        lock.owner
          ? lockHeldMessage(lockPath, lock.owner)
          : lock.exists
            ? lockHeldMessage(lockPath, null)
            : 'Other `work-chronicler filter` runs kept taking and releasing the lock; try again. The subset was not changed.',
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

function removeQuietly(fs: SubsetFs, path: string, warnings: string[]): void {
  try {
    fs.rm(path);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return;
    warnings.push(
      `Could not remove ${path} (${errorCode(error) ?? 'error'}); it is not used and can be deleted.`,
    );
  }
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

/**
 * Build a complete subset beside `filtered/`, check it, and swap it in. On any
 * failure before the swap completes, the previous subset (if any) is left as
 * it was and the error is thrown.
 *
 * @param outputDir - Base work-log directory
 * @param plan - The new subset's contents
 * @returns The subset directory and warnings about leftovers that could not
 *   be removed after the new subset was in place
 */
export async function replaceFilteredSubset(
  outputDir: string,
  plan: SubsetPlan,
  options: SubsetOptions = {},
): Promise<{ dir: string; warnings: string[] }> {
  const fs = options.fs ?? nodeSubsetFs;
  const randomId = options.randomId ?? defaultRandomId;
  const warnings: string[] = [];

  // Validate the plan before touching anything
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

  const env = { ...nodeSubsetEnv, ...options.env };
  const release = acquireFilterLock(fs, env, outputDir, randomId);
  try {
    const dir = await swapInSubset(
      fs,
      randomId,
      outputDir,
      { files, directories, marker, validate: plan.validate },
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
  plan: {
    files: SubsetFile[];
    directories: string[];
    marker: string;
    validate: SubsetPlan['validate'];
  },
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
      if (!fs.stat(join(staging, directory)).isDirectory()) {
        throw new Error(`The new filtered subset is missing ${directory}`);
      }
    }
    if (readFilterSelection(staging, fs) === null) {
      throw new Error('The new filtered subset has no readable selection');
    }
    await plan.validate?.(staging);
  } catch (error) {
    removeQuietly(fs, staging, []);
    throw error;
  }

  // Swap: previous subset aside, new subset in, previous subset removed
  let previous: string | null = null;
  if (hadSubset) {
    previous = join(outputDir, `${PREVIOUS_PREFIX}${randomId()}`);
    try {
      fs.rename(filteredDir, previous);
    } catch (error) {
      removeQuietly(fs, staging, []);
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
        throw new Error(
          `Could not put the new filtered subset in place, nor the previous one back; it is kept at ${previous}. ` +
            'Run `work-chronicler filter` again to restore it.',
          { cause: error },
        );
      }
    }
    removeQuietly(fs, staging, []);
    throw error;
  }

  // The new subset is in place. Under the lock, no other run is using any
  // leftover, so all of them are unused.
  if (previous) removeQuietly(fs, previous, warnings);
  const leftovers = findLeftovers(fs, outputDir);
  for (const name of [
    ...leftovers.staging,
    ...leftovers.previous,
    ...leftovers.cleared,
  ]) {
    removeQuietly(fs, join(outputDir, name), warnings);
  }

  return filteredDir;
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
  const randomId = options.randomId ?? defaultRandomId;
  const filteredDir = join(outputDir, DIRECTORIES.FILTERED);
  const warnings: string[] = [];
  // Nothing to clear (and no lock to take) in a work log that does not exist
  if (!exists(fs, outputDir)) return { cleared: false, warnings };

  const release = acquireFilterLock(
    fs,
    { ...nodeSubsetEnv, ...options.env },
    outputDir,
    randomId,
  );
  try {
    return {
      cleared: clearUnderLock(fs, randomId, outputDir, filteredDir, warnings),
      warnings,
    };
  } finally {
    warnings.push(...release());
  }
}

function clearUnderLock(
  fs: SubsetFs,
  randomId: () => string,
  outputDir: string,
  filteredDir: string,
  warnings: string[],
): boolean {
  let cleared = false;
  if (subsetExists(fs, filteredDir)) {
    fs.rename(filteredDir, join(outputDir, `${CLEARED_PREFIX}${randomId()}`));
    cleared = true;
  }
  // An interrupted run's previous subset is cleared too, so it is not restored
  const leftovers = findLeftovers(fs, outputDir);
  if (leftovers.previous.length > 0) cleared = true;
  for (const name of leftovers.previous) {
    try {
      fs.rename(
        join(outputDir, name),
        join(outputDir, `${CLEARED_PREFIX}${randomId()}`),
      );
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
    }
  }
  const remaining = findLeftovers(fs, outputDir);
  for (const name of [...remaining.staging, ...remaining.cleared]) {
    removeQuietly(fs, join(outputDir, name), warnings);
  }
  return cleared;
}
