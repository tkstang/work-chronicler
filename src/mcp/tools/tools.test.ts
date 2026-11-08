import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  getAnalysisFilePath,
  getPRFilePath,
  getPRReviewFilePath,
  getTicketFilePath,
  type JiraTicket,
  type PRReviewRecord,
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
  searchPrReviewsTool,
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

function writePRs(
  outputDir: string,
  prs: Array<PullRequest | { frontmatter: PullRequest; body: string }>,
) {
  for (const entry of prs) {
    const { frontmatter, body } =
      'frontmatter' in entry ? entry : { frontmatter: entry, body: '' };
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
}

function writeWorkLog(outputDir: string) {
  writePRs(outputDir, PRS);
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

  describe('PR lookup with PRs 23 and 123', () => {
    beforeEach(() => {
      // acme/api sorts before acme/web-app, so PR 123 is read first: a
      // suffix match on "23" would find it before PR 23.
      writePRs(ctx.outputDir, [
        pr({ prNumber: 123, repository: 'acme/api' }),
        pr({ prNumber: 23, repository: 'acme/web-app' }),
      ]);
    });

    const lookUp = async (prUrl: string) =>
      parse(await getLinkedWorkTool.handler({ prUrl }, ctx));

    it('matches the exact URL', async () => {
      const out = await lookUp('https://github.com/acme/web-app/pull/23');
      expect(out.pr.url).toBe('https://github.com/acme/web-app/pull/23');
    });

    it('matches bare digits against the whole PR number', async () => {
      const out = await lookUp('23');
      expect(out.pr.url).toBe('https://github.com/acme/web-app/pull/23');
    });

    it('does not suffix-match a URL that is not in the work log', async () => {
      expect(await lookUp('https://github.com/acme/other/pull/23')).toEqual({
        error: 'PR not found',
      });
    });

    it('asks for the full URL when bare digits match several PRs', async () => {
      writePRs(ctx.outputDir, [pr({ prNumber: 23, repository: 'acme/api' })]);
      const out = await lookUp('23');
      expect(out.error).toBe(
        'PR number 23 matches several PRs; pass the full URL',
      );
      expect(out.matches.sort()).toEqual([
        'https://github.com/acme/api/pull/23',
        'https://github.com/acme/web-app/pull/23',
      ]);
    });
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

describe('search_pr_reviews', () => {
  function reviewRecord(
    repo: string,
    prNumber: number,
    overrides: Partial<PRReviewRecord> = {},
  ): PRReviewRecord {
    return {
      type: 'pr-review',
      reviewer: 'me',
      pr: {
        url: `https://github.com/acme/${repo}/pull/${prNumber}`,
        org: 'acme',
        repository: repo,
        prNumber,
        title: `Someone else's PR ${prNumber}`,
        author: 'alice',
        state: 'open',
      },
      prUpdatedAt: '2025-06-01T00:00:00Z',
      reviews: [],
      comments: [],
      ...overrides,
    };
  }

  beforeEach(() => {
    const records = [
      reviewRecord('api', 1, {
        reviews: [
          {
            reviewId: 10,
            state: 'CHANGES_REQUESTED',
            submittedAt: '2025-02-01T00:00:00Z',
            url: 'https://github.com/acme/api/pull/1#pullrequestreview-10',
            body: 'Please add a migration test',
          },
          {
            reviewId: 11,
            state: 'APPROVED',
            submittedAt: '2025-05-01T00:00:00Z',
            url: 'https://github.com/acme/api/pull/1#pullrequestreview-11',
            body: '',
          },
        ],
        comments: [
          {
            commentId: 30,
            reviewId: 10,
            inReplyToId: null,
            path: 'db/migrate.sql',
            line: 1,
            createdAt: '2025-02-01T00:00:00Z',
            updatedAt: '2025-02-01T00:00:00Z',
            url: 'https://github.com/acme/api/pull/1#discussion_r30',
            body: 'Needs a down migration',
          },
        ],
      }),
      reviewRecord('web-app', 1, {
        comments: [
          {
            commentId: 20,
            reviewId: 12,
            inReplyToId: null,
            path: 'src/app.ts',
            line: 3,
            createdAt: '2025-03-01T00:00:00Z',
            updatedAt: '2025-03-01T00:00:00Z',
            url: 'https://github.com/acme/web-app/pull/1#discussion_r20',
            body: 'This leaks a listener',
          },
        ],
      }),
    ];
    for (const record of records) {
      writeMarkdownFile(
        getPRReviewFilePath(
          ctx.outputDir,
          record.pr.org,
          record.pr.repository,
          record.pr.prNumber,
        ),
        record,
        '',
      );
    }
  });

  it('returns PRs with the same number in different repos as separate entries, newest activity first', async () => {
    const out = parse(await searchPrReviewsTool.handler({}, ctx));

    expect(out.results.map((r: { prUrl: string }) => r.prUrl)).toEqual([
      'https://github.com/acme/api/pull/1',
      'https://github.com/acme/web-app/pull/1',
    ]);
    expect(out.totals).toEqual({ reviews: 2, comments: 2 });
  });

  it('keeps only reviews and comments inside the date range', async () => {
    const out = parse(
      await searchPrReviewsTool.handler(
        { since: '2025-01-15', until: '2025-03-15' },
        ctx,
      ),
    );

    expect(
      out.results.map(
        (r: { prUrl: string; reviews: { reviewId: number }[] }) => [
          r.prUrl,
          r.reviews.map((review) => review.reviewId),
        ],
      ),
    ).toEqual([
      ['https://github.com/acme/web-app/pull/1', []],
      ['https://github.com/acme/api/pull/1', [10]],
    ]);
  });

  it('filters by review state, keeping the inline comments of matching reviews', async () => {
    const changes = parse(
      await searchPrReviewsTool.handler({ state: 'CHANGES_REQUESTED' }, ctx),
    );
    expect(changes.total).toBe(1);
    expect(
      changes.results[0].reviews.map((r: { reviewId: number }) => r.reviewId),
    ).toEqual([10]);
    expect(
      changes.results[0].comments.map(
        (c: { commentId: number }) => c.commentId,
      ),
    ).toEqual([30]);

    const approved = parse(
      await searchPrReviewsTool.handler({ state: 'APPROVED' }, ctx),
    );
    expect(approved.total).toBe(1);
    expect(approved.results[0].reviews).toHaveLength(1);
    expect(approved.results[0].comments).toEqual([]);

    const byText = parse(
      await searchPrReviewsTool.handler({ query: 'listener' }, ctx),
    );
    expect(byText.results.map((r: { prUrl: string }) => r.prUrl)).toEqual([
      'https://github.com/acme/web-app/pull/1',
    ]);
  });

  describe('a record written for another GitHub user', () => {
    beforeEach(() => {
      const record = reviewRecord('lib', 9, {
        reviewer: 'alice',
        reviews: [
          {
            reviewId: 90,
            state: 'APPROVED',
            submittedAt: '2025-06-01T00:00:00Z',
            url: 'https://github.com/acme/lib/pull/9#pullrequestreview-90',
            body: "Alice's review",
          },
        ],
      });
      writeMarkdownFile(
        getPRReviewFilePath(ctx.outputDir, 'acme', 'lib', 9),
        record,
        '',
      );
    });

    it('is left out, with a note, when the configured user is known', async () => {
      const out = parse(
        await searchPrReviewsTool.handler({}, { ...ctx, githubUsername: 'ME' }),
      );

      expect(
        out.results.map((r: { reviewer: string; prUrl: string }) => [
          r.reviewer,
          r.prUrl,
        ]),
      ).toEqual([
        ['me', 'https://github.com/acme/api/pull/1'],
        ['me', 'https://github.com/acme/web-app/pull/1'],
      ]);
      expect(out.total).toBe(2);
      expect(out.note).toContain(
        'Left out 1 review record(s) written for another GitHub user (alice), not ME',
      );
    });

    it('is attributed to its reviewer when the configured user is unknown', async () => {
      const out = parse(await searchPrReviewsTool.handler({}, ctx));

      expect(out.results[0]).toMatchObject({
        reviewer: 'alice',
        prUrl: 'https://github.com/acme/lib/pull/9',
      });
      expect(out.total).toBe(3);
    });
  });
});
