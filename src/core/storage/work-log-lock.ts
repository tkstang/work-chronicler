import { join } from 'node:path';

import {
  errorCode,
  type ProcessEnv,
  removeQuietly,
} from '@core/import/import-fs';
import { z } from 'zod';

/**
 * The work-log lock: `import`, `filter` and `filter --clear` hold it while
 * they change a work log, so only one of them runs there at a time and a
 * second run is refused rather than racing the first.
 *
 * It is held under both names 0.6.0 used, taken in a fixed order
 * (`.import-lock`, then `.filter-lock`) and released in reverse: holding
 * the first is what serializes runs, and holding both means a 0.6.0
 * `import` (which takes only `.import-lock`) or `filter` (only
 * `.filter-lock`) running beside this version is refused too, and that a
 * lock either of them leaves is honored. No new name appears in the work
 * log. A run that cannot take the second name releases the first.
 *
 * Each name is a directory holding `owner.json` (process ID, host, start
 * time, run ID, boot ID and command). It is created complete under a claim
 * name and renamed into place; the rename fails while the name holds a lock,
 * and a lock is never left empty, so at most one run holds it.
 *
 * A lock whose owner is provably gone (a process on this machine that is no
 * longer running, or that ran in an earlier boot) is taken over, one run at
 * a time: the taker first holds the takeover guard (`<lock>.takeover`,
 * created the same way), checks under it that the lock still names the gone
 * owner, moves it aside and removes it, then claims the lock like any other
 * run. A live owner's lock is never moved. Releasing renames the lock aside
 * (`<lock>.released-<run>`) before removing it, so the shared name never
 * holds a half-removed directory. Whatever earlier runs left beside the lock
 * is removed only when its owner has exited.
 */

/** Held first: the name every run takes, and the one 0.6.0 `import` takes */
export const IMPORT_LOCK = '.import-lock';
/** Held second, so a 0.6.0 `filter` (which takes only this) is refused */
export const FILTER_LOCK = '.filter-lock';
/** The names the work-log lock is held under, in the order they are taken */
export const WORK_LOG_LOCK_NAMES = [IMPORT_LOCK, FILTER_LOCK] as const;
export type WorkLogLockName = (typeof WORK_LOG_LOCK_NAMES)[number];

/** The commands that hold the work-log lock */
export type WorkLogCommand = 'import' | 'filter';

/** Filesystem operations a lock needs; callers adapt their own seam */
export interface LockFs {
  readFile: (path: string) => Buffer;
  readdir: (path: string) => string[];
  /** Modification time in milliseconds, not following a final link */
  mtimeMs: (path: string) => number;
  /** Whether something is at `path`; only a proven ENOENT is false */
  exists: (path: string) => boolean;
  /** Create one directory; fails if it exists */
  mkdir: (path: string) => void;
  writeFile: (path: string, contents: string) => void;
  rename: (from: string, to: string) => void;
  /** Remove a directory tree; a link is removed, not followed */
  rm: (path: string) => void;
}

export const LOCK_OWNER_FILE = 'owner.json';

export const LockOwnerSchema = z.object({
  version: z.literal(1),
  pid: z.int().positive(),
  hostname: z.string(),
  startedAt: z.number(),
  runId: z.string(),
  /** The boot the owner ran in; absent in 0.6.0 locks */
  bootId: z.string().optional(),
  /** The command holding it (`import`, `filter`); absent in 0.6.0 locks */
  command: z.string().optional(),
});
export type LockOwner = z.infer<typeof LockOwnerSchema>;

/** Tries to take a lock that keeps being released and taken by others */
const MAX_LOCK_ATTEMPTS = 5;

/** How long an ownerless claim or guard is given to be written */
const UNREADABLE_GRACE_MS = 60_000;

/**
 * A lock directory's owner, telling a lock that is gone (`missing`) from
 * one that names no valid owner (`unreadable`). A lock is put in place
 * whole, with its owner, so a missing owner file means the lock was
 * released or replaced while it was read: callers look again.
 */
