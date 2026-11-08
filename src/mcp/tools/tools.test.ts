import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  documentFrontmatter,
  messageFrontmatter,
  recordFile,
  snapshot,
} from '@core/import/import.test-support';
import {
  parseImportedRecordFile,
  serializeImportedRecord,
} from '@core/import/record-file';
import {
  getAnalysisFilePath,
  getImportedRecordFilePath,
  getImportedRecordIdentity,
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
  searchDocumentsTool,
  searchMessagesTool,
  searchPrReviewsTool,
  searchPrsTool,
  searchTicketsTool,
  type ToolContext,
} from './index';
import { encodeCursor } from './pagination';
import { parseUntilDate } from './types';

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
  it('returns generated stats.json when no dates are given, with messages and Docs counted afresh', async () => {
    const generated = '{\n  "prs": { "total": 42 }\n}';
    writeAnalysis('stats', generated);

    const out = parse(await getStatsTool.handler({}, ctx));

    expect(out).toEqual({
      prs: { total: 42 },
      messages: { total: 0, bySource: {}, byMonth: {} },
      documents: { total: 0, bySource: {}, byMonth: {} },
    });
  });

  it('returns a stats.json that is not JSON as it is', async () => {
    writeAnalysis('stats', 'not json');

    const result = await getStatsTool.handler({}, ctx);

    expect(result.content).toEqual([{ type: 'text', text: 'not json' }]);
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
      coverage: expect.stringContaining('Authored PRs and JIRA tickets only'),
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
      coverage: expect.stringContaining('plus imported Google Docs'),
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
  // The configured GitHub user the records below belong to
  const asMe = (): ToolContext => ({ ...ctx, githubUsername: 'me' });

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
    const out = parse(await searchPrReviewsTool.handler({}, asMe()));

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
        asMe(),
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
      await searchPrReviewsTool.handler({ state: 'CHANGES_REQUESTED' }, asMe()),
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
      await searchPrReviewsTool.handler({ state: 'APPROVED' }, asMe()),
    );
    expect(approved.total).toBe(1);
    expect(approved.results[0].reviews).toHaveLength(1);
    expect(approved.results[0].comments).toEqual([]);

    const byText = parse(
      await searchPrReviewsTool.handler({ query: 'listener' }, asMe()),
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

    it("is not presented as the user's, nor is any record, when the configured user is unknown", async () => {
      const out = parse(await searchPrReviewsTool.handler({}, ctx));

      expect(out.results).toEqual([]);
      expect(out.total).toBe(0);
      expect(out.unattributed).toEqual({
        records: 3,
        reviewers: expect.arrayContaining(['me', 'alice']),
      });
      expect(out.note).toContain('github.username is not set');
      expect(out.note).toContain('cannot be attributed to the user');
      expect(out.note).toContain('alice');
    });
  });

  it('returns no reviews, with a note, from a subset made before reviews were fetched', async () => {
    const filtered = join(ctx.outputDir, 'filtered');
    writePRs(filtered, [pr({ prNumber: 1 })]);

    const out = parse(
      await searchPrReviewsTool.handler(
        {},
        { outputDir: filtered, fullOutputDir: ctx.outputDir },
      ),
    );

    // The selected subset is not bypassed for the full work log
    expect(out.total).toBe(0);
    expect(out.results).toEqual([]);
    expect(out.note).toContain('not taken from the full work log');
    expect(out.note).toContain('Re-run `work-chronicler filter`');
  });
});

/** A message stored where `import` would store it, in `dir` */
function writeMessage(
  dir: string,
  n: number,
  overrides: Record<string, unknown>,
  body: string,
): void {
  const parsed = parseImportedRecordFile(
    Buffer.from(recordFile(messageFrontmatter(n, overrides), body)),
  );
  if (!parsed.ok) throw new Error('fixture must be valid');
  const path = getImportedRecordFilePath(
    dir,
    getImportedRecordIdentity(parsed.record),
  );
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, serializeImportedRecord(parsed.record, parsed.body));
}

