import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Review records (reviews the user gave) share the work log with authored
// PRs. Every authored-PR consumer must give the same answer with or without
// them. Isolate HOME and the workspace before any module computes a path.
const root = mkdtempSync(join(tmpdir(), 'wc-mixed-'));
vi.stubEnv('HOME', join(root, 'home'));
vi.stubEnv('WORK_CHRONICLER_HOME', join(root, 'wc-home'));

const { Command } = await import('commander');
const core = await import('@core/index');
const tools = await import('@mcp/tools/index');
const { analyzeCommand } = await import('./analyze');
const { filterCommand } = await import('./filter');
const { statusCommand } = await import('./status');

const configPath = join(root, 'work-chronicler.yaml');
const workLog = join(root, 'work-log');
const filteredDir = join(workLog, 'filtered');

function authoredPR(
  org: string,
  repo: string,
  prNumber: number,
  overrides: Partial<import('@core/index').PullRequest> = {},
) {
  const frontmatter = {
    title: `feat: authored ${org}/${repo}#${prNumber}`,
    prNumber,
    repository: repo,
    org,
    author: 'me',
    state: 'merged' as const,
    createdAt: '2025-02-10T09:00:00Z',
    mergedAt: '2025-02-11T09:00:00Z',
    closedAt: '2025-02-11T09:00:00Z',
    url: `https://github.com/${org}/${repo}/pull/${prNumber}`,
    additions: 120,
    deletions: 30,
    changedFiles: 5,
    jiraTickets: [] as string[],
    labels: [] as string[],
    ...overrides,
  };
  core.writeMarkdownFile(
    core.getPRFilePath(
      workLog,
      org,
      repo,
      new Date(frontmatter.createdAt),
      prNumber,
    ),
    frontmatter,
    'Implements BILL-1.',
  );
}

function reviewRecord(
  org: string,
  repo: string,
  prNumber: number,
  reviewer = 'me',
) {
  const record: import('@core/index').PRReviewRecord = {
    type: 'pr-review',
    reviewer,
    pr: {
      url: `https://github.com/${org}/${repo}/pull/${prNumber}`,
      org,
      repository: repo,
      prNumber,
      // Text an authored-PR consumer would pick up if it read the record
      title: 'feat!: platform migration BILL-1',
      author: 'alice',
      state: 'merged',
    },
    prUpdatedAt: '2025-03-02T00:00:00Z',
    reviews: [
      {
        reviewId: 900 + prNumber,
        state: 'APPROVED',
        submittedAt: '2025-03-01T00:00:00Z',
        url: `https://github.com/${org}/${repo}/pull/${prNumber}#pullrequestreview-${900 + prNumber}`,
        body: 'Approved BILL-1 work',
      },
    ],
    comments: [],
  };
  core.writeMarkdownFile(
    core.getPRReviewFilePath(workLog, org, repo, prNumber),
    record,
    'Review work',
  );
}

async function run(command: InstanceType<typeof Command>, args: string[]) {
  await new Command('work-chronicler')
    .addCommand(command)
    .parseAsync([command.name(), ...args, '-c', configPath], { from: 'user' });
}

function parse(result: CallToolResult) {
  const [first] = result.content;
  if (first?.type !== 'text') throw new Error('expected a text result');
  return JSON.parse(first.text);
}

function withoutGeneratedAt<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (key, v) =>
    key === 'generatedAt' ? undefined : v,
  );
}

function readAnalysis(dir: string) {
  return Object.fromEntries(
    ['stats', 'projects', 'timeline'].map((name) => [
      name,
      withoutGeneratedAt(
        JSON.parse(readFileSync(core.getAnalysisFilePath(dir, name), 'utf-8')),
      ),
    ]),
  );
}

/**
 * Everything authored-PR consumers report for the current work log:
 * `analyze` output (stats, project detection, timeline), the MCP tools over
 * that output, and `filter`'s subset and its analysis.
 */
