import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  getAnalysisFilePath,
  getPRFilePath,
  getTicketFilePath,
  type JiraTicket,
  type PullRequest,
  writeMarkdownFile,
} from '@core/index';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getLinkedWorkTool,
  getProjectsTool,
  getStatsTool,
  getTimelineTool,
  listReposTool,
  searchPrsTool,
  searchTicketsTool,
  type ToolContext,
} from './index';

const LONG_BODY = 'x'.repeat(600);

function pr(overrides: Partial<PullRequest> & { prNumber: number }) {
  const repository = overrides.repository ?? 'acme/api';
  const [org = ''] = repository.split('/');
  return {
    title: `PR ${overrides.prNumber}`,
    repository,
    org,
    author: 'me',
    state: 'merged',
    createdAt: '2025-01-15T10:00:00Z',
    mergedAt: '2025-01-16T10:00:00Z',
    closedAt: null,
    url: `https://github.com/${repository}/pull/${overrides.prNumber}`,
    additions: 10,
    deletions: 2,
    changedFiles: 1,
    jiraTickets: [],
    labels: [],
    ...overrides,
  } satisfies PullRequest;
}

function ticket(overrides: Partial<JiraTicket> & { key: string }) {
  return {
    summary: `Ticket ${overrides.key}`,
    project: overrides.key.split('-')[0] ?? 'PROJ',
    org: 'acme-jira',
    issueType: 'Story',
    status: 'Done',
    storyPoints: 3,
    url: `https://acme.atlassian.net/browse/${overrides.key}`,
    createdAt: '2025-01-10T10:00:00.000+0000',
    resolvedAt: null,
    linkedPRs: [],
    ...overrides,
  } satisfies JiraTicket;
}

const PRS: { frontmatter: PullRequest; body: string }[] = [
  {
    frontmatter: pr({
      prNumber: 1,
      title: 'Add billing export',
      createdAt: '2025-01-05T09:00:00Z',
      jiraTickets: ['BILL-1'],
      impact: 'major',
      additions: 100,
      deletions: 20,
    }),
    body: LONG_BODY,
  },
  {
    frontmatter: pr({
      prNumber: 2,
      title: 'Fix login redirect',
      createdAt: '2025-02-10T09:00:00Z',
      state: 'open',
      mergedAt: null,
    }),
    body: 'Redirects after OAuth callback.',
  },
  {
    frontmatter: pr({
      prNumber: 3,
      repository: 'acme/web-app',
      title: 'Billing page polish',
      createdAt: '2025-03-20T09:00:00Z',
      jiraTickets: ['BILL-1', 'WEB-7'],
      impact: 'minor',
    }),
    body: 'Small layout fixes.',
  },
  {
    frontmatter: pr({
      prNumber: 4,
      repository: 'other/api',
      title: 'Unrelated org work',
      createdAt: '2025-04-01T09:00:00Z',
    }),
    body: 'Other org.',
  },
];

const TICKETS: { frontmatter: JiraTicket; body: string }[] = [
  {
    frontmatter: ticket({
      key: 'BILL-1',
      summary: 'Billing export',
      createdAt: '2025-01-02T10:00:00.000+0000',
    }),
    body: 'Export invoices as CSV.',
  },
  {
    frontmatter: ticket({
      key: 'WEB-7',
      summary: 'Polish pages',
      status: 'In Progress',
      storyPoints: null,
      createdAt: '2025-03-01T10:00:00.000+0000',
    }),
    body: 'Visual cleanup.',
  },
];

let root: string;
let ctx: ToolContext;

function writeWorkLog(outputDir: string) {
  for (const { frontmatter, body } of PRS) {
    const [org = '', repo = ''] = frontmatter.repository.split('/');
    writeMarkdownFile(
      getPRFilePath(
        outputDir,
        org,
        repo,
        new Date(frontmatter.createdAt),
        frontmatter.prNumber,
      ),
      frontmatter,
      body,
    );
  }
  for (const { frontmatter, body } of TICKETS) {
    writeMarkdownFile(
      getTicketFilePath(
        outputDir,
        frontmatter.org,
        frontmatter.project,
        frontmatter.key,
      ),
      frontmatter,
      body,
    );
  }
}

function writeAnalysis(name: string, content: unknown) {
  const filePath = getAnalysisFilePath(ctx.outputDir, name);
  mkdirSync(join(filePath, '..'), { recursive: true });
  writeFileSync(
    filePath,
    typeof content === 'string' ? content : JSON.stringify(content),
  );
}

