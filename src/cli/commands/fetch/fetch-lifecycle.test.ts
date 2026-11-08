import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// GitHub is the external system: each repo maps to a canned response, and
// every pulls.list request is recorded as `<org>/<repo>`.
const repoResponses = new Map<string, 'not-found' | 'empty' | 'rate-limited'>();
const pullsRequested: string[] = [];
const searches: string[] = [];

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    users = {
      getByUsername: async () => {
        throw Object.assign(new Error('Not Found'), { status: 404 });
      },
    };
    search = {
      issuesAndPullRequests: async ({ q }: { q: string }) => {
        searches.push(q);
        return {
          data: { total_count: 0, incomplete_results: false, items: [] },
        };
      },
    };
    pulls = {
      list: async ({ owner, repo }: { owner: string; repo: string }) => {
        pullsRequested.push(`${owner}/${repo}`);
        const response = repoResponses.get(repo);
        if (response === 'empty') return { data: [] };
        if (response === 'rate-limited') {
          throw Object.assign(new Error('Too Many Requests'), { status: 429 });
        }
        throw Object.assign(new Error('Not Found'), { status: 404 });
      },
    };
  },
}));

// Isolate HOME and the workspace before any module computes a default path,
// so nothing here can read or write the real ~/.work-chronicler.
const home = mkdtempSync(join(tmpdir(), 'wc-fetch-lifecycle-'));
const workspace = join(home, 'workspace');
vi.stubEnv('HOME', home);
vi.stubEnv('WORK_CHRONICLER_HOME', workspace);
vi.stubEnv('GITHUB_TOKEN', '');

const { Command } = await import('commander');
const { handleCliError } = await import('@cli/errors');
const { fetchCommand } = await import('./index');
const { getPRReviewFilePath, getWorkLogDir, writeMarkdownFile } =
  await import('@core/index');

/**
 * Run `work-chronicler <args>` with the same error wiring as src/cli/index.ts:
 * anything thrown reaches handleCliError, whose result becomes the exit code.
 */
async function runCli(args: string[]) {
  const stderr: string[] = [];
  let handled = false;
  const program = new Command('work-chronicler').addCommand(fetchCommand);
  await program.parseAsync(args, { from: 'user' }).catch((error: unknown) => {
    handled = true;
    process.exitCode = handleCliError(error, {
      error: (text) => stderr.push(text),
      log: () => {},
    });
  });
  return { handled, exitCode: process.exitCode, stderr: stderr.join('\n') };
}

function writeProfileConfig(profile: string, yaml: string) {
  const dir = join(workspace, 'profiles', profile);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.yaml'), yaml);
}

