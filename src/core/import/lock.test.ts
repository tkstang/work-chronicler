import { lstatSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  createImportEnv,
  type ImportEnv,
  type ImportFs,
  nodeImportFs,
} from './import-fs';
import { makeWorld } from './import.test-support';
import { acquireImportLock, releaseImportLock } from './transaction';

// The import lock is the shared work-log lock (also used by `filter`):
// at most one live import holds `.import-lock`, a lock left by an exited
// process is taken over one run at a time, and a live lock is never moved.

const DEAD_PID = 4_000_001;
const roots: string[] = [];
afterEach(() => {
  for (const base of roots.splice(0)) {
    rmSync(base, { recursive: true, force: true });
  }
});

function workLog(): string {
  const w = makeWorld();
  roots.push(w.base);
  return w.workLog;
}

/** A contender: its own PID and IDs; only DEAD_PID is not running */
function contender(
  name: string,
  pid: number,
  fs: ImportFs = nodeImportFs,
): ImportEnv {
  let n = 0;
  return {
    ...createImportEnv(),
    pid,
    fs,
    isProcessAlive: (p) => p !== DEAD_PID,
    randomId: () => `${name}${++n}`,
  };
}

/** Leave a lock held by a process that has exited */
function seedDeadLock(root: string): void {
  const dead = acquireImportLock(root, contender('dead', DEAD_PID), 'dead');
  expect(dead.lock).toBeDefined();
}

/** The lock's owner record, whatever shape the lock has on disk */
function lockOwner(root: string): { pid: number; runId: string } {
  const path = join(root, '.import-lock');
  const file = lstatSync(path).isDirectory() ? join(path, 'owner.json') : path;
  const owner = JSON.parse(readFileSync(file, 'utf-8'));
  return { pid: owner.pid, runId: owner.runId ?? owner.batchId };
}

describe('import lock', () => {
  it('lets one of three contenders hold a stale lock, never moving a live one aside', () => {
    // Integrated review H1's schedule: A reads the dead owner and pauses; B
    // takes the lock over; A resumes; C tries whenever A would move the lock
    // and again at the end. B and C must never both hold it.
    const root = workLog();
    seedDeadLock(root);
    const lockPath = join(root, '.import-lock');
    const ownerFile = join(lockPath, 'owner.json');
    const movedAside: number[] = [];
    let b: ReturnType<typeof acquireImportLock> | undefined;
    let c: ReturnType<typeof acquireImportLock> | undefined;
    const runC = () => {
      c ??= acquireImportLock(root, contender('c', 300), 'batch-c');
    };

    // Watch every move of the lock: whose lock was it?
    const watched = (base: ImportFs): ImportFs => ({
      ...base,
      rename: (from, to) => {
        if (from === lockPath) movedAside.push(lockOwner(root).pid);
        base.rename(from, to);
      },
    });
    let paused = false;
    const fsA: ImportFs = {
      ...watched(nodeImportFs),
      readFile: (path, max) => {
        const read = nodeImportFs.readFile(path, max);
        if (!paused && (path === ownerFile || path === lockPath)) {
          // A has just read the dead owner: B takes over meanwhile
          paused = true;
          b = acquireImportLock(
            root,
            contender('b', 200, watched(nodeImportFs)),
            'batch-b',
          );
        }
        return read;
      },
      rename: (from, to) => {
        watched(nodeImportFs).rename(from, to);
        // If A ever frees the lock name, C claims it at once
        if (from === lockPath) runC();
      },
    };

    const a = acquireImportLock(root, contender('a', 100, fsA), 'batch-a');
    runC();

    expect(paused).toBe(true);
    expect(b?.lock).toBeDefined();
    expect(a.lock).toBeUndefined();
    expect(c?.lock).toBeUndefined();
    expect(a.issue?.code).toBe('IMPORT_IN_PROGRESS');
    expect(c?.issue?.code).toBe('IMPORT_IN_PROGRESS');
    expect(lockOwner(root).runId).toBe('batch-b');
    // Only the exited process's lock was ever moved aside
    expect(movedAside).toEqual([DEAD_PID]);
  });

  it('takes over a lock whose owner has exited and leaves nothing behind', () => {
    const root = workLog();
    seedDeadLock(root);

    const taken = acquireImportLock(root, contender('a', 100), 'batch-a');

    expect(taken.lock).toBeDefined();
    expect(lockOwner(root).runId).toBe('batch-a');
    expect(
      releaseImportLock(taken.lock ?? { root, release: () => [] }),
    ).toEqual([]);
    expect(readdirSync(root)).toEqual([]);
  });

  it('refuses a lock whose owner is running, and leaves it as it is', () => {
    const root = workLog();
    const live = acquireImportLock(root, contender('b', 200), 'batch-b');
    expect(live.lock).toBeDefined();

    const refused = acquireImportLock(root, contender('a', 100), 'batch-a');

    expect(refused.issue?.code).toBe('IMPORT_IN_PROGRESS');
    expect(lockOwner(root).runId).toBe('batch-b');
    expect(readdirSync(root)).toEqual(['.import-lock']);
  });
});
