import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';

import {
  createImportEnv,
  type ImportEnv,
  type ImportFs,
  nodeImportFs,
} from '@core/import/import-fs';
import {
  hookedFs,
  makeWorld,
  messageFrontmatter,
  stage,
  SYNTH_SOURCES,
} from '@core/import/import.test-support';
import {
  clearFilteredSubset,
  FilterInProgressError,
  replaceFilteredSubset,
  type SubsetPlan,
} from '@storage/filtered-subset';
import { afterEach, describe, expect, it } from 'vitest';

import { runImport } from './index';
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
    // The live run holds both names of the work-log lock; nothing else
    expect(readdirSync(root).sort()).toEqual(['.filter-lock', '.import-lock']);
  });
});

// `import` and `filter` share the work-log lock: each is refused while the
// other holds it, so a filter never reads records an import is changing and
// an import never changes records a filter is reading.
describe('one work-log lock for import and filter', () => {
  const emptyPlan = (validate?: SubsetPlan['validate']): SubsetPlan => {
    const none = {
      pullRequests: 0,
      tickets: 0,
      prReviews: 0,
      messages: 0,
      documents: 0,
    };
    return {
      files: [],
      directories: [],
      selection: {
        version: 1,
        createdAt: '2026-11-08T00:00:00.000Z',
        filters: ['synthetic'],
        counts: none,
        totals: none,
      },
      ...(validate ? { validate } : {}),
    };
  };

  function world() {
    const w = makeWorld();
    roots.push(w.base);
    stage(w.staging, 'a.md', messageFrontmatter(1));
    return w;
  }

  const importBatch = (
    w: ReturnType<typeof world>,
    env: ImportEnv = createImportEnv(),
  ) =>
    runImport({
      mode: 'import',
      stagingDir: w.staging,
      workLogRoot: w.workLog,
      target: { kind: 'ic' },
      sources: SYNTH_SOURCES,
      env,
    });

  it('refuses an import while a filter holds the lock, changing no record', async () => {
    const w = world();
    let during: ReturnType<typeof importBatch> | undefined;

    await replaceFilteredSubset(
      w.workLog,
      emptyPlan(() => {
        during = importBatch(w);
      }),
    );

    expect(during?.ok).toBe(false);
    expect(during?.issues.map((i) => i.code)).toEqual(['IMPORT_IN_PROGRESS']);
    expect(during?.issues[0]?.message).toMatch(
      /`work-chronicler filter` run \(process \d+ .*\) holds the work-log lock \(\.import-lock\)/,
    );
    expect(existsSync(join(w.workLog, 'messages'))).toBe(false);
    // Once the filter has finished, the same import runs
    expect(importBatch(w).ok).toBe(true);
  });

  it('refuses filter and filter --clear while an import holds the lock', async () => {
    const w = world();
    let replacing: Promise<unknown> | undefined;
    let clearing: unknown;
    const env: ImportEnv = {
      ...createImportEnv(),
      fs: hookedFs(nodeImportFs, (op, args) => {
        // Mid-commit: the first record is about to be applied
        if (
          replacing === undefined &&
          op === 'writeFile' &&
          String(args[0]).includes(join('.import-transaction', 'applying'))
        ) {
          replacing = replaceFilteredSubset(w.workLog, emptyPlan());
          try {
            clearFilteredSubset(w.workLog);
          } catch (error) {
            clearing = error;
          }
        }
      }),
    };

    const imported = importBatch(w, env);

    expect(imported.ok).toBe(true);
    expect(replacing).toBeDefined();
    await expect(replacing).rejects.toThrow(FilterInProgressError);
    await expect(replacing).rejects.toThrow(
      /Another `work-chronicler import` run \(process \d+ .*\) holds .*\.import-lock\..*If you know no import is running/,
    );
    expect(clearing).toBeInstanceOf(FilterInProgressError);
    expect(existsSync(join(w.workLog, 'filtered'))).toBe(false);
    // The import released the whole lock: filter runs now
    await replaceFilteredSubset(w.workLog, emptyPlan());
    expect(readdirSync(w.workLog).sort()).toEqual(['filtered', 'messages']);
  });

  it.each<[string, boolean, string]>([
    ['honors a live', true, 'IMPORT_IN_PROGRESS'],
    ['takes over a stale', false, ''],
  ])(
    '%s 0.6.0 filter lock (.filter-lock alone, no boot ID or command)',
    (_, alive, code) => {
      const w = world();
      const lock = join(w.workLog, '.filter-lock');
      mkdirSync(lock);
      writeFileSync(
        join(lock, 'owner.json'),
        JSON.stringify({
          version: 1,
          pid: DEAD_PID,
          hostname: hostname(),
          startedAt: 1,
          runId: 'filter-060',
        }),
      );

      const result = importBatch(w, {
        ...createImportEnv(),
        isProcessAlive: (pid) => (pid === DEAD_PID ? alive : true),
      });

      if (alive) {
        expect(result.issues.map((i) => i.code)).toEqual([code]);
        expect(result.issues[0]?.message).toMatch(
          /`work-chronicler filter` run .* holds the work-log lock \(\.filter-lock\)/,
        );
        // Its own first name was released; the 0.6.0 lock is untouched
        expect(readdirSync(w.workLog)).toEqual(['.filter-lock']);
        expect(
          JSON.parse(readFileSync(join(lock, 'owner.json'), 'utf-8')).runId,
        ).toBe('filter-060');
      } else {
        expect(result.ok).toBe(true);
        expect(readdirSync(w.workLog)).toEqual(['messages']);
      }
    },
  );

  it('lets validate run while a filter holds the lock (a filter changes no record)', async () => {
    const w = world();
    let checked: ReturnType<typeof importBatch> | undefined;

    await replaceFilteredSubset(
      w.workLog,
      emptyPlan(() => {
        checked = runImport({
          mode: 'validate',
          stagingDir: w.staging,
          workLogRoot: w.workLog,
          target: { kind: 'ic' },
          sources: SYNTH_SOURCES,
        });
      }),
    );

    expect(checked?.ok).toBe(true);
    expect(checked?.issues).toEqual([]);
  });
});
