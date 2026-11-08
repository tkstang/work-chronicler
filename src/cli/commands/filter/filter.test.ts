import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The `filter` command, run in process against a synthetic work log. Subset
// replacement and its file safety are tested in @core/storage; these tests
// cover how the options select records. Isolate HOME and the workspace
// before any module computes a path.
const root = mkdtempSync(join(tmpdir(), 'wc-filter-'));
vi.stubEnv('HOME', join(root, 'home'));
vi.stubEnv('WORK_CHRONICLER_HOME', join(root, 'wc-home'));

const { Command } = await import('commander');
const core = await import('@core/index');
const { filterCommand } = await import('./index');

const configPath = join(root, 'work-chronicler.yaml');
const workLog = join(root, 'work-log');
const filteredDir = join(workLog, 'filtered');

writeFileSync(
  configPath,
  [
    'github:',
    '  username: me',
    'output:',
    '  directory: ./work-log',
    'fetch:',
    '  since: "2025-01-01"',
    '',
  ].join('\n'),
);

afterAll(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

/**
 * Write an authored PR. `repository` is what its frontmatter holds: `fetch`
 * stores the bare name, but a record may hold the full `org/repo` name.
 */
function pr(org: string, repo: string, prNumber: number, repository = repo) {
  core.writeMarkdownFile(
    core.getPRFilePath(
      workLog,
      org,
      repo,
      new Date('2025-02-10T09:00:00Z'),
      prNumber,
    ),
    {
      title: `feat: ${org}/${repo}#${prNumber}`,
      prNumber,
      repository,
      org,
      author: 'me',
      state: 'merged',
      createdAt: '2025-02-10T09:00:00Z',
      mergedAt: '2025-02-11T09:00:00Z',
      closedAt: '2025-02-11T09:00:00Z',
      url: `https://github.com/${org}/${repo}/pull/${prNumber}`,
      additions: 120,
      deletions: 30,
      changedFiles: 5,
      jiraTickets: [],
      labels: [],
    },
    'Synthetic PR.',
  );
}

pr('acme', 'api', 1);
pr('acme', 'api', 2, 'acme/api');
pr('acme', 'web', 3);
pr('acme', 'web', 4, 'acme/web');

async function filter(args: string[]) {
  await new Command('work-chronicler')
    .addCommand(filterCommand)
    .parseAsync(['filter', ...args, '-c', configPath], { from: 'user' });
}

async function selected(): Promise<number[]> {
  return (await core.readAllPRs(filteredDir))
    .map((file) => file.frontmatter.prNumber)
    .sort((a, b) => a - b);
}

describe('filter: repository selectors', () => {
  it('--repo matches a PR stored with the bare or the full repository name', async () => {
    await filter(['--repo', 'acme/api']);
    expect(await selected()).toEqual([1, 2]);
  });

  it('--exclude-repo drops a PR stored with the bare or the full name', async () => {
    await filter(['--exclude-repo', 'ACME/api']);
    expect(await selected()).toEqual([3, 4]);
  });
});

describe('filter: invalid values', () => {
  beforeEach(async () => {
    await filter(['--repo', 'acme/web']);
  });

  it.each([
    [['--min-impact', 'majoor'], /--min-impact "majoor"/],
    [['--exclude-impact', 'minor', 'minr'], /--exclude-impact "minr"/],
    [['--merged-only', '--min-loc', 'abc'], /--min-loc "abc"/],
    [['--merged-only', '--min-loc', '10abc'], /--min-loc "10abc"/],
    [['--merged-only', '--min-loc', '-5'], /--min-loc "-5"/],
  ])('refuses %j and keeps the previous subset', async (args, message) => {
    await expect(filter(args)).rejects.toThrow(message);
    expect(await selected()).toEqual([3, 4]);
  });

  it('accepts a whole number of lines', async () => {
    await filter(['--min-loc', '151']);
    expect(await selected()).toEqual([]);
    await filter(['--min-loc', '150']);
    expect(await selected()).toEqual([1, 2, 3, 4]);
  });
});
