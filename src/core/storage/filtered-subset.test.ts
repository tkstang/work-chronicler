import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { snapshot } from '@core/import/import.test-support';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  clearFilteredSubset,
  type FilterSelection,
  FilteredSubsetInterruptedError,
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
    });
    expect(() => getEffectiveOutputDir(workLog)).toThrow(
      FilteredSubsetInterruptedError,
    );
  });

  it('refuses a filtered/ that is not a directory', () => {
    writeFileSync(filtered, 'not a directory');
    expect(() => getEffectiveOutputDir(workLog)).toThrow(/not a directory/);
  });
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
    ['creating the staging directory', () => failing('mkdir')],
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
        fs: failing('mkdir'),
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
      fs: failing('rm'),
    });

    expect(cleared).toBe(true);
    expect(warnings).toHaveLength(1);
    expect(getFilteredSubsetState(workLog)).toEqual({ status: 'none' });
  });

  it('clears an interrupted swap so it is not restored', () => {
    mkdirSync(join(workLog, '.filter-previous-crash'));

    expect(clearFilteredSubset(workLog).cleared).toBe(true);
    expect(getFilteredSubsetState(workLog)).toEqual({ status: 'none' });
    expect(readdirSync(workLog)).toEqual([]);
  });
});
