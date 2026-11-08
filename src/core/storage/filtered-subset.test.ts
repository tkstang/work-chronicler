import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { snapshot } from '@core/import/import.test-support';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearFilteredSubset,
  readFilterLock,
  FilterInProgressError,
  type FilterSelection,
  FilteredSubsetInterruptedError,
  FilteredSubsetNotRestoredError,
  getEffectiveOutputDir,
  getFilteredSubsetState,
  nodeSubsetFs,
  replaceFilteredSubset,
  type SubsetFs,
  type SubsetPlan,
} from './filtered-subset';

let workLog: string;
let filtered: string;

beforeEach(() => {
  workLog = realpathSync(mkdtempSync(join(tmpdir(), 'wc-subset-')));
  filtered = join(workLog, 'filtered');
});

afterEach(() => {
  rmSync(workLog, { recursive: true, force: true });
});

const counts = { pullRequests: 0, tickets: 0, prReviews: 0, messages: 0 };

function selection(
  filters: string[] = ['Include orgs: acme'],
): FilterSelection {
  return {
    version: 1,
    createdAt: '2026-11-08T00:00:00.000Z',
    filters,
    counts,
    totals: counts,
  };
}

function plan(files: Record<string, string>, extra: Partial<SubsetPlan> = {}) {
  return {
    files: Object.entries(files).map(([path, contents]) => ({
      path,
      contents,
    })),
    directories: ['pull-requests', 'jira', 'pr-reviews', 'messages'],
    selection: selection(),
    ...extra,
  } satisfies SubsetPlan;
}

/** A previous subset, as an earlier `filter` run left it */
async function previousSubset() {
  await replaceFilteredSubset(
    workLog,
    plan({
      'pull-requests/acme/api/2025-01-01_1.md': 'old PR',
      'jira/acme/BILL/BILL-1.md': 'old ticket',
      'pr-reviews/acme/api/9.md': 'old review',
      'messages/slack/aa.md': 'old message',
    }),
  );
  return snapshot(filtered);
}

/** Names in the work-log root other than filtered/ */
function rootLeftovers() {
  return readdirSync(workLog).filter((name) => name !== 'filtered');
}

type Op = keyof SubsetFs;

/** Fail the `nth` call of `op` whose first argument passes `match` */
function failing(
  op: Op,
  match: (path: string) => boolean = () => true,
  nth = 1,
): SubsetFs {
  let seen = 0;
  const fs = { ...nodeSubsetFs } as Record<Op, (...args: never[]) => unknown>;
  const original = nodeSubsetFs[op] as (...args: unknown[]) => unknown;
  fs[op] = ((...args: unknown[]) => {
    if (match(String(args[0])) && ++seen === nth) {
      throw Object.assign(new Error(`injected ${op} failure`), {
        code: 'EIO',
      });
    }
    return original(...args);
  }) as never;
  return fs as unknown as SubsetFs;
}

const inStaging = (path: string) =>
  basename(path).startsWith('.filter-staging') ||
  path.includes('/.filter-staging-');

