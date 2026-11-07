import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Config } from '@config/schema';
import {
  getPRReviewFilePath,
  readAllPRReviews,
  readAllPRs,
  readPRReview,
} from '@core/index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// GitHub is the external system. This fake models the parts of its API the
// review fetch relies on: search qualifiers, the 1000-result search cap,
// page-based pagination, and per-PR reviews and review comments.
interface FakeReview {
  id: number;
  user: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'PENDING';
  submittedAt: string | null;
  body?: string;
}

interface FakeComment {
  id: number;
  user: string;
  reviewId: number | null;
  createdAt: string;
  updatedAt?: string;
  body: string;
  path?: string;
  line?: number | null;
}

interface FakePR {
  owner: string;
  repo: string;
  number: number;
  title: string;
  author: string;
  state: 'open' | 'closed';
  mergedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reviews: FakeReview[];
  comments: FakeComment[];
}

const SEARCH_CAP = 1000;
const github = {
  prs: [] as FakePR[],
  users: new Set<string>(),
  searches: [] as string[],
  reviewListings: [] as string[],
  failures: new Map<string, () => Error>(),
};

const notFound = () => Object.assign(new Error('Not Found'), { status: 404 });

function fail(key: string) {
  const failure = github.failures.get(key);
  if (failure) throw failure();
}

function page<T>(items: T[], perPage = 30, pageNumber = 1): T[] {
  return items.slice((pageNumber - 1) * perPage, pageNumber * perPage);
}

function matchesSearch(pr: FakePR, q: string): boolean {
  const reviewer = /reviewed-by:(\S+)/.exec(q)?.[1];
  const notAuthor = /-author:(\S+)/.exec(q)?.[1];
  const owner = /(?:^|\s)(?:org|user):(\S+)/.exec(q)?.[1];
  const updated = /updated:(\S+)/.exec(q)?.[1] ?? '';
  const day = pr.updatedAt.slice(0, 10);
  const [from, to] = updated.startsWith('>=')
    ? [updated.slice(2), '9999-12-31']
    : updated.split('..');
  return (
    pr.reviews.some((r) => r.user === reviewer && r.state !== 'PENDING') &&
    pr.author !== notAuthor &&
    pr.owner === owner &&
    day >= (from ?? '') &&
    day <= (to ?? '')
  );
}

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    users = {
      getByUsername: async ({ username }: { username: string }) => {
        if (!github.users.has(username)) throw notFound();
        return { data: { type: 'User' } };
      },
    };
    search = {
      issuesAndPullRequests: async (params: {
        q: string;
        per_page: number;
        page: number;
      }) => {
        github.searches.push(params.q);
        fail('search');
        if (params.page * params.per_page > SEARCH_CAP) {
          throw Object.assign(new Error('Cannot access beyond 1000'), {
            status: 422,
          });
        }
        const matches = github.prs
          .filter((pr) => matchesSearch(pr, params.q))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return {
          data: {
            total_count: matches.length,
            incomplete_results: false,
            items: page(matches, params.per_page, params.page).map((pr) => ({
              number: pr.number,
              title: pr.title,
              user: { login: pr.author },
              state: pr.state,
              html_url: `https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}`,
              repository_url: `https://api.github.com/repos/${pr.owner}/${pr.repo}`,
              updated_at: pr.updatedAt,
              pull_request: { merged_at: pr.mergedAt },
            })),
          },
        };
      },
    };
    pulls = {
      listReviews: async (params: PullParams) => {
        const pr = findPR(params);
        github.reviewListings.push(`${pr.owner}/${pr.repo}#${pr.number}`);
        fail(`reviews:${pr.owner}/${pr.repo}#${pr.number}`);
        return {
          data: page(pr.reviews, params.per_page, params.page).map((r) => ({
            id: r.id,
            user: { login: r.user },
            state: r.state,
            submitted_at: r.submittedAt ?? undefined,
            body: r.body ?? '',
            html_url: `https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}#pullrequestreview-${r.id}`,
          })),
        };
      },
      listReviewComments: async (params: PullParams) => {
        const pr = findPR(params);
        return {
          data: page(pr.comments, params.per_page, params.page).map((c) => ({
            id: c.id,
            user: { login: c.user },
            pull_request_review_id: c.reviewId,
            in_reply_to_id: undefined,
            path: c.path ?? 'src/index.ts',
            line: c.line ?? 10,
            original_line: 10,
            created_at: c.createdAt,
            updated_at: c.updatedAt ?? c.createdAt,
            body: c.body,
            html_url: `https://github.com/${pr.owner}/${pr.repo}/pull/${pr.number}#discussion_r${c.id}`,
          })),
        };
      },
    };
  },
}));