export function readLockState(
  fs: Pick<LockFs, 'readFile'>,
  lockDir: string,
):
  | { kind: 'owner'; owner: LockOwner }
  | { kind: 'missing' }
  | { kind: 'unreadable' } {
  let text: string;
  try {
    text = fs.readFile(join(lockDir, LOCK_OWNER_FILE)).toString('utf-8');
  } catch (error) {
    return errorCode(error) === 'ENOENT'
      ? { kind: 'missing' }
      : { kind: 'unreadable' };
  }
  try {
    const parsed = LockOwnerSchema.safeParse(JSON.parse(text));
    return parsed.success
      ? { kind: 'owner', owner: parsed.data }
      : { kind: 'unreadable' };
  } catch {
    return { kind: 'unreadable' };
  }
}

/** A lock directory's owner, or null when it has none that can be read */
export function readLockOwner(
  fs: Pick<LockFs, 'readFile'>,
  lockDir: string,
): LockOwner | null {
  const state = readLockState(fs, lockDir);
  return state.kind === 'owner' ? state.owner : null;
}

export function sameOwner(a: LockOwner, b: LockOwner): boolean {
  return (
    a.pid === b.pid &&
    a.hostname === b.hostname &&
    a.startedAt === b.startedAt &&
    a.runId === b.runId
  );
}

/**
 * Only a process on this machine that is provably gone counts as dead: its
 * PID is not running, or it recorded a boot ID other than this boot's (so a
 * PID in use again after a reboot is not mistaken for it). The wall clock is
 * never used, so a clock that jumps cannot make a live owner look dead; an
 * owner without a boot ID (a 0.6.0 lock) is judged by its process alone.
 */
export function ownerIsAlive(
  owner: LockOwner,
  env: Pick<ProcessEnv, 'hostname' | 'bootId' | 'isProcessAlive'>,
): boolean {
  if (owner.hostname !== env.hostname) return true;
  if (owner.bootId !== undefined) {
    const current = env.bootId();
    if (current !== null && current !== owner.bootId) return false;
  }
  return env.isProcessAlive(owner.pid);
}

export function describeOwner(owner: LockOwner): string {
  return `process ${owner.pid} on ${owner.hostname}, started ${new Date(owner.startedAt).toISOString()}`;
}

/**
 * The command holding a lock name. A 0.6.0 owner does not say, but then
 * only that command took the name.
 */
export function holderCommand(name: string, owner: LockOwner | null): string {
  if (owner?.command) return owner.command;
  return name === FILTER_LOCK ? 'filter' : 'import';
}

/** Where a work-log lock lives and who is taking it */
export interface WorkLogLockSpec {
  fs: LockFs;
  /** This process and machine (`randomId` names the lock's temporary names) */
  env: ProcessEnv;
  /** The work-log root the lock lives in */
  dir: string;
  /** The command taking it, recorded in the lock */
  command: WorkLogCommand;
  /** This run's ID; a new random ID when omitted */
  runId?: string;
}

/** One of the lock's names, as it is taken */
interface NameSpec extends WorkLogLockSpec {
  name: WorkLogLockName;
}

/** Why one name of the lock could not be taken */
export type LockRefusal =
  /** Another run holds the lock (`owner` null when it cannot be read) */
  | { reason: 'held'; owner: LockOwner | null }
  /** A run that exited while taking over left the guard behind */
  | { reason: 'takeover-abandoned'; taker: LockOwner }
  /** Another run is taking over a lock left by an exited run */
  | { reason: 'takeover-busy'; taker: LockOwner | null }
  /** Other runs kept taking and releasing the lock */
  | { reason: 'contended'; owner: LockOwner | null; exists: boolean };

export type LockAcquisition =
  | {
      held: true;
      owner: LockOwner;
      /** Release the lock; returns any warnings, including cleanup ones */
      release: () => string[];
    }
  | ({
      held: false;
      /** The name that could not be taken (none of the lock is held) */
      name: WorkLogLockName;
      /** Warnings from releasing the names this run had taken */
      warnings: string[];
    } & LockRefusal);

type NameAcquisition =
  | { held: true; release: () => string[] }
  | ({ held: false } & LockRefusal);

/**
 * Move a lock-shaped directory out of the way under a name only this run
 * uses, then remove it. Renaming first means the shared name never holds a
 * half-removed (empty) directory another run could rename its claim onto.
 */