describe('filtered subset selection', () => {
  it('reads the full work log when there is no subset', () => {
    expect(getFilteredSubsetState(workLog)).toEqual({ status: 'none' });
    expect(getEffectiveOutputDir(workLog)).toEqual({
      dir: workLog,
      isFiltered: false,
    });
    expect(getFilteredSubsetState(join(workLog, 'missing'))).toEqual({
      status: 'none',
    });
  });

  it('selects an empty subset rather than falling back to the full work log', () => {
    mkdirSync(join(workLog, 'pull-requests'), { recursive: true });
    mkdirSync(filtered);

    expect(getEffectiveOutputDir(workLog)).toEqual({
      dir: filtered,
      isFiltered: true,
    });
    // A subset from before 0.6.0 has no marker
    expect(getFilteredSubsetState(workLog)).toEqual({
      status: 'selected',
      dir: filtered,
      selection: null,
      missing: [],
    });
  });

  it('reports record types the full work log has and the subset lacks', () => {
    mkdirSync(join(workLog, 'pr-reviews'));
    mkdirSync(join(workLog, 'messages'));
    mkdirSync(join(filtered, 'pr-reviews'), { recursive: true });

    const state = getFilteredSubsetState(workLog);
    expect(state.status === 'selected' && state.missing).toEqual(['messages']);
  });

  it('refuses to guess while a swap is interrupted', () => {
    mkdirSync(join(workLog, '.filter-previous-abc'));

    expect(getFilteredSubsetState(workLog)).toEqual({
      status: 'interrupted',
      previous: ['.filter-previous-abc'],
      locked: false,
    });
    expect(() => getEffectiveOutputDir(workLog)).toThrow(
      FilteredSubsetInterruptedError,
    );
  });

  it.each<[string, () => void, RegExp]>([
    [
      'a regular file',
      () => writeFileSync(filtered, 'not a directory'),
      /is not a directory, so it is not a filtered subset\. Move or remove it/,
    ],
    [
      'a dangling symbolic link',
      () => symlinkSync(join(workLog, 'missing'), filtered),
      /symbolic link to something that does not exist.*Remove the link/,
    ],
  ])(
    'refuses a filtered/ that is %s, with advice that works',
    async (_, make, message) => {
      make();
      expect(() => getEffectiveOutputDir(workLog)).toThrow(message);
      // The advice does not send the user to a command that fails the same way
      expect(() => getEffectiveOutputDir(workLog)).not.toThrow(/--clear/);
      expect(() => clearFilteredSubset(workLog)).toThrow(message);
      await expect(replaceFilteredSubset(workLog, plan({}))).rejects.toThrow(
        message,
      );
      // After following it, filter works
      rmSync(filtered);
      await replaceFilteredSubset(workLog, plan({}));
      expect(getEffectiveOutputDir(workLog).isFiltered).toBe(true);
    },
  );
});