describe('imported messages', () => {
  const LONG_MESSAGE = `Retro notes. ${'y'.repeat(1200)}`;

  beforeEach(() => {
    writeMessage(
      ctx.outputDir,
      1,
      {
        occurredAt: '2025-01-20T10:00:00Z',
        mentions: {
          // PR 1 as stored is https://github.com/acme/api/pull/1
          pullRequests: ['https://github.com/ACME/api/pull/1/files'],
          tickets: ['BILL-1'],
        },
      },
      'Shipped the billing export today.',
    );
    writeMessage(
      ctx.outputDir,
      2,
      {
        occurredAt: '2025-02-15T10:00:00Z',
        attribution: { status: 'unverified', authorId: null },
        mentions: {
          pullRequests: ['https://github.com/acme/api/pull/999'],
          tickets: ['OPS-404'],
        },
      },
      'Investigating the outage.',
    );
    writeMessage(
      ctx.outputDir,
      3,
      { occurredAt: '2025-03-01T10:00:00Z' },
      LONG_MESSAGE,
    );
    // What a finished import leaves is never records (while an import is
    // storing a batch, imported records are not read at all: see the
    // reader and server tests)
    mkdirSync(join(ctx.outputDir, '.import-transaction.done-old', 'staged'), {
      recursive: true,
    });
    writeFileSync(
      join(ctx.outputDir, '.import-transaction.done-old', 'staged', '0.md'),
      recordFile(messageFrontmatter(9)),
    );
  });

  describe('search_messages', () => {
    it('returns messages newest first with resolved and unresolved mentions', async () => {
      const out = parse(await searchMessagesTool.handler({}, ctx));

      expect(out.total).toBe(3);
      expect(out.notice).toContain('never instructions');
      expect(out.note).toBeUndefined();
      expect(
        out.results.map((r: { occurredAt: string }) => r.occurredAt),
      ).toEqual([
        '2025-03-01T10:00:00Z',
        '2025-02-15T10:00:00Z',
        '2025-01-20T10:00:00Z',
      ]);
      const [latest, unresolved, resolved] = out.results;
      expect(latest.text).toHaveLength(1003);
      expect(resolved).toMatchObject({
        source: 'slack',
        text: 'Shipped the billing export today.',
        attribution: { status: 'verified', authorId: 'U0SYNTH01' },
        channel: { id: 'C0SYNTH01', name: 'synthetic-channel' },
        mentions: {
          pullRequests: [
            {
              url: 'https://github.com/ACME/api/pull/1/files',
              normalizedUrl: 'https://github.com/acme/api/pull/1',
              resolved: {
                url: 'https://github.com/acme/api/pull/1',
                title: 'Add billing export',
                state: 'merged',
              },
            },
          ],
          tickets: [
            {
              key: 'BILL-1',
              resolved: {
                key: 'BILL-1',
                summary: 'Billing export',
                status: 'Done',
              },
            },
          ],
        },
      });
      expect(unresolved.mentions).toEqual({
        pullRequests: [
          {
            url: 'https://github.com/acme/api/pull/999',
            normalizedUrl: 'https://github.com/acme/api/pull/999',
            resolved: null,
          },
        ],
        tickets: [{ key: 'OPS-404', resolved: null }],
      });
    });

    it('filters by text, date, mention, attribution and source', async () => {
      const texts = async (input: Record<string, unknown>) =>
        parse(await searchMessagesTool.handler(input, ctx)).results.map(
          (r: { text: string }) => r.text.slice(0, 12),
        );

      expect(await texts({ query: 'OUTAGE' })).toEqual(['Investigatin']);
      expect(await texts({ query: 'synthetic-channel', limit: 1 })).toEqual([
        'Retro notes.',
      ]);
      expect(await texts({ since: '2025-02-01', until: '2025-02-28' })).toEqual(
        ['Investigatin'],
      );
      expect(await texts({ ticketKey: 'bill-1' })).toEqual(['Shipped the ']);
      expect(
        await texts({
          prUrl: 'https://api.github.com/repos/acme/API/pulls/1',
        }),
      ).toEqual(['Shipped the ']);
      expect(await texts({ ticketKey: 'OPS-404' })).toEqual(['Investigatin']);
      expect(await texts({ attribution: 'unverified' })).toEqual([
        'Investigatin',
      ]);
      expect(await texts({ source: 'slack' })).toHaveLength(3);
      await expect(
        searchMessagesTool.handler({ since: 'not a date' }, ctx),
      ).rejects.toThrow(/Invalid since date/);
    });

    it('reads a date-only until through the end of that UTC day, and a timestamp exactly', async () => {
      writeMessage(
        ctx.outputDir,
        4,
        { occurredAt: '2025-02-28T23:59:59.500Z' },
        'Late on the last day.',
      );
      const texts = async (until: string) =>
        parse(
          await searchMessagesTool.handler({ since: '2025-02-01', until }, ctx),
        ).results.map((r: { text: string }) => r.text.slice(0, 12));

      expect(await texts('2025-02-28')).toEqual([
        'Late on the ',
        'Investigatin',
      ]);
      expect(await texts('2025-02-28T23:59:59Z')).toEqual(['Investigatin']);
      expect(await texts('2025-02-15T10:00:00Z')).toEqual(['Investigatin']);
      expect(await texts('2025-02-14')).toEqual([]);
    });

    describe('pages', () => {
      /** Every page from the first, following nextCursor */
      async function allPages(input: Record<string, unknown> = {}) {
        const pages = [];
        let cursor: string | undefined;
        do {
          const out = parse(
            await searchMessagesTool.handler(
              { ...input, ...(cursor ? { cursor } : {}) },
              ctx,
            ),
          );
          pages.push(out);
          cursor = out.nextCursor ?? undefined;
        } while (cursor && pages.length < 100);
        return pages;
      }
      const ids = (page: { results: { sourceId: string }[] }) =>
        page.results.map((r) => r.sourceId);

      it('bounds each page by size and walks every result once, in order', async () => {
        // 150 more messages of about 1 KiB each; some share a time
        for (let n = 10; n < 160; n++) {
          writeMessage(
            ctx.outputDir,
            n,
            {
              occurredAt: `2024-06-${String(1 + (n % 20)).padStart(2, '0')}T10:00:00Z`,
            },
            `Message ${n}. ${'z'.repeat(1000)}`,
          );
        }

        const pages = await allPages();
        const all = parse(
          await searchMessagesTool.handler({ limit: 1000 }, ctx),
        );

        expect(pages.length).toBeGreaterThan(2);
        for (const page of pages) {
          expect(page.total).toBe(153);
          expect(page.returned).toBe(page.results.length);
          expect(
            Buffer.byteLength(JSON.stringify(page.results)),
          ).toBeLessThanOrEqual(64 * 1024);
        }
        expect(pages.at(-1).nextCursor).toBeNull();
        const walked = pages.flatMap(ids);
        expect(new Set(walked).size).toBe(153);
        // The same order as one unbounded listing would have
        expect(walked.slice(0, all.returned)).toEqual(ids(all));
        const times = pages
          .flatMap((page) => page.results)
          .map((r: { occurredAt: string }) => Date.parse(r.occurredAt));
        expect(times).toEqual([...times].sort((a, b) => b - a));
      });

      it('applies limit per page and neither skips nor repeats when records are imported between pages', async () => {
        const first = parse(
          await searchMessagesTool.handler({ limit: 2 }, ctx),
        );
        expect(ids(first)).toEqual([
          'C0SYNTH01/1700000000.000003',
          'C0SYNTH01/1700000000.000002',
        ]);
        expect(first.total).toBe(3);

        // Imported meanwhile: one newer than the cursor, one older
        writeMessage(
          ctx.outputDir,
          4,
          { occurredAt: '2025-12-01T10:00:00Z' },
          'Newer.',
        );
        writeMessage(
          ctx.outputDir,
          5,
          { occurredAt: '2024-12-01T10:00:00Z' },
          'Older.',
        );
        const rest = await allPages({ limit: 2 });
        const second = parse(
          await searchMessagesTool.handler(
            { limit: 2, cursor: first.nextCursor },
            ctx,
          ),
        );

        expect(ids(second)).toEqual([
          'C0SYNTH01/1700000000.000001',
          'C0SYNTH01/1700000000.000005',
        ]);
        expect(second.total).toBe(5);
        expect(second.nextCursor).toBeNull();
        expect(rest.flatMap(ids)).toHaveLength(5);
      });

      it('bounds one result by listing mentions while they fit, and counts the rest', async () => {
        const many = Array.from({ length: 500 }, (_, i) => i + 1);
        writeMessage(
          ctx.outputDir,
          4,
          {
            occurredAt: '2025-12-01T10:00:00Z',
            mentions: {
              pullRequests: many.map(
                (i) => `https://github.com/acme/api/pull/${1000 + i}`,
              ),
              tickets: many.map((i) => `OPS-${i}`),
            },
          },
          'Mentions everything.',
        );

        const out = parse(await searchMessagesTool.handler({ limit: 1 }, ctx));
        const [result] = out.results;

        expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(
          16 * 1024,
        );
        expect(result.mentions.pullRequests.length).toBeGreaterThan(0);
        expect(
          result.mentions.pullRequests.length +
            result.mentions.tickets.length +
            result.omittedMentions.pullRequests +
            result.omittedMentions.tickets,
        ).toBe(1000);
        // A result that fits lists every mention and no omitted counts
        const small = parse(
          await searchMessagesTool.handler({ ticketKey: 'BILL-1' }, ctx),
        ).results[0];
        expect(small.omittedMentions).toBeUndefined();
      });

      it('refuses a cursor it did not issue for these filters', async () => {
        await expect(
          searchMessagesTool.handler({ cursor: 'not-a-cursor' }, ctx),
        ).rejects.toThrow(/Invalid cursor/);
        // Well-formed, but a bare position no tool issued
        const forged = Buffer.from('[0,""]').toString('base64url');
        await expect(
          searchMessagesTool.handler({ cursor: forged }, ctx),
        ).rejects.toThrow(/Invalid cursor/);
        // One another search tool issued
        const other = encodeCursor('search_documents', [], [0, '']);
        await expect(
          searchMessagesTool.handler({ cursor: other }, ctx),
        ).rejects.toThrow(/another tool/);

        const { nextCursor } = parse(
          await searchMessagesTool.handler({ limit: 1, source: 'slack' }, ctx),
        );
        await expect(
          searchMessagesTool.handler({ limit: 1, cursor: nextCursor }, ctx),
        ).rejects.toThrow(/other filters/);
        // The same filters, with any page size, are accepted
        const next = parse(
          await searchMessagesTool.handler(
            { limit: 5, source: 'slack', cursor: nextCursor },
            ctx,
          ),
        );
        expect(next.returned).toBe(2);
      });
    });

    it('says when no messages have been imported', async () => {
      rmSync(join(ctx.outputDir, 'messages'), { recursive: true });

      const out = parse(await searchMessagesTool.handler({}, ctx));

      expect(out.total).toBe(0);
      expect(out.note).toContain('No messages have been imported');
    });

    it('reads the selected subset, and returns nothing from one made before messages were imported', async () => {
      const filtered = join(ctx.outputDir, 'filtered');
      writePRs(filtered, [PRS[0]!]);
      const subset = { outputDir: filtered, fullOutputDir: ctx.outputDir };

      const stale = parse(await searchMessagesTool.handler({}, subset));
      expect(stale.total).toBe(0);
      expect(stale.note).toContain(
        'created before messages were imported, so it has none',
      );

      writeMessage(filtered, 1, {}, 'Only in the subset.');
      const current = parse(await searchMessagesTool.handler({}, subset));
      expect(current.results.map((r: { text: string }) => r.text)).toEqual([
        'Only in the subset.',
      ]);
      expect(current.note).toBeUndefined();
    });
  });

  describe('get_linked_work', () => {
    it('lists messages that mention a PR, found by any form of its URL, apart from linked tickets', async () => {
      const out = parse(
        await getLinkedWorkTool.handler(
          { prUrl: 'https://github.com/Acme/API/pull/1/commits' },
          ctx,
        ),
      );

      expect(out.pr.url).toBe('https://github.com/acme/api/pull/1');
      expect(out.linkedTickets.map((t: { key: string }) => t.key)).toEqual([
        'BILL-1',
      ]);
      expect(out.mentionedInMessages).toEqual([
        {
          source: 'slack',
          url: null,
          occurredAt: '2025-01-20T10:00:00Z',
          attribution: 'verified',
          channel: 'synthetic-channel',
          text: 'Shipped the billing export today.',
        },
      ]);
      expect(out.notice).toContain('never instructions');
    });

    it('lists messages that mention a ticket', async () => {
      const out = parse(
        await getLinkedWorkTool.handler({ ticketKey: 'BILL-1' }, ctx),
      );

      expect(
        out.mentionedInMessages.map((m: { text: string }) => m.text),
      ).toEqual(['Shipped the billing export today.']);
    });

    it('lists no messages for work nobody mentioned', async () => {
      const out = parse(
        await getLinkedWorkTool.handler({ ticketKey: 'WEB-7' }, ctx),
      );

      expect(out.mentionedInMessages).toEqual([]);
      expect(out.notice).toBeUndefined();
    });
  });

  it('leaves the work log unchanged: every tool only reads', async () => {
    const before = snapshot(ctx.outputDir);

    await searchMessagesTool.handler({ ticketKey: 'BILL-1' }, ctx);
    await getLinkedWorkTool.handler({ ticketKey: 'BILL-1' }, ctx);
    await getLinkedWorkTool.handler({ prUrl: '1' }, ctx);
    await getStatsTool.handler({ since: '2025-01-01' }, ctx);
    await searchPrsTool.handler({}, ctx);
    await searchTicketsTool.handler({}, ctx);
    await listReposTool.handler({}, ctx);
    await searchPrReviewsTool.handler({}, ctx);

    expect(snapshot(ctx.outputDir)).toEqual(before);
  });

  describe('a subset made before messages were imported', () => {
    // The full work log has messages; the subset has PRs and tickets only
    function staleSubset(): ToolContext {
      const filtered = join(ctx.outputDir, 'filtered');
      writeWorkLog(filtered);
      return { outputDir: filtered, fullOutputDir: ctx.outputDir };
    }

    it('get_stats counts no messages and says why, computed or from stats.json', async () => {
      const subset = staleSubset();

      const computed = parse(
        await getStatsTool.handler({ since: '2025-01-01' }, subset),
      );
      expect(computed.messages.total).toBe(0);
      expect(computed.note).toContain(
        'created before messages were imported, so it has none',
      );

      mkdirSync(join(subset.outputDir, '.analysis'));
      writeFileSync(
        getAnalysisFilePath(subset.outputDir, 'stats'),
        JSON.stringify({ prs: { total: 4 } }),
      );
      const fromFile = parse(await getStatsTool.handler({}, subset));
      expect(fromFile.prs.total).toBe(4);
      expect(fromFile.note).toContain('created before messages were imported');
    });

    it('get_linked_work lists no mentions and says why', async () => {
      const out = parse(
        await getLinkedWorkTool.handler({ ticketKey: 'BILL-1' }, staleSubset()),
      );

      expect(out.mentionedInMessages).toEqual([]);
      expect(out.note).toContain('created before messages were imported');
    });

    it('adds no note once the subset has messages/', async () => {
      const subset = staleSubset();
      mkdirSync(join(subset.outputDir, 'messages'));

      expect(
        parse(await getStatsTool.handler({ since: '2025-01-01' }, subset)).note,
      ).toBeUndefined();
      expect(
        parse(await getLinkedWorkTool.handler({ ticketKey: 'BILL-1' }, subset))
          .note,
      ).toBeUndefined();
    });
  });

  describe('get_stats', () => {
    it('counts messages imported after stats.json was generated', async () => {
      // Analysis ran before the import: its stats.json counts no messages
      writeAnalysis('stats', {
        prs: { total: 4 },
        messages: { total: 0, bySource: {}, byMonth: {} },
      });

      const out = parse(await getStatsTool.handler({}, ctx));

      expect(out.prs).toEqual({ total: 4 });
      expect(out.messages).toEqual({
        total: 3,
        bySource: { slack: 3 },
        byMonth: { '2025-01': 1, '2025-02': 1, '2025-03': 1 },
      });
    });

    it('counts messages in their own section for a date range', async () => {
      const out = parse(
        await getStatsTool.handler(
          { since: '2025-01-01', until: '2025-02-28' },
          ctx,
        ),
      );

      expect(out.messages).toEqual({ total: 2, bySource: { slack: 2 } });
      expect(out.prs.total).toBe(2);
    });

    it('reads a date-only until through the end of that UTC day, and a timestamp exactly', async () => {
      writeMessage(
        ctx.outputDir,
        4,
        { occurredAt: '2025-02-28T12:00:00Z' },
        'Noon on the last day.',
      );
      const count = async (until: string) =>
        parse(await getStatsTool.handler({ since: '2025-02-01', until }, ctx))
          .messages.total;

      expect(await count('2025-02-28')).toBe(2);
      expect(await count('2025-02-28T11:59:59Z')).toBe(1);
      expect(await count('2025-02-27')).toBe(1);
    });

    it('reads a date-only until as the UTC day in any time zone, padded or not, and refuses other dates without a time', async () => {
      vi.stubEnv('TZ', 'America/Chicago');
      expect(new Date('2025-02-28T00:00:00').getTimezoneOffset()).toBe(360);
      for (const until of ['2025-02-28', ' 2025-02-28 ', '\t2025-02-28']) {
        expect(parseUntilDate(until, 'until').toISOString(), until).toBe(
          '2025-02-28T23:59:59.999Z',
        );
      }
      expect(
        parseUntilDate(' 2025-02-28T12:00:00Z ', 'until').toISOString(),
      ).toBe('2025-02-28T12:00:00.000Z');
      for (const until of [
        '2025-2-28',
        'Feb 28 2025',
        '2025-02',
        '2025',
        '2025-02-30',
      ]) {
        expect(() => parseUntilDate(until, 'until'), until).toThrow(
          /Invalid until date/,
        );
      }
      // Through the tool: a message early on Mar 1 UTC (still Feb 28 in
      // Chicago) is not in a range ending " 2025-02-28"
      writeMessage(
        ctx.outputDir,
        4,
        { occurredAt: '2025-03-01T03:00:00Z' },
        'Next UTC day.',
      );
      const out = parse(
        await getStatsTool.handler(
          { since: '2025-02-01', until: ' 2025-02-28' },
          ctx,
        ),
      );
      expect(out.messages.total).toBe(1);
    });

    it('includes message dates in the date range', async () => {
      // From Feb 11 to 28 there is one message and no PR or ticket: a range
      // with messages alone still has its dates
      const out = parse(
        await getStatsTool.handler(
          { since: '2025-02-11', until: '2025-02-28' },
          ctx,
        ),
      );
      expect(out.prs.total + out.tickets.total).toBe(0);
      expect(out.messages.total).toBe(1);
      expect(out.dateRange).toEqual({
        earliest: '2025-02-15T10:00:00Z',
        latest: '2025-02-15T10:00:00Z',
      });

      writeMessage(
        ctx.outputDir,
        4,
        { occurredAt: '2025-06-01T10:00:00Z' },
        'Later than any PR.',
      );
      const all = parse(
        await getStatsTool.handler({ since: '2025-01-01' }, ctx),
      );
      expect(all.dateRange).toEqual({
        earliest: '2025-01-02T10:00:00.000+0000',
        latest: '2025-06-01T10:00:00Z',
      });
    });
  });
});