function parse(result: CallToolResult) {
  const [first] = result.content;
  if (first?.type !== 'text') throw new Error('expected a text result');
  return JSON.parse(first.text);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wc-mcp-tools-'));
  vi.stubEnv('HOME', join(root, 'home'));
  vi.stubEnv('WORK_CHRONICLER_HOME', join(root, 'wc-home'));
  ctx = { outputDir: join(root, 'work-log') };
  writeWorkLog(ctx.outputDir);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe('search_prs', () => {
  it('filters by inclusive date range and returns newest first', async () => {
    const out = parse(
      await searchPrsTool.handler(
        { since: '2025-01-05T09:00:00Z', until: '2025-03-20T09:00:00Z' },
        ctx,
      ),
    );

    expect(out.results.map((r: { url: string }) => r.url)).toEqual([
      'https://github.com/acme/web-app/pull/3',
      'https://github.com/acme/api/pull/2',
      'https://github.com/acme/api/pull/1',
    ]);
    expect(out.total).toBe(3);
  });

  it('matches repo as a substring and org exactly', async () => {
    const byRepo = parse(await searchPrsTool.handler({ repo: 'api' }, ctx));
    expect(byRepo.total).toBe(3);

    const byOrg = parse(
      await searchPrsTool.handler({ repo: 'api', org: 'acme' }, ctx),
    );
    expect(byOrg.results.map((r: { url: string }) => r.url)).toEqual([
      'https://github.com/acme/api/pull/2',
      'https://github.com/acme/api/pull/1',
    ]);
  });

  it('applies limit after counting matches and truncates long bodies', async () => {
    const out = parse(
      await searchPrsTool.handler({ query: 'billing', limit: 1 }, ctx),
    );

    expect(out).toMatchObject({ total: 2, returned: 1 });
    expect(out.results[0].title).toBe('Billing page polish');

    const long = parse(
      await searchPrsTool.handler({ impact: 'major', state: 'merged' }, ctx),
    );
    expect(long.results).toHaveLength(1);
    expect(long.results[0].body).toBe(`${'x'.repeat(500)}...`);
    expect(long.results[0].jiraTickets).toEqual(['BILL-1']);
  });

  it('rejects an unparseable date', async () => {
    await expect(
      searchPrsTool.handler({ since: 'last tuesday' }, ctx),
    ).rejects.toThrow('Invalid since date format: "last tuesday"');
  });
});

describe('search_tickets', () => {
  it('matches status case-insensitively as a substring', async () => {
    const out = parse(
      await searchTicketsTool.handler({ status: 'progress' }, ctx),
    );

    expect(out.results.map((t: { key: string }) => t.key)).toEqual(['WEB-7']);
  });

  it('matches the query against the ticket key', async () => {
    const out = parse(
      await searchTicketsTool.handler({ query: 'bill-1' }, ctx),
    );

    expect(out.results).toHaveLength(1);
    expect(out.results[0]).toMatchObject({
      key: 'BILL-1',
      project: 'BILL',
      storyPoints: 3,
      body: 'Export invoices as CSV.',
    });
  });
});

describe('get_linked_work', () => {
  it('returns a PR with the tickets it references', async () => {
    const out = parse(
      await getLinkedWorkTool.handler(
        { prUrl: 'https://github.com/acme/web-app/pull/3' },
        ctx,
      ),
    );

    expect(out.pr).toMatchObject({ prNumber: 3, body: 'Small layout fixes.' });
    expect(out.linkedTickets.map((t: { key: string }) => t.key)).toEqual([
      'BILL-1',
      'WEB-7',
    ]);
  });

  it('returns a ticket with every PR that references it', async () => {
    const out = parse(
      await getLinkedWorkTool.handler({ ticketKey: 'bill-1' }, ctx),
    );

    expect(out.ticket.key).toBe('BILL-1');
    expect(
      out.linkedPRs.map((p: { prNumber: number }) => p.prNumber).sort(),
    ).toEqual([1, 3]);
  });

  it('reports missing input and unknown records', async () => {
    expect(parse(await getLinkedWorkTool.handler({}, ctx))).toEqual({
      error: 'Either prUrl or ticketKey must be provided',
    });
    expect(
      parse(await getLinkedWorkTool.handler({ ticketKey: 'NOPE-1' }, ctx)),
    ).toEqual({ error: 'Ticket not found' });
    expect(
      parse(
        await getLinkedWorkTool.handler(
          { prUrl: 'https://github.com/acme/api/pull/999' },
          ctx,
        ),
      ),
    ).toEqual({ error: 'PR not found' });
  });
});

describe('list_repos', () => {
  it('aggregates per repository, defaulting impact to standard', async () => {
    const out = parse(await listReposTool.handler({}, ctx));

    expect(out.totalRepos).toBe(3);
    expect(out.repos[0]).toEqual({
      org: 'acme',
      repo: 'api',
      prCount: 2,
      additions: 110,
      deletions: 22,
      earliestPR: '2025-01-05T09:00:00Z',
      latestPR: '2025-02-10T09:00:00Z',
      impactBreakdown: { major: 1, standard: 1 },
    });
  });
});

describe('get_stats', () => {
  it('returns generated stats.json verbatim when no dates are given', async () => {
    const generated = '{\n  "prs": { "total": 42 }\n}';
    writeAnalysis('stats', generated);

    const result = await getStatsTool.handler({}, ctx);

    expect(result.content).toEqual([{ type: 'text', text: generated }]);
  });

  it('computes stats from the work log for a date range, ignoring stats.json', async () => {
    writeAnalysis('stats', { prs: { total: 42 } });

    const out = parse(
      await getStatsTool.handler(
        { since: '2025-03-01', until: '2025-12-31' },
        ctx,
      ),
    );

    expect(out.prs).toEqual({
      total: 2,
      byOrg: { acme: 1, other: 1 },
      byRepo: { 'acme/web-app': 1, 'other/api': 1 },
      byState: { merged: 2 },
      byImpact: { minor: 1, standard: 1 },
      linkedToTickets: 1,
      totalAdditions: 20,
      totalDeletions: 4,
    });
    expect(out.tickets).toMatchObject({ total: 1, totalStoryPoints: 0 });
    expect(out.dateRange).toEqual({
      earliest: '2025-03-01T10:00:00.000+0000',
      latest: '2025-04-01T09:00:00Z',
    });
  });

  it('computes stats when stats.json is missing', async () => {
    const out = parse(await getStatsTool.handler({}, ctx));

    expect(out.prs.total).toBe(4);
    expect(out.tickets).toMatchObject({ total: 2, totalStoryPoints: 3 });
  });
});

describe('get_projects', () => {
  const projectsFile = {
    projects: [
      { projectId: 'a', name: 'Billing', confidence: 'high' },
      { projectId: 'b', name: 'Login', confidence: 'low' },
      { projectId: 'c', name: 'Web', confidence: 'high' },
    ],
    summary: { totalProjects: 3 },
  };

  it('filters generated projects by confidence and limit', async () => {
    writeAnalysis('projects', projectsFile);

    const out = parse(
      await getProjectsTool.handler({ confidence: 'high', limit: 1 }, ctx),
    );

    expect(out).toEqual({
      projects: [{ projectId: 'a', name: 'Billing', confidence: 'high' }],
      total: 3,
      returned: 1,
      summary: { totalProjects: 3 },
    });
  });

  it('explains how to generate a missing projects file', async () => {
    expect(parse(await getProjectsTool.handler({}, ctx))).toEqual({
      error:
        'projects.json not found. Run `work-chronicler analyze --projects` first.',
    });
  });
});

describe('get_timeline', () => {
  const timelineFile = {
    months: [
      {
        month: '2025-01',
        weeks: [{ weekStart: '2025-01-06' }, { weekStart: '2025-01-13' }],
      },
      { month: '2025-02', weeks: [{ weekStart: '2025-02-03' }] },
    ],
    summary: { totalWeeks: 3, totalMonths: 2 },
  };

  it('flattens weeks by default and filters by period start', async () => {
    writeAnalysis('timeline', timelineFile);

    const out = parse(
      await getTimelineTool.handler(
        { since: '2025-01-13', until: '2025-02-03' },
        ctx,
      ),
    );

    expect(out).toEqual({
      granularity: 'week',
      periods: [{ weekStart: '2025-01-13' }, { weekStart: '2025-02-03' }],
      total: 3,
      returned: 2,
      summary: { totalWeeks: 3, totalMonths: 2 },
    });
  });

  it('compares months by their first day', async () => {
    writeAnalysis('timeline', timelineFile);

    const out = parse(
      await getTimelineTool.handler(
        { granularity: 'month', since: '2025-01-01', until: '2025-01-31' },
        ctx,
      ),
    );

    expect(out.periods.map((p: { month: string }) => p.month)).toEqual([
      '2025-01',
    ]);
    expect(out.total).toBe(2);
  });

  it('explains how to generate a missing timeline file', async () => {
    expect(parse(await getTimelineTool.handler({}, ctx))).toEqual({
      error:
        'timeline.json not found. Run `work-chronicler analyze --timeline` first.',
    });
  });
});