describe('replaceFilteredSubset', () => {
  it('replaces the previous subset completely, marker included', async () => {
    await previousSubset();

    const { dir, warnings } = await replaceFilteredSubset(
      workLog,
      plan(
        { 'pull-requests/acme/api/2025-02-01_2.md': 'new PR' },
        { selection: selection(['Merged PRs only']) },
      ),
    );

    expect(dir).toBe(filtered);
    expect(warnings).toEqual([]);
    const after = snapshot(filtered);
    expect(Object.keys(after).sort()).toEqual([
      '.filter.json',
      'jira/',
      'messages/',
      'pr-reviews/',
      'pull-requests/acme/api/2025-02-01_2.md',
    ]);
    expect(JSON.parse(after['.filter.json'] ?? '')).toMatchObject({
      filters: ['Merged PRs only'],
    });
    expect(rootLeftovers()).toEqual([]);
  });

  it('publishes an empty subset with its marker', async () => {
    await previousSubset();

    await replaceFilteredSubset(workLog, plan({}));

    const state = getFilteredSubsetState(workLog);
    expect(state.status).toBe('selected');
    expect(state.status === 'selected' && state.selection?.filters).toEqual([
      'Include orgs: acme',
    ]);
    expect(Object.keys(snapshot(filtered)).sort()).toEqual([
      '.filter.json',
      'jira/',
      'messages/',
      'pr-reviews/',
      'pull-requests/',
    ]);
  });

  it.each<[string, () => SubsetFs]>([
    ['creating the staging directory', () => failing('mkdir', inStaging)],
    ['creating a directory in staging', () => failing('mkdirp', inStaging)],
    ['writing a record', () => failing('writeFile', inStaging)],
    [
      'writing the marker',
      () => failing('writeFile', (p) => p.endsWith('.filter.json')),
    ],
    ['reading a record back', () => failing('readFile', inStaging)],
    [
      'moving the previous subset aside',
      () => failing('rename', (p) => p === filtered),
    ],
    ['moving the new subset into place', () => failing('rename', inStaging)],
  ])('keeps the previous subset when %s fails', async (_, fs) => {
    const before = await previousSubset();

    await expect(
      replaceFilteredSubset(
        workLog,
        plan({ 'pull-requests/acme/api/2025-02-01_2.md': 'new PR' }),
        { fs: fs() },
      ),
    ).rejects.toThrow('injected');

    expect(snapshot(filtered)).toEqual(before);
    expect(getEffectiveOutputDir(workLog).dir).toBe(filtered);
    expect(rootLeftovers()).toEqual([]);
  });

  it('keeps the previous subset when a record reads back differently', async () => {
    const before = await previousSubset();
    const fs: SubsetFs = {
      ...nodeSubsetFs,
      readFile: (path) =>
        inStaging(path) && path.endsWith('.md')
          ? Buffer.from('torn write')
          : nodeSubsetFs.readFile(path),
    };

    await expect(
      replaceFilteredSubset(workLog, plan({ 'jira/a/B/B-1.md': 'ticket' }), {
        fs,
      }),
    ).rejects.toThrow(/did not read back/);
    expect(snapshot(filtered)).toEqual(before);
  });

  it('keeps the previous subset when validation rejects the new one', async () => {
    const before = await previousSubset();

    await expect(
      replaceFilteredSubset(
        workLog,
        plan(
          {},
          {
            validate: () => {
              throw new Error('record count mismatch');
            },
          },
        ),
      ),
    ).rejects.toThrow('record count mismatch');
    expect(snapshot(filtered)).toEqual(before);
    expect(rootLeftovers()).toEqual([]);
  });

  it('touches nothing when filtered/ cannot be inspected', async () => {
    const before = await previousSubset();

    await expect(
      replaceFilteredSubset(workLog, plan({}), {
        fs: failing('lstat', (p) => p === filtered),
      }),
    ).rejects.toThrow('injected');
    expect(snapshot(filtered)).toEqual(before);
  });

  it('restores the previous subset after a swap interrupted between renames', async () => {
    const before = await previousSubset();
    // A run that stopped after moving the previous subset aside
    renameSync(filtered, join(workLog, '.filter-previous-crash'));
    mkdirSync(join(workLog, '.filter-staging-crash'));
    expect(() => getEffectiveOutputDir(workLog)).toThrow(
      FilteredSubsetInterruptedError,
    );

    // The next run puts it back first, so its own failure keeps it
    await expect(
      replaceFilteredSubset(workLog, plan({ 'x.md': 'x' }), {
        fs: failing('writeFile', inStaging),
      }),
    ).rejects.toThrow('injected');
    expect(snapshot(filtered)).toEqual(before);

    await replaceFilteredSubset(workLog, plan({ 'x.md': 'x' }));
    expect(Object.keys(snapshot(filtered))).toContain('x.md');
    expect(rootLeftovers()).toEqual([]);
  });

  it('keeps the previous subset where the next run finds it when it cannot be put back', async () => {
    const before = await previousSubset();
    let renames = 0;
    const fs: SubsetFs = {
      ...nodeSubsetFs,
      rename: (from, to) => {
        // Taking and releasing the lock are not part of the swap
        if (from.includes('.filter-lock') || to.includes('.filter-lock')) {
          nodeSubsetFs.rename(from, to);
          return;
        }
        renames += 1;
        // The previous subset moves aside; neither the new one nor the old
        // one can then be moved to filtered/
        if (renames > 1) {
          throw Object.assign(new Error('injected rename failure'), {
            code: 'EIO',
          });
        }
        nodeSubsetFs.rename(from, to);
      },
    };

    await expect(
      replaceFilteredSubset(workLog, plan({}), { fs }),
    ).rejects.toThrow(/nor the previous one back.*filter-previous/);
    expect(existsSync(filtered)).toBe(false);
    expect(getFilteredSubsetState(workLog).status).toBe('interrupted');

    await expect(
      replaceFilteredSubset(workLog, plan({}), {
        fs: failing('mkdir', inStaging),
      }),
    ).rejects.toThrow('injected');
    expect(snapshot(filtered)).toEqual(before);
  });

  it('reports, without failing, a previous subset it could not remove', async () => {
    await previousSubset();

    const { warnings } = await replaceFilteredSubset(workLog, plan({}), {
      fs: failing('rm', (p) => basename(p).startsWith('.filter-previous-')),
    });

    expect(warnings).toEqual([
      expect.stringMatching(/Could not remove .*\.filter-previous-.*EIO/),
    ]);
    expect(getEffectiveOutputDir(workLog).dir).toBe(filtered);
    expect(Object.keys(snapshot(filtered))).not.toContain(
      'pull-requests/acme/api/2025-01-01_1.md',
    );
  });

  /** Fail listing the work log once `filtered/` has been put in place */
  function failListingAfterPublishing(): SubsetFs {
    let published = false;
    return {
      ...nodeSubsetFs,
      rename: (from, to) => {
        nodeSubsetFs.rename(from, to);
        if (to === filtered) published = true;
      },
      readdir: (path) => {
        if (published && path === workLog) {
          throw Object.assign(new Error('injected readdir failure'), {
            code: 'EIO',
          });
        }
        return nodeSubsetFs.readdir(path);
      },
    };
  }

  it('reports the new subset, with a warning, when listing leftovers fails after it is in place', async () => {
    await previousSubset();

    const { dir, warnings } = await replaceFilteredSubset(
      workLog,
      plan({ 'pull-requests/acme/api/2025-02-02_2.md': 'new PR' }),
      { fs: failListingAfterPublishing() },
    );

    expect(dir).toBe(filtered);
    expect(warnings).toEqual([
      expect.stringMatching(
        /Could not list .*EIO.*the filtered subset is in place/,
      ),
    ]);
    expect(getEffectiveOutputDir(workLog).dir).toBe(filtered);
    expect(Object.keys(snapshot(filtered))).toContain(
      'pull-requests/acme/api/2025-02-02_2.md',
    );
  });

  it('marks the one failure that leaves the subset changed', async () => {
    await previousSubset();
    let renames = 0;
    const fs: SubsetFs = {
      ...nodeSubsetFs,
      rename: (from, to) => {
        if (from.includes('.filter-lock') || to.includes('.filter-lock')) {
          nodeSubsetFs.rename(from, to);
          return;
        }
        if (++renames > 1) {
          throw Object.assign(new Error('injected rename failure'), {
            code: 'EIO',
          });
        }
        nodeSubsetFs.rename(from, to);
      },
    };

    await expect(
      replaceFilteredSubset(workLog, plan({}), { fs }),
    ).rejects.toBeInstanceOf(FilteredSubsetNotRestoredError);
    // Any earlier failure leaves the subset unchanged and is not marked
    await expect(
      replaceFilteredSubset(workLog, plan({}), {
        fs: failing('mkdir', inStaging),
      }),
    ).rejects.not.toBeInstanceOf(FilteredSubsetNotRestoredError);
  });

  it('refuses paths outside the subset before touching anything', async () => {
    const before = await previousSubset();
    await expect(
      replaceFilteredSubset(workLog, plan({ '../escape.md': 'x' })),
    ).rejects.toThrow(/outside the filtered subset/);
    expect(snapshot(filtered)).toEqual(before);
  });
});