describe('fetch command lifecycle', () => {
  let logs: string[];

  beforeEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    mkdirSync(workspace, { recursive: true });
    repoResponses.clear();
    pullsRequested.length = 0;
    searches.length = 0;
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  afterAll(() => {
    vi.unstubAllEnvs();
    rmSync(home, { recursive: true, force: true });
  });

  it('finishes `fetch github` with exit code 1 when an org fetches nothing, still fetching later orgs', async () => {
    vi.stubEnv('WORK_CHRONICLER_PROFILE', 'default');
    writeProfileConfig(
      'default',
      [
        'github:',
        '  username: octocat',
        '  token: test-token',
        '  orgs:',
        '    - name: voxmedia',
        '      repos: [a, b]',
        '    - name: acme',
        '      repos: [web]',
        'fetch:',
        '  since: "2025-01-01"',
        '  until: "2025-06-01"',
      ].join('\n'),
    );
    repoResponses.set('web', 'empty');

    const result = await runCli(['fetch', 'github', '--cache']);

    expect(result.handled).toBe(false);
    expect(result.exitCode).toBe(1);
    expect(pullsRequested).toEqual(['voxmedia/a', 'voxmedia/b', 'acme/web']);
    expect(logs.some((line) => line.includes('Fetched'))).toBe(true);
  });

  it('stops manager `fetch all` at a rate limit before the next report and exits 1 through the handler', async () => {
    vi.stubEnv('WORK_CHRONICLER_PROFILE', 'manager');
    writeProfileConfig(
      'manager',
      [
        'mode: manager',
        'github:',
        '  token: test-token',
        '  org: voxmedia',
        'fetch:',
        '  since: "2025-01-01"',
        '  until: "2025-06-01"',
        'reports:',
        '  - name: Alice Smith',
        '    github: alice',
        '    email: alice@example.com',
        '    repos: [alpha]',
        '  - name: Bob Jones',
        '    github: bob',
        '    email: bob@example.com',
        '    repos: [beta]',
      ].join('\n'),
    );
    repoResponses.set('alpha', 'rate-limited');
    repoResponses.set('beta', 'empty');

    const result = await runCli([
      'fetch',
      'all',
      '--all-reports',
      '--cache',
      '--no-link',
    ]);

    expect(result.handled).toBe(true);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('GitHub API rate limit exceeded.');
    expect(pullsRequested).toEqual(['voxmedia/alpha']);
  });

  describe('PR reviews given', () => {
    const icConfig = [
      'github:',
      '  username: octocat',
      '  token: test-token',
      '  orgs:',
      '    - name: acme',
      '      repos: [web]',
      'fetch:',
      '  since: "2025-01-01"',
      '  until: "2025-06-01"',
    ].join('\n');

    beforeEach(() => {
      vi.stubEnv('WORK_CHRONICLER_PROFILE', 'default');
      writeProfileConfig('default', icConfig);
      repoResponses.set('web', 'empty');
    });

    it('are fetched only when asked for with --reviews', async () => {
      await runCli(['fetch', 'github', '--cache']);
      expect(searches).toEqual([]);

      const result = await runCli([
        'fetch',
        'all',
        '--cache',
        '--no-link',
        '--reviews',
      ]);

      expect(result.exitCode).toBeUndefined();
      expect(searches).toEqual([
        'is:pr reviewed-by:octocat -author:octocat org:acme updated:>=2025-01-01',
      ]);
    });

    it.each([
      ['fetch', 'github', '--cache', '--reviews'],
      ['fetch', 'all', '--cache', '--no-link', '--reviews'],
    ])(
      "refuse `%s %s` before fetching anything when the work log holds another reviewer's records",
      async (...args) => {
        writeMarkdownFile(
          getPRReviewFilePath(getWorkLogDir('default'), 'acme', 'web', 1),
          {
            type: 'pr-review',
            reviewer: 'alice',
            pr: {
              url: 'https://github.com/acme/web/pull/1',
              org: 'acme',
              repository: 'web',
              prNumber: 1,
              title: 'Synthetic PR',
              author: 'carol',
              state: 'open',
            },
            prUpdatedAt: '2025-05-01T00:00:00Z',
            reviews: [],
            comments: [],
          },
          '',
        );

        const result = await runCli(args);

        expect(result.handled).toBe(true);
        expect(result.exitCode).not.toBe(0);
        expect(result.exitCode).toBeDefined();
        expect(result.stderr).toContain(
          'review record(s) for another GitHub user (alice)',
        );
        expect(pullsRequested).toEqual([]);
        expect(searches).toEqual([]);
      },
    );

    it('are skipped with a notice for manager profiles while PRs are still fetched', async () => {
      vi.stubEnv('WORK_CHRONICLER_PROFILE', 'manager');
      writeProfileConfig(
        'manager',
        [
          'mode: manager',
          'github:',
          '  token: test-token',
          '  org: voxmedia',
          'fetch:',
          '  since: "2025-01-01"',
          'reports:',
          '  - name: Alice Smith',
          '    github: alice',
          '    email: alice@example.com',
          '    repos: [alpha]',
        ].join('\n'),
      );
      repoResponses.set('alpha', 'empty');

      const result = await runCli([
        'fetch',
        'github',
        '--all-reports',
        '--cache',
        '--reviews',
      ]);

      expect(result.exitCode).toBeUndefined();
      expect(
        logs.some((line) => line.includes('only fetched for IC profiles')),
      ).toBe(true);
      expect(pullsRequested).toEqual(['voxmedia/alpha']);
      expect(searches).toEqual([]);
    });
  });

  describe('manager reports with a failed JIRA project', () => {
    beforeEach(() => {
      vi.stubEnv('WORK_CHRONICLER_PROFILE', 'manager');
      writeProfileConfig(
        'manager',
        [
          'mode: manager',
          'github:',
          '  token: test-token',
          '  org: voxmedia',
          'jira:',
          '  host: acme.atlassian.net',
          '  email: manager@example.com',
          '  token: jira-token',
          'fetch:',
          '  since: "2025-01-01"',
          '  until: "2025-06-01"',
          'reports:',
          '  - name: Alice Smith',
          '    github: alice',
          '    email: alice@example.com',
          '    repos: [alpha]',
          '    jiraProjects: [BROKEN]',
          '  - name: Bob Jones',
          '    github: bob',
          '    email: bob@example.com',
          '    repos: [beta]',
          '    jiraProjects: [OK]',
        ].join('\n'),
      );
      repoResponses.set('alpha', 'empty');
      repoResponses.set('beta', 'empty');
      // JIRA is the other external system: project BROKEN fails with a 500,
      // every other project returns one empty last page.
      vi.stubGlobal(
        'fetch',
        vi.fn(async (_url: string, init: RequestInit) =>
          String(init.body).includes('project = \\"BROKEN\\"')
            ? new Response('boom', { status: 500 })
            : Response.json({ issues: [], isLast: true }),
        ),
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    const reportLine = (name: string) =>
      logs.find(
        (line) =>
          line.includes(`${name} complete`) ||
          line.includes(`${name} incomplete`),
      );

    it.each([
      [
        'jira',
        ['fetch', 'jira', '--all-reports', '--cache'],
        '0 tickets fetched',
      ],
      [
        'all',
        ['fetch', 'all', '--all-reports', '--cache', '--no-link'],
        '0 PRs, 0 tickets',
      ],
    ])(
      '`fetch %s` labels the report whose JIRA project failed incomplete, not complete',
      async (_subcommand, args, counts) => {
        const result = await runCli(args);

        expect(result.exitCode).toBe(1);
        expect(reportLine('Alice Smith')).toContain(
          `⚠ Alice Smith incomplete (${counts}; JIRA failed for BROKEN)`,
        );
        expect(reportLine('Bob Jones')).toContain(
          `✓ Bob Jones complete (${counts})`,
        );
      },
    );
  });
});
