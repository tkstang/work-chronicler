import { join } from 'node:path';

import { z } from 'zod';

/**
 * A lock one command holds in a work log while it changes it (`.filter-lock`
 * for `filter`, `.import-lock` for `import`), so a second run is refused
 * rather than racing the first.
 *
 * A lock is a directory holding `owner.json` (process ID, host, start time
 * and run ID). It is created complete under a claim name and renamed into
 * place; the rename fails while the name holds a lock, and a lock is never
 * left empty, so at most one run holds it.
 *
 * A lock whose owner is provably gone (a process on this machine that is no
 * longer running, or started before the last boot) is taken over, one run at
 * a time: the taker first holds the takeover guard (`<lock>.takeover`,
 * created the same way), checks under it that the lock still names the gone
 * owner, moves it aside and removes it, then claims the lock like any other
 * run. A live owner's lock is never moved. Releasing renames the lock aside
 * (`<lock>.released-<run>`) before removing it, so the shared name never
 * holds a half-removed directory. Whatever earlier runs left beside the lock
 * is removed only when its owner has exited.
 */

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

/** This process and machine */
export interface LockEnv {
  pid: number;
  hostname: string;
  now: () => number;
  /** When this machine last booted, as epoch milliseconds */
  bootTime: () => number;
  isProcessAlive: (pid: number) => boolean;
}

export const LOCK_OWNER_FILE = 'owner.json';

export const LockOwnerSchema = z.object({
  version: z.literal(1),
  pid: z.int().positive(),
  hostname: z.string(),
  startedAt: z.number(),
  runId: z.string(),
});
export type LockOwner = z.infer<typeof LockOwnerSchema>;

/** Tries to take a lock that keeps being released and taken by others */
const MAX_LOCK_ATTEMPTS = 5;

/** How long an ownerless claim or guard is given to be written */
const UNREADABLE_GRACE_MS = 60_000;

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

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
 * Only a process on this machine that is provably gone (not running, or
 * started before the last boot) counts as dead.
 */
export function ownerIsAlive(owner: LockOwner, env: LockEnv): boolean {
  if (owner.hostname !== env.hostname) return true;
  if (owner.startedAt < env.bootTime()) return false;
  return env.isProcessAlive(owner.pid);
}

export function describeOwner(owner: LockOwner): string {
  return `process ${owner.pid} on ${owner.hostname}, started ${new Date(owner.startedAt).toISOString()}`;
}

/** What a lock is for and where it lives */
export interface WorkLogLockSpec {
  fs: LockFs;
  env: LockEnv;
  /** The work-log root the lock lives in */
  dir: string;
  /** The lock's name in `dir`, such as `.filter-lock` */
  name: string;
  /** The command, for messages (`work-chronicler filter`) */
  command: string;
  randomId: () => string;
  /** This run's ID; a new random ID when omitted */
  runId?: string;
}

export type LockAcquisition =
  | {
      held: true;
      owner: LockOwner;
      /** Release the lock; returns any warnings, including cleanup ones */
      release: () => string[];
    }
  /** Another run holds the lock (`owner` null when it cannot be read) */
  | { held: false; reason: 'held'; owner: LockOwner | null }
  /** A run that exited while taking over left the guard behind */
  | { held: false; reason: 'takeover-abandoned'; taker: LockOwner }
  /** Another run is taking over a lock left by an exited run */
  | { held: false; reason: 'takeover-busy'; taker: LockOwner | null }
  /** Other runs kept taking and releasing the lock */
  | {
      held: false;
      reason: 'contended';
      owner: LockOwner | null;
      exists: boolean;
    };

/**
 * Move a lock-shaped directory out of the way under a name only this run
 * uses, then remove it. Renaming first means the shared name never holds a
 * half-removed (empty) directory another run could rename its claim onto.
 */
function retireQuietly(
  fs: LockFs,
  command: string,
  path: string,
  aside: string,
  warnings: string[],
): void {
  try {
    fs.rename(path, aside);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') {
      warnings.push(
        `Could not release ${path} (${errorCode(error) ?? 'error'}); the next \`${command}\` run will take it over once this process has exited.`,
      );
    }
    return;
  }
  try {
    fs.rm(aside);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') {
      warnings.push(
        `Could not remove ${aside} (${errorCode(error) ?? 'error'}); it is a released lock, no longer in use, and can be deleted.`,
      );
    }
  }
}

function removeQuietly(fs: LockFs, path: string): void {
  try {
    fs.rm(path);
  } catch {
    // Unused either way; a later run removes it
  }
}

/**
 * Create a lock-shaped directory (`<path>/owner.json`) complete under a
 * claim name and rename it into place. The rename fails while `path` holds
 * a lock, and a lock is never left empty, so at most one run creates it.
 *
 * @returns Whether this run now holds `path`
 */
function claimLockPath(
  spec: WorkLogLockSpec,
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
    if (!renamed) removeQuietly(fs, claim);
  }
}

/**
 * With the lock held: remove what earlier runs left beside it. Moved-aside
 * and released locks are never in use. A claim or takeover guard is removed
 * only when its owner is provably gone, or when it never named an owner
 * within the grace period, so a run that is about to claim is not disturbed.
 */
function removeLockLeftovers(spec: WorkLogLockSpec, warnings: string[]): void {
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
    try {
      fs.rm(path);
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') {
        warnings.push(
          `Could not remove ${path} (${errorCode(error) ?? 'error'}), left by an earlier run.`,
        );
      }
    }
  }
}

/**
 * Take a work-log lock, taking over one whose owner is provably gone, one
 * run at a time (see the module comment). Filesystem errors other than the
 * lock being held are thrown.
 *
 * @param spec - The lock, its filesystem and this process
 * @returns The held lock and how to release it, or why it is not held
 */
export function acquireWorkLogLock(spec: WorkLogLockSpec): LockAcquisition {
  const { fs, env } = spec;
  const lockPath = join(spec.dir, spec.name);
  const guardPath = join(spec.dir, `${spec.name}.takeover`);
  const owner: LockOwner = {
    version: 1,
    pid: env.pid,
    hostname: env.hostname,
    startedAt: env.now(),
    runId: spec.runId ?? spec.randomId(),
  };

  for (let attempt = 0; attempt < MAX_LOCK_ATTEMPTS; attempt++) {
    if (claimLockPath(spec, lockPath, owner, '')) {
      const warnings: string[] = [];
      removeLockLeftovers(spec, warnings);
      return {
        held: true,
        owner,
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
            spec.command,
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
        const stale = join(spec.dir, `${spec.name}.stale-${spec.randomId()}`);
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
        removeQuietly(fs, stale);
      }
    } finally {
      retireQuietly(
        fs,
        spec.command,
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