describe('clearFilteredSubset', () => {
  it('removes the subset', async () => {
    await previousSubset();

    expect(clearFilteredSubset(workLog)).toEqual({
      cleared: true,
      warnings: [],
    });
    expect(getEffectiveOutputDir(workLog).isFiltered).toBe(false);
    expect(readdirSync(workLog)).toEqual([]);
    expect(clearFilteredSubset(workLog).cleared).toBe(false);
  });

  it('deselects the subset even when removing it fails', async () => {
    await previousSubset();

    const { cleared, warnings } = clearFilteredSubset(workLog, {
      fs: failing('rm', (p) => basename(p).startsWith('.filter-cleared-')),
    });

    expect(cleared).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(getFilteredSubsetState(workLog)).toEqual({ status: 'none' });
  });

  it('reports the subset cleared, with a warning, when listing leftovers then fails', async () => {
    await previousSubset();
    let deselected = false;
    const fs: SubsetFs = {
      ...nodeSubsetFs,
      rename: (from, to) => {
        nodeSubsetFs.rename(from, to);
        if (from === filtered) deselected = true;
      },
      readdir: (path) => {
        if (deselected && path === workLog) {
          throw Object.assign(new Error('injected readdir failure'), {
            code: 'EIO',
          });
        }
        return nodeSubsetFs.readdir(path);
      },
    };

    const { cleared, warnings } = clearFilteredSubset(workLog, { fs });

    expect(cleared).toBe(true);
    expect(warnings).toEqual([
      expect.stringMatching(
        /Could not list .*EIO.*the filtered subset is cleared/,
      ),
    ]);
    expect(getFilteredSubsetState(workLog)).toEqual({ status: 'none' });
  });

  it('clears an interrupted swap so it is not restored', () => {
    mkdirSync(join(workLog, '.filter-previous-crash'));

    expect(clearFilteredSubset(workLog).cleared).toBe(true);
    expect(getFilteredSubsetState(workLog)).toEqual({ status: 'none' });
    expect(readdirSync(workLog)).toEqual([]);
  });
});