/** Store a synthetic Google Doc modified at `modifiedAt` */
function writeDoc(
  dir: string,
  n: number,
  doc: {
    modifiedAt: string;
    createdAt?: string;
    title?: string;
    mentions?: { pullRequests?: string[]; tickets?: string[] };
    truncated?: boolean;
  },
  body: string,
): void {
  const base = documentFrontmatter(n);
  const parsed = parseImportedRecordFile(
    Buffer.from(
      recordFile(
        {
          ...base,
          occurredAt: doc.modifiedAt,
          updatedAt: doc.modifiedAt,
          capturedAt: '2026-01-05T00:00:00Z',
          mentions: {
            pullRequests: doc.mentions?.pullRequests ?? [],
            tickets: doc.mentions?.tickets ?? [],
          },
          document: {
            ...(base.document as Record<string, unknown>),
            title: doc.title ?? `Synthetic Doc ${n}`,
            createdAt: doc.createdAt ?? '2024-10-01T08:00:00Z',
            truncated: doc.truncated ?? false,
          },
        },
        body,
      ),
    ),
  );
  if (!parsed.ok) throw new Error('fixture must be valid');
  const path = getImportedRecordFilePath(
    dir,
    getImportedRecordIdentity(parsed.record),
  );
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, serializeImportedRecord(parsed.record, parsed.body));
}