interface PullParams {
  owner: string;
  repo: string;
  pull_number: number;
  per_page: number;
  page: number;
}

function findPR({ owner, repo, pull_number }: PullParams): FakePR {
  const pr = github.prs.find(
    (p) => p.owner === owner && p.repo === repo && p.number === pull_number,
  );
  if (!pr) throw notFound();
  return pr;
}

const { fetchGitHubReviews } = await import('./github-reviews.utils');

const ME = 'octocat';

function addPR(overrides: Partial<FakePR> & { number: number }): FakePR {
  const pr: FakePR = {
    owner: 'acme',
    repo: 'api',
    title: `PR ${overrides.number}`,
    author: 'alice',
    state: 'open',
    mergedAt: null,
    createdAt: '2025-02-01T00:00:00Z',
    updatedAt: '2025-03-01T00:00:00Z',
    reviews: [],
    comments: [],
    ...overrides,
  };
  github.prs.push(pr);
  return pr;
}

function review(
  id: number,
  submittedAt: string | null,
  overrides: Partial<FakeReview> = {},
): FakeReview {
  return { id, user: ME, state: 'COMMENTED', submittedAt, ...overrides };
}

function config(
  orgs: Config['github']['orgs'] = [{ name: 'acme', repos: ['*'] }],
): Config {
  return {
    github: { username: ME, token: 'test-token', orgs },
    output: { directory: './work-log' },
    fetch: { since: '2025-01-01', until: '2025-06-01' },
    analysis: { thresholds: { minor: {}, major: {}, flagship: {} } },
  };
}

let outputDir: string;
let logs: string[];

async function fetchReviews(
  options: { orgs?: Config['github']['orgs']; useCache?: boolean } = {},
) {
  return fetchGitHubReviews({
    config: config(options.orgs),
    outputDir,
    useCache: options.useCache,
  });
}

async function storedRecord(owner: string, repo: string, prNumber: number) {
  return (
    await readPRReview(getPRReviewFilePath(outputDir, owner, repo, prNumber))
  )?.frontmatter;
}

beforeEach(() => {
  outputDir = mkdtempSync(join(tmpdir(), 'wc-reviews-'));
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.join(' '));
  });
  github.prs = [];
  github.users.clear();
  github.searches.length = 0;
  github.reviewListings.length = 0;
  github.failures.clear();
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(outputDir, { recursive: true, force: true });
  process.exitCode = undefined;
});