describe('one filter run at a time', () => {
  /** Plan whose only file is named after the run */
  const runPlan = (tag: string) =>
    plan(
      { [`pull-requests/o/r/${tag}.md`]: tag },
      { selection: selection([tag]) },
    );

  // The interleaving that used to lose both subsets: run B starts while run
  // A is between its two renames, or right after its swap while A cleans up
  it.each<[string, (from: string, to: string) => boolean]>([
    [
      'between its two renames',
      (from, to) => from === filtered && to.includes('.filter-previous-'),
    ],
    [
      'after its swap, before its cleanup',
      (from, to) => from.includes('.filter-staging-') && to === filtered,
    ],
  ])(
    "refuses a second run started while the first is %s, and keeps the first run's subset",
    async (_, trigger) => {
      await replaceFilteredSubset(workLog, runPlan('S0'));
      let second: Promise<unknown> | undefined;
      const fs: SubsetFs = {
        ...nodeSubsetFs,
        rename: (from, to) => {
          nodeSubsetFs.rename(from, to);
          if (!second && trigger(from, to)) {
            second = replaceFilteredSubset(workLog, runPlan('B'));
          }
        },
      };

      await replaceFilteredSubset(workLog, runPlan('A'), { fs });

      expect(second).toBeDefined();
      await expect(second).rejects.toThrow(FilterInProgressError);
      await expect(second).rejects.toThrow(/subset was not changed/);
      const state = getFilteredSubsetState(workLog);
      expect(state.status === 'selected' && state.selection?.filters).toEqual([
        'A',
      ]);
      expect(Object.keys(snapshot(filtered))).toContain(
        'pull-requests/o/r/A.md',
      );
      expect(rootLeftovers()).toEqual([]);
    },
  );

  function holdLock(owner: Record<string, unknown>) {
    mkdirSync(join(workLog, '.filter-lock'));
    writeFileSync(
      join(workLog, '.filter-lock', 'owner.json'),
      JSON.stringify({
        version: 1,
        pid: 4242,
        hostname: 'this-host',
        startedAt: 2_000,
        runId: 'other',
        ...owner,
      }),
    );
  }

  const env = (alive: boolean) => ({
    hostname: 'this-host',
    bootId: () => 'this-boot',
    isProcessAlive: () => alive,
  });

  it('refuses replace and clear while a live run holds the lock', async () => {
    const before = await previousSubset();
    holdLock({});

    await expect(
      replaceFilteredSubset(workLog, runPlan('B'), { env: env(true) }),
    ).rejects.toThrow(FilterInProgressError);
    expect(() => clearFilteredSubset(workLog, { env: env(true) })).toThrow(
      FilterInProgressError,
    );
    expect(snapshot(filtered)).toEqual(before);
    expect(rootLeftovers()).toEqual(['.filter-lock']);
  });

  it.each<[string, Record<string, unknown>, boolean]>([
    ['a running process on another machine', { hostname: 'elsewhere' }, false],
    ['an unreadable owner', { version: 'x' }, false],
    // The wall clock never decides: an owner whose start time looks older
    // than this boot (a clock that jumped) is respected while it runs
    [
      'a running process of this boot whose start time looks older',
      { startedAt: 500, bootId: 'this-boot' },
      true,
    ],
    [
      'a running process from 0.6.0 (no boot ID), whatever its start time',
      { startedAt: 500 },
      true,
    ],
  ])('respects a lock held by %s', async (_, owner, alive) => {
    await previousSubset();
    holdLock(owner);

    await expect(
      replaceFilteredSubset(workLog, runPlan('B'), { env: env(alive) }),
    ).rejects.toThrow(FilterInProgressError);
  });

  it.each<[string, Record<string, unknown>]>([
    ['has exited', { bootId: 'this-boot' }],
    ['has exited (a 0.6.0 lock, no boot ID)', {}],
    // Its PID is running again, but it ran in an earlier boot
    ['ran in an earlier boot', { bootId: 'earlier-boot' }],
  ])('takes over a lock whose owner %s', async (_, owner) => {
    await previousSubset();
    holdLock(owner);
    const alive = owner['bootId'] === 'earlier-boot';

    await replaceFilteredSubset(workLog, runPlan('B'), { env: env(alive) });

    const state = getFilteredSubsetState(workLog);
    expect(state.status === 'selected' && state.selection?.filters).toEqual([
      'B',
    ]);
    expect(rootLeftovers()).toEqual([]);
  });

  it('tells readers a swap is in progress while the lock is held', () => {
    mkdirSync(join(workLog, '.filter-previous-abc'));
    holdLock({});

    expect(() => getEffectiveOutputDir(workLog)).toThrow(
      /is replacing .* \(it holds \.filter-lock\)/,
    );
  });

  it('names the lock, its holder and a safe way out when the holder is elsewhere', async () => {
    await previousSubset();
    holdLock({ hostname: 'Old-Hostname.local' });
    const lockPath = join(workLog, '.filter-lock');
    const message = new RegExp(
      `run \\(process 4242 on Old-Hostname\\.local, started .*\\) holds ${lockPath}\\..*If you know no filter is running .*remove ${lockPath} and try again`,
    );

    await expect(
      replaceFilteredSubset(workLog, runPlan('B'), { env: env(false) }),
    ).rejects.toThrow(message);
    expect(() => clearFilteredSubset(workLog, { env: env(false) })).toThrow(
      message,
    );
    expect(readFilterLock(workLog)).toEqual({
      path: lockPath,
      owner: { pid: 4242, hostname: 'Old-Hostname.local', startedAt: 2_000 },
    });

    // Following the advice works
    rmSync(lockPath, { recursive: true });
    await replaceFilteredSubset(workLog, runPlan('B'), { env: env(false) });
    expect(readFilterLock(workLog)).toBeNull();
  });

  it('releases by moving the lock aside first, so it is never an empty directory another run could claim', async () => {
    let contender: Promise<unknown> | undefined;
    const removed: string[] = [];
    const fs: SubsetFs = {
      ...nodeSubsetFs,
      rm: (path) => {
        removed.push(basename(path));
        // While the released copy is being removed, another run starts
        if (!contender && basename(path).startsWith('.filter-lock.released-')) {
          contender = replaceFilteredSubset(workLog, runPlan('C'));
        }
        nodeSubsetFs.rm(path);
      },
    };

    const { warnings } = await replaceFilteredSubset(workLog, runPlan('A'), {
      fs,
    });

    expect(warnings).toEqual([]);
    expect(removed).not.toContain('.filter-lock');
    // The contender found the lock free and ran normally
    await expect(contender).resolves.toMatchObject({ warnings: [] });
    const state = getFilteredSubsetState(workLog);
    expect(state.status === 'selected' && state.selection?.filters).toEqual([
      'C',
    ]);
    expect(rootLeftovers()).toEqual([]);
  });

  it('never warns that the live lock can be deleted when its removal fails', async () => {
    const { warnings } = await replaceFilteredSubset(workLog, runPlan('A'), {
      fs: failing('rm', (p) =>
        basename(p).startsWith('.filter-lock.released-'),
      ),
    });

    expect(warnings).toEqual([
      expect.stringMatching(
        /\.filter-lock\.released-.*it is a released lock, no longer in use, and can be deleted/,
      ),
    ]);
    expect(readFilterLock(workLog)).toBeNull();
  });

  // A stale lock and three runs: only one may hold the lock at a time
  it.each<[string, (from: string, to: string) => boolean]>([
    [
      'while the first taker holds the takeover guard',
      (from, to) =>
        from.includes('.filter-lock.claim-') &&
        to.endsWith('.filter-lock.takeover'),
    ],
    [
      'while the stale lock is moved aside',
      (from, to) => from.endsWith('.filter-lock') && to.includes('.stale-'),
    ],
  ])(
    'lets exactly one run take over a stale lock when others start %s',
    async (_, trigger) => {
      holdLock({ pid: 999 });
      const deadEnv = {
        hostname: 'this-host',
        bootId: () => 'this-boot',
        isProcessAlive: (pid: number) => pid !== 999,
      };
      let inside = 0;
      let maxInside = 0;
      const gates: (() => void)[] = [];
      const gated = (tag: string) =>
        plan(
          { [`pull-requests/o/r/${tag}.md`]: tag },
          {
            selection: selection([tag]),
            validate: async () => {
              inside++;
              maxInside = Math.max(maxInside, inside);
              await new Promise<void>((resolve) => gates.push(resolve));
              inside--;
            },
          },
        );
      const others: Promise<string>[] = [];
      const fs: SubsetFs = {
        ...nodeSubsetFs,
        rename: (from, to) => {
          nodeSubsetFs.rename(from, to);
          if (others.length === 0 && trigger(from, to)) {
            for (const [tag, pid] of [
              ['B', 101],
              ['D', 103],
            ] as const) {
              others.push(
                replaceFilteredSubset(workLog, gated(tag), {
                  env: { ...deadEnv, pid },
                }).then(
                  () => `${tag} ok`,
                  (error: Error) => `${tag} refused: ${error.name}`,
                ),
              );
            }
          }
        },
      };

      const first = replaceFilteredSubset(workLog, gated('C'), {
        fs,
        env: { ...deadEnv, pid: 102 },
      }).then(
        () => 'C ok',
        (error: Error) => `C refused: ${error.name}`,
      );
      // Let every run that got in reach its gate, then let them all finish
      for (let i = 0; i < 20 && gates.length < 1; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      while (gates.length > 0) gates.shift()?.();
      const outcomes = await Promise.all([first, ...others]);

      expect(maxInside).toBe(1);
      expect(outcomes.filter((o) => o.endsWith(' ok'))).toHaveLength(1);
      expect(
        outcomes.filter((o) => o.includes('refused: FilterInProgressError')),
      ).toHaveLength(2);
      expect(rootLeftovers()).toEqual([]);
    },
  );

  it('names a takeover guard left by a run that exited instead of asking to retry', async () => {
    holdLock({ pid: 999 });
    const guard = join(workLog, '.filter-lock.takeover');
    mkdirSync(guard);
    writeFileSync(
      join(guard, 'owner.json'),
      JSON.stringify({
        version: 1,
        pid: 998,
        hostname: 'this-host',
        startedAt: 2_000,
        runId: 'r998',
      }),
    );

    const run = replaceFilteredSubset(workLog, runPlan('A'), {
      env: {
        hostname: 'this-host',
        bootId: () => 'this-boot',
        isProcessAlive: (pid) => pid !== 999 && pid !== 998,
      },
    });

    await expect(run).rejects.toThrow(/exited while taking over/);
    await expect(run).rejects.toThrow(guard);
    expect(existsSync(join(workLog, 'filtered'))).toBe(false);
  });

  it('removes what earlier runs left beside the lock, but not a run about to claim', async () => {
    const owner = (pid: number) =>
      JSON.stringify({
        version: 1,
        pid,
        hostname: 'this-host',
        startedAt: 2_000,
        runId: `r${pid}`,
      });
    const leave = (name: string, contents?: string, old = false) => {
      const dir = join(workLog, name);
      mkdirSync(dir);
      if (contents) writeFileSync(join(dir, 'owner.json'), contents);
      if (old) utimesSync(dir, new Date(0), new Date(0));
    };
    leave('.filter-lock.stale-old', owner(1));
    leave('.filter-lock.released-old', owner(1));
    leave('.filter-lock.claim-gone', owner(999));
    leave('.filter-lock.claim-live', owner(101));
    leave('.filter-lock.claim-empty-old', undefined, true);
    leave('.filter-lock.claim-empty-new');
    leave('.filter-lock.takeover', owner(999));

    await replaceFilteredSubset(workLog, runPlan('A'), {
      env: {
        hostname: 'this-host',
        bootId: () => 'this-boot',
        isProcessAlive: (pid) => pid !== 999 && pid !== 1,
      },
    });

    expect(rootLeftovers().sort()).toEqual([
      '.filter-lock.claim-empty-new',
      '.filter-lock.claim-live',
    ]);
  });
});