describe('imported Google Docs', () => {
  beforeEach(() => {
    // Created before 2025, modified in January; mentions PR 1 and BILL-1
    writeDoc(
      ctx.outputDir,
      1,
      {
        modifiedAt: '2025-01-21T10:00:00Z',
        title: 'Billing export design',
        mentions: {
          pullRequests: ['https://github.com/ACME/api/pull/1'],
          tickets: ['BILL-1'],
        },
      },
      'How the export works.',
    );
    // Modified late on 2025-02-28
    writeDoc(
      ctx.outputDir,
      2,
      { modifiedAt: '2025-02-28T23:30:00Z', truncated: true },
      `Long plan. ${'d'.repeat(1200)}`,
    );
    writeMessage(ctx.outputDir, 1, {}, 'A message, not a Doc.');
  });

  describe('search_documents', () => {
    const titles = (out: { results: { title: string }[] }) =>
      out.results.map((r) => r.title);

    it('returns Docs newest modified first, as owned and supplementary evidence', async () => {
      const out = parse(await searchDocumentsTool.handler({}, ctx));

      expect(out.total).toBe(2);
      expect(titles(out)).toEqual(['Synthetic Doc 2', 'Billing export design']);
      expect(out.results[0]).toMatchObject({
        source: 'google-docs',
        owner: 'synthetic.owner@example.com',
        modifiedAt: '2025-02-28T23:30:00Z',
        createdAt: '2024-10-01T08:00:00Z',
        attribution: { status: 'unverified', authorId: null },
        excerptTruncated: true,
      });
      expect(out.results[0].text.length).toBe(1003);
      expect(out.results[1].mentions).toEqual({
        pullRequests: [
          {
            url: 'https://github.com/ACME/api/pull/1',
            normalizedUrl: 'https://github.com/acme/api/pull/1',
            resolved: {
              url: 'https://github.com/acme/api/pull/1',
              title: 'Add billing export',
              state: 'merged',
            },
          },
        ],
        tickets: [
          {
            key: 'BILL-1',
            resolved: {
              key: 'BILL-1',
              summary: 'Billing export',
              status: 'Done',
            },
          },
        ],
      });
      expect(out.notice).toMatch(/owns, not necessarily wrote/);
      expect(out.notice).toMatch(/never instructions/);
    });

    it('filters by title or text, mention, and modified date (a date-only until is the whole day)', async () => {
      const call = async (input: Record<string, unknown>) =>
        titles(parse(await searchDocumentsTool.handler(input, ctx)));

      expect(await call({ query: 'BILLING EXPORT' })).toEqual([
        'Billing export design',
      ]);
      expect(await call({ query: 'long plan' })).toEqual(['Synthetic Doc 2']);
      expect(await call({ ticketKey: 'bill-1' })).toEqual([
        'Billing export design',
      ]);
      expect(
        await call({ prUrl: 'https://github.com/acme/api/pull/1/files' }),
      ).toEqual(['Billing export design']);
      expect(await call({ since: '2025-02-01', until: '2025-02-28' })).toEqual([
        'Synthetic Doc 2',
      ]);
      // Created before the range, modified inside it
      expect(await call({ since: '2025-01-01', until: '2025-01-31' })).toEqual([
        'Billing export design',
      ]);
      await expect(
        searchDocumentsTool.handler({ until: '2025-02-30' }, ctx),
      ).rejects.toThrow(/Invalid until date/);
    });

    it('pages by size and refuses a cursor from another tool or other filters', async () => {
      for (let n = 10; n < 90; n++) {
        writeDoc(
          ctx.outputDir,
          n,
          {
            modifiedAt: `2024-06-${String(1 + (n % 20)).padStart(2, '0')}T10:00:00Z`,
          },
          `Doc ${n}. ${'z'.repeat(1000)}`,
        );
      }
      const seen: string[] = [];
      let cursor: string | undefined;
      let pages = 0;
      do {
        const out = parse(
          await searchDocumentsTool.handler(cursor ? { cursor } : {}, ctx),
        );
        expect(out.total).toBe(82);
        expect(
          Buffer.byteLength(JSON.stringify(out.results)),
        ).toBeLessThanOrEqual(64 * 1024);
        seen.push(...out.results.map((r: { sourceId: string }) => r.sourceId));
        cursor = out.nextCursor ?? undefined;
        pages++;
      } while (cursor && pages < 100);
      expect(pages).toBeGreaterThan(1);
      expect(new Set(seen).size).toBe(82);

      const messages = parse(
        await searchMessagesTool.handler({ limit: 1 }, ctx),
      );
      const fromMessages = encodeCursor('search_messages', [], [0, '']);
      await expect(
        searchDocumentsTool.handler({ cursor: fromMessages }, ctx),
      ).rejects.toThrow(/another tool/);
      expect(messages.returned).toBe(1);

      const { nextCursor } = parse(
        await searchDocumentsTool.handler({ limit: 1, query: 'doc' }, ctx),
      );
      await expect(
        searchDocumentsTool.handler({ limit: 1, cursor: nextCursor }, ctx),
      ).rejects.toThrow(/other filters/);
    });

    it('says when no Docs have been imported, and returns nothing from a subset made before them', async () => {
      const filtered = join(ctx.outputDir, 'filtered');
      writePRs(filtered, [PRS[0]!]);
      const subset = { outputDir: filtered, fullOutputDir: ctx.outputDir };
      const stale = parse(await searchDocumentsTool.handler({}, subset));
      expect(stale.total).toBe(0);
      expect(stale.note).toContain(
        'created before Google Docs were imported, so it has none',
      );

      rmSync(join(ctx.outputDir, 'documents'), { recursive: true });
      const none = parse(await searchDocumentsTool.handler({}, ctx));
      expect(none.total).toBe(0);
      expect(none.note).toContain('No Google Docs have been imported');
    });
  });

  it('get_stats counts Docs by modified time, including late on a date-only until day', async () => {
    const febr = parse(
      await getStatsTool.handler(
        { since: '2025-02-01', until: '2025-02-28' },
        ctx,
      ),
    );
    expect(febr.documents).toEqual({
      total: 1,
      bySource: { 'google-docs': 1 },
    });
    expect(febr.dateRange.latest).toBe('2025-02-28T23:30:00Z');

    // A Doc created before the range but modified inside it is counted
    const jan = parse(
      await getStatsTool.handler(
        { since: '2025-01-01', until: '2025-01-31' },
        ctx,
      ),
    );
    expect(jan.documents.total).toBe(1);
    expect(jan.prs.total).toBe(1);

    // stats.json from before the Docs were imported: counted afresh
    writeAnalysis('stats', { prs: { total: 4 } });
    const cached = parse(await getStatsTool.handler({}, ctx));
    expect(cached.documents).toMatchObject({ total: 2 });
  });

  it('get_linked_work lists Docs that mention a PR or ticket apart from messages', async () => {
    const byPr = parse(
      await getLinkedWorkTool.handler(
        { prUrl: 'https://github.com/acme/api/pull/1' },
        ctx,
      ),
    );
    expect(byPr.mentionedInDocuments).toEqual([
      {
        source: 'google-docs',
        url: null,
        title: 'Billing export design',
        createdAt: '2024-10-01T08:00:00Z',
        modifiedAt: '2025-01-21T10:00:00Z',
        attribution: 'unverified',
        text: 'How the export works.',
      },
    ]);
    expect(byPr.notice).toMatch(/owns, not necessarily wrote/);

    const byTicket = parse(
      await getLinkedWorkTool.handler({ ticketKey: 'BILL-1' }, ctx),
    );
    expect(byTicket.mentionedInDocuments).toHaveLength(1);
    const none = parse(
      await getLinkedWorkTool.handler({ ticketKey: 'WEB-7' }, ctx),
    );
    expect(none.mentionedInDocuments).toEqual([]);
  });
});