describe('fetchGitHubReviews', () => {
  it('stores review work on an old PR that is not in the work log, never as an authored PR', async () => {
    addPR({
      number: 7,
      title: 'Legacy cleanup',
      createdAt: '2019-05-01T00:00:00Z',
      updatedAt: '2025-03-02T00:00:00Z',
      state: 'closed',
      mergedAt: '2025-03-02T00:00:00Z',
      reviews: [
        review(11, '2024-12-01T00:00:00Z', { body: 'before the range' }),
        review(12, '2025-03-01T12:00:00Z', {
          state: 'APPROVED',
          body: 'Looks good',
        }),
        review(13, '2025-03-01T13:00:00Z', { user: 'bob' }),
      ],
      comments: [
        {
          id: 21,
          user: ME,
          reviewId: 12,
          createdAt: '2025-03-01T12:00:00Z',
          body: 'Nit: rename this',
          path: 'src/db.ts',
          line: 42,
        },
        {
          id: 22,
          user: 'bob',
          reviewId: 13,
          createdAt: '2025-03-01T13:00:00Z',
          body: 'not mine',
        },
      ],
    });

    await fetchReviews();

    expect(await storedRecord('acme', 'api', 7)).toEqual({
      type: 'pr-review',
      reviewer: ME,
      pr: {
        url: 'https://github.com/acme/api/pull/7',
        org: 'acme',
        repository: 'api',
        prNumber: 7,
        title: 'Legacy cleanup',
        author: 'alice',
        state: 'merged',
      },
      prUpdatedAt: '2025-03-02T00:00:00Z',
      fetchedRange: {
        since: '2025-01-01T00:00:00.000Z',
        until: '2025-06-01T00:00:00.000Z',
      },
      reviews: [
        {
          reviewId: 12,
          state: 'APPROVED',
          submittedAt: '2025-03-01T12:00:00Z',
          url: 'https://github.com/acme/api/pull/7#pullrequestreview-12',
          body: 'Looks good',
        },
      ],
      comments: [
        {
          commentId: 21,
          reviewId: 12,
          inReplyToId: null,
          path: 'src/db.ts',
          line: 42,
          createdAt: '2025-03-01T12:00:00Z',
          updatedAt: '2025-03-01T12:00:00Z',
          url: 'https://github.com/acme/api/pull/7#discussion_r21',
          body: 'Nit: rename this',
        },
      ],
    });
    expect(await readAllPRs(outputDir)).toEqual([]);
    expect(github.searches[0]).toBe(
      `is:pr reviewed-by:${ME} -author:${ME} org:acme updated:>=2025-01-01`,
    );
  });

  it('keeps every review of a PR reviewed repeatedly, with review and comment IDs kept apart', async () => {
    addPR({
      number: 8,
      reviews: [
        review(500, '2025-02-01T00:00:00Z', { state: 'CHANGES_REQUESTED' }),
        review(501, '2025-02-03T00:00:00Z', { state: 'APPROVED' }),
      ],
      comments: [
        {
          id: 500,
          user: ME,
          reviewId: 500,
          createdAt: '2025-02-01T00:00:00Z',
          body: 'Same number as a review ID',
        },
      ],
    });

    await fetchReviews();

    const record = await storedRecord('acme', 'api', 8);
    expect(record?.reviews.map((r) => [r.reviewId, r.state])).toEqual([
      [500, 'CHANGES_REQUESTED'],
      [501, 'APPROVED'],
    ]);
    expect(record?.comments.map((c) => [c.commentId, c.reviewId])).toEqual([
      [500, 500],
    ]);
  });

  it('leaves out pending reviews and the draft comments in them', async () => {
    addPR({
      number: 9,
      reviews: [
        review(31, '2025-02-01T00:00:00Z'),
        review(32, null, { state: 'PENDING' }),
      ],
      comments: [
        {
          id: 41,
          user: ME,
          reviewId: 31,
          createdAt: '2025-02-01T00:00:00Z',
          body: 'submitted',
        },
        {
          id: 42,
          user: ME,
          reviewId: 32,
          createdAt: '2025-02-02T00:00:00Z',
          body: 'draft',
        },
      ],
    });

    await fetchReviews();

    const record = await storedRecord('acme', 'api', 9);
    expect(record?.reviews.map((r) => r.reviewId)).toEqual([31]);
    expect(record?.comments.map((c) => c.body)).toEqual(['submitted']);
  });

  it('follows every page of search results, reviews and comments', async () => {
    for (let n = 1; n <= 105; n++) {
      addPR({ number: n, reviews: [review(n, '2025-02-01T00:00:00Z')] });
    }
    const busy = github.prs[0]!;
    busy.reviews = [
      ...Array.from({ length: 140 }, (_, i) =>
        review(10_000 + i, '2025-02-01T00:00:00Z', { user: 'bob' }),
      ),
      review(1, '2025-02-01T00:00:00Z'),
    ];
    busy.comments = Array.from({ length: 130 }, (_, i) => ({
      id: 20_000 + i,
      user: i === 125 ? ME : 'bob',
      reviewId: 1,
      createdAt: '2025-02-01T00:00:00Z',
      body: `comment ${i}`,
    }));

    await fetchReviews();

    expect(await readAllPRReviews(outputDir)).toHaveLength(105);
    const record = await storedRecord('acme', 'api', 1);
    expect(record?.reviews.map((r) => r.reviewId)).toEqual([1]);
    expect(record?.comments.map((c) => c.body)).toEqual(['comment 125']);
  });

  it('includes comments by creation time and stores their edited text', async () => {
    addPR({
      number: 10,
      reviews: [
        review(51, '2024-11-01T00:00:00Z'),
        review(52, '2025-02-01T00:00:00Z'),
      ],
      comments: [
        {
          id: 61,
          user: ME,
          reviewId: 51,
          createdAt: '2024-11-01T00:00:00Z',
          updatedAt: '2025-02-10T00:00:00Z',
          body: 'old comment edited inside the range',
        },
        {
          id: 62,
          user: ME,
          reviewId: 52,
          createdAt: '2025-02-01T00:00:00Z',
          updatedAt: '2025-02-05T00:00:00Z',
          body: 'edited text',
        },
      ],
    });

    await fetchReviews();

    const record = await storedRecord('acme', 'api', 10);
    expect(record?.comments).toMatchObject([
      {
        commentId: 62,
        body: 'edited text',
        createdAt: '2025-02-01T00:00:00Z',
        updatedAt: '2025-02-05T00:00:00Z',
      },
    ]);
  });

  it('keeps PRs with the same number in different repositories apart', async () => {
    addPR({
      number: 7,
      repo: 'api',
      reviews: [review(71, '2025-02-01T00:00:00Z')],
    });
    addPR({
      number: 7,
      repo: 'web',
      reviews: [review(72, '2025-02-02T00:00:00Z')],
    });

    await fetchReviews();

    expect((await storedRecord('acme', 'api', 7))?.reviews[0]?.reviewId).toBe(
      71,
    );
    expect((await storedRecord('acme', 'web', 7))?.pr.url).toBe(
      'https://github.com/acme/web/pull/7',
    );
    expect((await storedRecord('acme', 'web', 7))?.reviews[0]?.reviewId).toBe(
      72,
    );
  });

  it('stays inside the configured repos and searches user accounts with user:', async () => {
    github.users.add('octo-personal');
    addPR({
      number: 1,
      repo: 'api',
      reviews: [review(1, '2025-02-01T00:00:00Z')],
    });
    addPR({
      number: 2,
      repo: 'web',
      reviews: [review(2, '2025-02-01T00:00:00Z')],
    });
    addPR({
      number: 3,
      owner: 'octo-personal',
      repo: 'dotfiles',
      reviews: [review(3, '2025-02-01T00:00:00Z')],
    });

    await fetchReviews({
      orgs: [
        { name: 'acme', repos: ['api'] },
        { name: 'octo-personal', repos: ['*'] },
      ],
    });

    expect(
      (await readAllPRReviews(outputDir)).map((r) => r.frontmatter.pr.url),
    ).toEqual(
      expect.arrayContaining([
        'https://github.com/acme/api/pull/1',
        'https://github.com/octo-personal/dotfiles/pull/3',
      ]),
    );
    expect(await readAllPRReviews(outputDir)).toHaveLength(2);
    expect(github.searches[1]).toContain('user:octo-personal');
  });

  describe('more reviewed PRs than one search can return', () => {
    function addPRsUpdatedOn(day: string, count: number, firstNumber: number) {
      for (let i = 0; i < count; i++) {
        // Reviewed before the range, so found by the search but not stored
        addPR({
          number: firstNumber + i,
          updatedAt: `${day}T00:00:00Z`,
          reviews: [review(firstNumber + i, '2024-06-01T00:00:00Z')],
        });
      }
    }

    it('splits the search into date windows that each fit', async () => {
      addPRsUpdatedOn('2025-02-01', 600, 1);
      addPRsUpdatedOn('2025-04-01', 600, 1001);
      addPR({
        number: 5000,
        updatedAt: '2025-04-02T00:00:00Z',
        reviews: [review(5000, '2025-04-02T00:00:00Z')],
      });

      await fetchReviews();

      expect(github.reviewListings).toHaveLength(1201);
      expect(
        (await readAllPRReviews(outputDir)).map(
          (r) => r.frontmatter.pr.prNumber,
        ),
      ).toEqual([5000]);
      expect(process.exitCode).toBeUndefined();
    });

    it('reports the run incomplete when one day alone is over the cap', async () => {
      addPRsUpdatedOn('2025-02-01', 1001, 1);

      await fetchReviews();

      expect(github.reviewListings).toHaveLength(1000);
      expect(logs.some((line) => line.includes('More than 1000'))).toBe(true);
      expect(process.exitCode).toBe(1);
    });
  });

  it('stops the run when the search is rate limited', async () => {
    github.failures.set('search', () =>
      Object.assign(new Error('API rate limit exceeded'), {
        status: 403,
        response: { headers: { 'x-ratelimit-remaining': '0' } },
      }),
    );

    await expect(
      fetchReviews({
        orgs: [
          { name: 'acme', repos: ['*'] },
          { name: 'other', repos: ['*'] },
        ],
      }),
    ).rejects.toThrow(/rate limit/);
    expect(github.searches).toHaveLength(1);
  });

  it('stops at a rate-limited PR instead of moving on to the next', async () => {
    addPR({ number: 1, reviews: [review(1, '2025-02-01T00:00:00Z')] });
    addPR({
      number: 2,
      createdAt: '2025-02-02T00:00:00Z',
      reviews: [review(2, '2025-02-01T00:00:00Z')],
    });
    github.failures.set('reviews:acme/api#1', () =>
      Object.assign(new Error('Too Many Requests'), { status: 429 }),
    );

    await expect(fetchReviews()).rejects.toThrow(/rate limit/);
    expect(github.reviewListings).toEqual(['acme/api#1']);
  });

  it('reports a PR whose reviews fail, keeps going and fails the run', async () => {
    addPR({ number: 1, reviews: [review(1, '2025-02-01T00:00:00Z')] });
    addPR({
      number: 2,
      createdAt: '2025-02-02T00:00:00Z',
      reviews: [review(2, '2025-02-01T00:00:00Z')],
    });
    github.failures.set('reviews:acme/api#1', () =>
      Object.assign(new Error('Bad Gateway'), { status: 502 }),
    );

    await fetchReviews();

    expect(await storedRecord('acme', 'api', 2)).toBeDefined();
    expect(logs.some((line) => line.includes('for 1 PRs'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('updates the same record on every fetch and skips unchanged PRs with --cache', async () => {
    const pr = addPR({
      number: 1,
      reviews: [review(1, '2025-02-01T00:00:00Z')],
    });
    const path = getPRReviewFilePath(outputDir, 'acme', 'api', 1);

    await fetchReviews();
    const first = readFileSync(path, 'utf-8');
    await fetchReviews();
    expect(readFileSync(path, 'utf-8')).toBe(first);

    github.reviewListings.length = 0;
    await fetchReviews({ useCache: true });
    expect(github.reviewListings).toEqual([]);

    pr.reviews.push(review(2, '2025-03-05T00:00:00Z', { state: 'APPROVED' }));
    pr.updatedAt = '2025-03-05T00:00:00Z';
    await fetchReviews({ useCache: true });
    expect(
      (await storedRecord('acme', 'api', 1))?.reviews.map((r) => r.reviewId),
    ).toEqual([1, 2]);
  });
});
