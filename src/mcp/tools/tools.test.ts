import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
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
  searchMessagesTool,
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
      coverage: expect.stringContaining('Authored PRs and JIRA tickets only'),
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
    // An import's working files are never records
    mkdirSync(join(ctx.outputDir, '.import-transaction', 'staged'), {
      recursive: true,
    });
    writeFileSync(
      join(ctx.outputDir, '.import-transaction', 'staged', '0.md'),
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
  });
});