function retireQuietly(
  fs: LockFs,
  path: string,
  aside: string,
  warnings: string[],
): void {
  try {
    fs.rename(path, aside);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') {
      warnings.push(
        `Could not release ${path} (${errorCode(error) ?? 'error'}); the next \`work-chronicler import\` or \`filter\` run will take it over once this process has exited.`,
      );
    }
    return;
  }
  removeQuietly(
    () => fs.rm(aside),
    (error) =>
      warnings.push(
        `Could not remove ${aside} (${errorCode(error) ?? 'error'}); it is a released lock, no longer in use, and can be deleted.`,
      ),
  );
}

/**
 * Create a lock-shaped directory (`<path>/owner.json`) complete under a
 * claim name and rename it into place. The rename fails while `path` holds
 * a lock, and a lock is never left empty, so at most one run creates it.
 *
 * @returns Whether this run now holds `path`
 */
function claimLockPath(
  spec: NameSpec,
  path: string,
  owner: LockOwner,
  tag: string,
): boolean {
  const { fs } = spec;
  const claim = join(spec.dir, `${spec.name}.claim-${owner.runId}${tag}`);
  fs.mkdir(claim);
  let renamed = false;
  try {
    fs.writeFile(join(claim, LOCK_OWNER_FILE), JSON.stringify(owner));
    try {
      fs.rename(claim, path);
      renamed = true;
    } catch (error) {
      // Another lock is in place (or was, a moment ago)
      const code = errorCode(error);
      if (code === 'ENOTEMPTY' || code === 'EEXIST' || fs.exists(path)) {
        return false;
      }
      throw error;
    }
    const held = readLockOwner(fs, path);
    return held !== null && sameOwner(held, owner);
  } finally {
    // Unused either way; a later run removes it
    if (!renamed) removeQuietly(() => fs.rm(claim));
  }
}

/**
 * With the lock held: remove what earlier runs left beside it. Moved-aside
 * and released locks are never in use. A claim or takeover guard is removed
 * only when its owner is provably gone, or when it never named an owner
 * within the grace period, so a run that is about to claim is not disturbed.
 */
function removeLockLeftovers(spec: NameSpec, warnings: string[]): void {
  const { fs, env } = spec;
  let names: string[];
  try {
    names = fs.readdir(spec.dir);
  } catch {
    return;
  }
  for (const name of names) {
    if (!name.startsWith(`${spec.name}.`)) continue;
    const path = join(spec.dir, name);
    const alwaysUnused =
      name.startsWith(`${spec.name}.stale-`) ||
      name.startsWith(`${spec.name}.released-`);
    if (!alwaysUnused) {
      const owner = readLockOwner(fs, path);
      if (owner) {
        if (ownerIsAlive(owner, env)) continue;
      } else {
        let mtime: number;
        try {
          mtime = fs.mtimeMs(path);
        } catch {
          continue;
        }
        if (env.now() - mtime < UNREADABLE_GRACE_MS) continue;
      }
    }
    removeQuietly(
      () => fs.rm(path),
      (error) =>
        warnings.push(
          `Could not remove ${path} (${errorCode(error) ?? 'error'}), left by an earlier run.`,
        ),
    );
  }
}

/**
 * Take the work-log lock: each of its names in order, releasing the names
 * already taken if one cannot be (see the module comment). Filesystem
 * errors other than the lock being held are thrown, with nothing held.
 *
 * @param spec - The work log, its filesystem, this process and the command
 * @returns The held lock and how to release it, or why it is not held
 */
export function acquireWorkLogLock(spec: WorkLogLockSpec): LockAcquisition {
  const { env } = spec;
  const bootId = env.bootId();
  const owner: LockOwner = {
    version: 1,
    pid: env.pid,
    hostname: env.hostname,
    startedAt: env.now(),
    runId: spec.runId ?? env.randomId(),
    ...(bootId !== null ? { bootId } : {}),
    command: spec.command,
  };
  const releases: (() => string[])[] = [];
  // Last taken, first released, so no run finds the first name free while
  // this one still holds a later one
  const releaseTaken = () =>
    [...releases].reverse().flatMap((release) => release());

  for (const name of WORK_LOG_LOCK_NAMES) {
    let taken: NameAcquisition;
    try {
      taken = acquireLockName({ ...spec, name }, owner);
    } catch (error) {
      releaseTaken();
      throw error;
    }
    if (!taken.held) {
      return { ...taken, name, warnings: releaseTaken() };
    }
    releases.push(taken.release);
  }
  return { held: true, owner, release: releaseTaken };
}