async function authoredResults() {
  await run(analyzeCommand, ['--all', '--full']);
  const ctx = { outputDir: workLog };
  const mcp = {
    searchPrs: parse(await tools.searchPrsTool.handler({}, ctx)),
    statsFile: parse(await tools.getStatsTool.handler({}, ctx)),
    statsRange: parse(
      await tools.getStatsTool.handler(
        { since: '2025-01-01', until: '2025-12-31' },
        ctx,
      ),
    ),
    timeline: parse(
      await tools.getTimelineTool.handler({ granularity: 'month' }, ctx),
    ),
    projects: parse(await tools.getProjectsTool.handler({}, ctx)),
    repos: parse(await tools.listReposTool.handler({}, ctx)),
    linked: parse(
      await tools.getLinkedWorkTool.handler({ ticketKey: 'BILL-1' }, ctx),
    ),
  };

  await run(filterCommand, ['--org', 'acme']);
  const filtered = {
    prs: (await core.readAllPRs(filteredDir)).map((pr) => pr.frontmatter),
    analysis: readAnalysis(filteredDir),
  };

  return withoutGeneratedAt({
    analysis: readAnalysis(workLog),
    mcp,
    filtered,
  });
}

describe('a work log with authored PRs and review records', () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  it('gives the same authored-PR results with and without review records', async () => {
    writeFileSync(
      configPath,
      [
        'github:',
        '  username: me',
        'output:',
        '  directory: ./work-log',
        'fetch:',
        '  since: "2025-01-01"',
        '  until: "2025-12-31"',
        '',
      ].join('\n'),
    );
    authoredPR('acme', 'api', 7, { jiraTickets: ['BILL-1'] });
    authoredPR('acme', 'web', 3, { createdAt: '2025-04-01T09:00:00Z' });
    authoredPR('other', 'api', 4, { createdAt: '2025-05-01T09:00:00Z' });
    core.writeMarkdownFile(
      core.getTicketFilePath(workLog, 'acme-jira', 'BILL', 'BILL-1'),
      {
        key: 'BILL-1',
        summary: 'Billing export',
        project: 'BILL',
        org: 'acme-jira',
        issueType: 'Story',
        status: 'Done',
        storyPoints: 3,
        url: 'https://acme.atlassian.net/browse/BILL-1',
        createdAt: '2025-02-01T10:00:00.000+0000',
        resolvedAt: null,
        linkedPRs: ['https://github.com/acme/api/pull/7'],
      },
      '',
    );

    const before = await authoredResults();
    expect(before.mcp.searchPrs.total).toBe(3);

    // Same repo as an authored PR, the same PR number in another repo, and
    // an org with no authored work
    reviewRecord('acme', 'api', 8);
    reviewRecord('acme', 'web', 7);
    reviewRecord('external', 'lib', 1);

    const after = await authoredResults();

    expect(after).toEqual(before);
    expect(
      (await core.readAllPRReviews(filteredDir))
        .map((r) => r.frontmatter.pr.url)
        .sort(),
    ).toEqual([
      'https://github.com/acme/api/pull/8',
      'https://github.com/acme/web/pull/7',
    ]);

    logs = [];
    await run(statusCommand, []);
    expect(logs).toContain('\nPull Requests: 3 files');
    expect(
      logs.some((line) =>
        line.startsWith('PR Reviews:    3 reviewed PRs (3 reviews'),
      ),
    ).toBe(true);

    // A filtered subset from before reviews were fetched is flagged
    expect(
      logs.some((line) => line.includes('Re-run `work-chronicler filter`')),
    ).toBe(false);
    rmSync(join(filteredDir, 'pr-reviews'), { recursive: true });
    logs = [];
    await run(statusCommand, []);
    expect(
      logs.some((line) => line.includes('Re-run `work-chronicler filter`')),
    ).toBe(true);

    // filter always writes pr-reviews/, even when no review record matches
    await run(filterCommand, ['--org', 'other']);
    expect(existsSync(join(filteredDir, 'pr-reviews'))).toBe(true);
  });

  it('does not count review records written for another GitHub user in status', async () => {
    // Same work log as above: three records reviewed by `me`
    reviewRecord('acme', 'api', 50, 'alice');
    reviewRecord('acme', 'api', 51, 'ME');

    logs = [];
    await run(statusCommand, []);

    expect(
      logs.some((line) =>
        line.startsWith('PR Reviews:    4 reviewed PRs (4 reviews'),
      ),
    ).toBe(true);
    expect(logs).toContainEqual(
      expect.stringContaining(
        '1 review record(s) in pr-reviews/ belong to another GitHub user (alice), not me, and are not counted',
      ),
    );
  });
});