/**
 * Take one name of the lock, taking over one whose owner is provably gone,
 * one run at a time.
 */
function acquireLockName(spec: NameSpec, owner: LockOwner): NameAcquisition {
  const { fs, env } = spec;
  const lockPath = join(spec.dir, spec.name);
  const guardPath = join(spec.dir, `${spec.name}.takeover`);

  for (let attempt = 0; attempt < MAX_LOCK_ATTEMPTS; attempt++) {
    if (claimLockPath(spec, lockPath, owner, '')) {
      const warnings: string[] = [];
      removeLockLeftovers(spec, warnings);
      return {
        held: true,
        release: () => {
          const released: string[] = [...warnings];
          const current = readLockOwner(fs, lockPath);
          if (!current || !sameOwner(current, owner)) {
            released.push(
              `${lockPath} no longer names this run, so it was left as it is.`,
            );
            return released;
          }
          retireQuietly(
            fs,
            lockPath,
            join(spec.dir, `${spec.name}.released-${owner.runId}`),
            released,
          );
          return released;
        },
      };
    }

    // Someone holds the lock: take it over only if its owner is gone
    const state = readLockState(fs, lockPath);
    if (state.kind === 'missing') continue; // released meanwhile: try again
    if (state.kind === 'unreadable') {
      return { held: false, reason: 'held', owner: null };
    }
    const held = state.owner;
    if (ownerIsAlive(held, env)) {
      return { held: false, reason: 'held', owner: held };
    }
    if (!claimLockPath(spec, guardPath, owner, '.guard')) {
      const taker = readLockOwner(fs, guardPath);
      if (taker && !ownerIsAlive(taker, env)) {
        // The run taking over exited mid-takeover; retrying cannot clear it
        return { held: false, reason: 'takeover-abandoned', taker };
      }
      return { held: false, reason: 'takeover-busy', taker };
    }
    try {
      // Under the guard, the gone owner's lock can only be removed by us
      const current = readLockOwner(fs, lockPath);
      if (current && sameOwner(current, held)) {
        const stale = join(spec.dir, `${spec.name}.stale-${env.randomId()}`);
        fs.rename(lockPath, stale);
        const moved = readLockOwner(fs, stale);
        if (!moved || !sameOwner(moved, held)) {
          try {
            fs.rename(stale, lockPath);
          } catch {
            // Left as a stale copy; reported as held
          }
          // A vanished copy means another run claimed the freed lock and
          // cleaned up; report the lock's current holder, not the copy
          return {
            held: false,
            reason: 'held',
            owner: moved ?? readLockOwner(fs, lockPath),
          };
        }
        // Unused either way; a later run removes it
        removeQuietly(() => fs.rm(stale));
      }
    } finally {
      retireQuietly(
        fs,
        guardPath,
        join(spec.dir, `${spec.name}.released-${owner.runId}.guard`),
        [],
      );
    }
  }
  const last = readLockState(fs, lockPath);
  return last.kind === 'owner'
    ? { held: false, reason: 'contended', owner: last.owner, exists: true }
    : {
        held: false,
        reason: 'contended',
        owner: null,
        exists: fs.exists(lockPath),
      };
}

/** One name of the work-log lock as it is on disk, for diagnostics */
export interface LockHolder {
  name: WorkLogLockName;
  path: string;
  /** Null when no owner can be read */
  owner: LockOwner | null;
  /** The command holding it, as the owner says or as 0.6.0 used the name */
  command: string;
}

/**
 * Who holds the work-log lock: every name of it that exists, with its
 * owner. Empty when the lock is free.
 */
export function readWorkLogLock(
  fs: Pick<LockFs, 'readFile' | 'exists'>,
  dir: string,
): LockHolder[] {
  const holders: LockHolder[] = [];
  for (const name of WORK_LOG_LOCK_NAMES) {
    const path = join(dir, name);
    if (!fs.exists(path)) continue;
    const owner = readLockOwner(fs, path);
    holders.push({ name, path, owner, command: holderCommand(name, owner) });
  }
  return holders;
}
