/**
 * Fetching the PR reviews a user gave
 *
 * Finds pull requests the user reviewed through the search API, then lists
 * each PR's reviews and inline review comments and keeps the user's own,
 * submitted inside the fetch range. Results are stored as review records
 * under `pr-reviews/`, separate from authored PRs.
 */

import { join } from 'node:path';

import { CliError } from '@cli/errors';
import {
  type Config,
  DIRECTORIES,
  type GitHubOrgConfig,
  type GivenReview,
  type GivenReviewComment,
  getPRReviewFilePath,
  type PRReviewRecord,
  readAllPRReviews,
  readPRReview,
  splitReviewRecordsByReviewer,
  writeMarkdownFile,
} from '@core/index';
import { Octokit } from '@octokit/rest';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';

import {
  formatDate,
  getGitHubToken,
  handleRateLimitError,
  isAccessError,
  isUser,
  mapPRState,
  parseDate,
  RateLimitError,
} from './github.utils';

/** The search API returns at most this many results per query */
const SEARCH_RESULT_CAP = 1000;
const PER_PAGE = 100;

const REVIEW_STATES = new Set<GivenReview['state']>([
  'APPROVED',
  'CHANGES_REQUESTED',
  'COMMENTED',
  'DISMISSED',
]);

/** Printed when `--reviews` is used with a manager profile */
export const MANAGER_REVIEWS_SKIPPED =
  'PR reviews given (--reviews) are only fetched for IC profiles; skipping them for this manager profile.';

/** Options for fetching the reviews a user gave */
export interface FetchGitHubReviewsOptions {
  config: Config;
  outputDir: string;
  verbose?: boolean;
  /** Skip PRs unchanged since their record was written for this range */
  useCache?: boolean;
}

/** Result of fetching reviews in one configured org */
export interface GitHubReviewFetchResult {
  org: string;
  /** Review records written or updated */
  recordsWritten: number;
  /** PRs skipped by `--cache` because nothing changed */
  recordsUnchanged: number;
  /** Reviews and inline comments in the written records, inside the range */
  reviews: number;
  comments: number;
  /** Why the org's results may be incomplete; empty when complete */
  problems: string[];
}

type SearchItem = Awaited<
  ReturnType<Octokit['search']['issuesAndPullRequests']>
>['data']['items'][number];

/** An inclusive `updated:` date window; `to: null` is open-ended */
interface SearchWindow {
  from: string;
  to: string | null;
}

interface Range {
  since: Date;
  until: Date;
}

function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDate(date);
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() -
      new Date(`${from}T00:00:00Z`).getTime()) /
      86_400_000,
  );
}

function windowQualifier(window: SearchWindow): string {
  return window.to
    ? `updated:${window.from}..${window.to}`
    : `updated:>=${window.from}`;
}

function inRange(timestamp: string, range: Range): boolean {
  const date = new Date(timestamp);
  return date >= range.since && date <= range.until;
}

function sameLogin(a: string | undefined, b: string): boolean {
  return a?.toLowerCase() === b.toLowerCase();
}

/**
 * Find every PR in scope the user reviewed and that was updated on or after
 * the window start. Submitting a review or a review comment updates the PR,
 * so a PR reviewed inside the fetch range always has `updated_at` on or
 * after `fetch.since`, however old the PR itself is.
 *
 * A query matching more than the search API's 1000-result cap is split into
 * smaller `updated:` windows until each fits; a single day that still does
 * not fit is reported as incomplete.
 */
async function searchReviewedPRs(
  octokit: Octokit,
  baseQuery: string,
  window: SearchWindow,
  today: string,
  found: Map<string, SearchItem>,
  problems: string[],
): Promise<void> {
  const query = `${baseQuery} ${windowQualifier(window)}`;
  const search = async (page: number) => {
    try {
      const { data } = await octokit.search.issuesAndPullRequests({
        q: query,
        sort: 'created',
        order: 'asc',
        per_page: PER_PAGE,
        page,
      });
      return data;
    } catch (error) {
      handleRateLimitError(error);
    }
  };

  const first = await search(1);
  if (first.total_count > SEARCH_RESULT_CAP) {
    const end = window.to ?? today;
    const span = daysBetween(window.from, end);
    if (span >= 1) {
      const middle = addDays(window.from, Math.floor(span / 2));
      for (const half of [
        { from: window.from, to: middle },
        { from: addDays(middle, 1), to: window.to },
      ]) {
        await searchReviewedPRs(
          octokit,
          baseQuery,
          half,
          today,
          found,
          problems,
        );
      }
      return;
    }
    problems.push(
      `More than ${SEARCH_RESULT_CAP} reviewed PRs were updated on ${window.from}; only the first ${SEARCH_RESULT_CAP} were checked.`,
    );
  }

  let data = first;
  let seen = 0;
  for (let page = 1; ; page++) {
    if (page > 1) data = await search(page);
    // Once per org, however many pages or date windows report it
    const incomplete = 'GitHub search returned incomplete results.';
    if (data.incomplete_results && !problems.includes(incomplete)) {
      problems.push(incomplete);
    }
    for (const item of data.items) {
      found.set(item.html_url, item);
    }
    seen += data.items.length;
    const reachable = Math.min(data.total_count, SEARCH_RESULT_CAP);
    if (data.items.length < PER_PAGE || seen >= reachable) break;
  }
}

/**
 * Owner and repository of a search result, from its `repository_url`
 * (`https://api.github.com/repos/<owner>/<repo>`).
 */
function parseRepository(
  item: SearchItem,
): { owner: string; repo: string } | null {
  const match = /\/repos\/([^/]+)\/([^/]+)$/.exec(item.repository_url);
  if (!match?.[1] || !match[2]) return null;
  return { owner: match[1], repo: match[2] };
}

async function listAllPages<T>(
  request: (page: number) => Promise<{ data: T[] }>,
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 1; ; page++) {
    let data: T[];
    try {
      ({ data } = await request(page));
    } catch (error) {
      handleRateLimitError(error);
    }
    all.push(...data);
    if (data.length < PER_PAGE) return all;
  }
}

/**
 * Keep stored entries the current fetch could not have seen (outside its
 * range), and take everything inside the range from the fetch. Entries are
 * matched by their own ID, so repeated fetches never duplicate them.
 */
function mergeEntries<T>(
  existing: T[],
  fetched: T[],
  id: (entry: T) => number,
  time: (entry: T) => string,
  range: Range,
): T[] {
  const fetchedIds = new Set(fetched.map(id));
  return [
    ...existing.filter(
      (entry) => !fetchedIds.has(id(entry)) && !inRange(time(entry), range),
    ),
    ...fetched,
  ].sort((a, b) => new Date(time(a)).getTime() - new Date(time(b)).getTime());
}

function quoteBody(text: string): string {
  return text
    .split('\n')
    .map((line) => (line ? `> ${line}` : '>'))
    .join('\n');
}

/**
 * Human-readable view of a review record. The frontmatter is the source of
 * truth; this body only makes the file easy to read and search.
 */
export function renderReviewRecordBody(record: PRReviewRecord): string {
  const { pr } = record;
  const lines = [
    `Review work by @${record.reviewer} on ${pr.org}/${pr.repository}#${pr.prNumber} (${pr.url}), a PR by @${pr.author}. This is not an authored PR.`,
  ];

  if (record.reviews.length > 0) {
    lines.push('', '## Reviews');
    for (const review of record.reviews) {
      lines.push('', `### ${review.state} on ${review.submittedAt}`);
      if (review.body) lines.push('', quoteBody(review.body));
    }
  }

  if (record.comments.length > 0) {
    lines.push('', '## Inline comments');
    for (const comment of record.comments) {
      const location =
        comment.line === null
          ? comment.path
          : `${comment.path}:${comment.line}`;
      lines.push(
        '',
        `### ${location} on ${comment.createdAt}`,
        '',
        quoteBody(comment.body),
      );
    }
  }

  return lines.join('\n');
}

/**
 * Whether a stored record already holds everything this fetch would find:
 * the PR has not changed since the record was written, and the record's
 * range covers this one. Every review and comment updates the PR, so when
 * the record was written after the PR's last update, nothing can exist
 * after the record's range end and an open-ended range is covered too.
 */
function isRecordCurrent(
  existing: PRReviewRecord,
  item: SearchItem,
  range: Range,
): boolean {
  const fetched = existing.fetchedRange;
  if (!fetched) return false;
  const prUpdatedAt = new Date(existing.prUpdatedAt);
  if (prUpdatedAt.getTime() !== new Date(item.updated_at).getTime()) {
    return false;
  }
  const fetchedUntil = new Date(fetched.until);
  return (
    new Date(fetched.since) <= range.since &&
    (fetchedUntil >= range.until || fetchedUntil >= prUpdatedAt)
  );
}

interface FetchPRReviewsParams {
  octokit: Octokit;
  item: SearchItem;
  owner: string;
  repo: string;
  username: string;
  range: Range;
  outputDir: string;
  useCache?: boolean;
}

type PRReviewOutcome =
  | { kind: 'unchanged' }
  | { kind: 'empty' }
  | { kind: 'written'; reviews: number; comments: number };

/**
 * Fetch the user's reviews and inline comments on one PR and upsert its
 * review record. Stored records all belong to this user:
 * {@link assertReviewRecordsBelongTo} runs before any PR is fetched.
 */
async function fetchPRReviews(
  params: FetchPRReviewsParams,
): Promise<PRReviewOutcome> {
  const { octokit, item, owner, repo, username, range, outputDir, useCache } =
    params;
  const filePath = getPRReviewFilePath(outputDir, owner, repo, item.number);
  const existing = (await readPRReview(filePath))?.frontmatter;

  if (useCache && existing && isRecordCurrent(existing, item, range)) {
    return { kind: 'unchanged' };
  }

  const pullNumber = item.number;
  const allReviews = await listAllPages((page) =>
    octokit.pulls.listReviews({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: PER_PAGE,
      page,
    }),
  );
  const allComments = await listAllPages((page) =>
    octokit.pulls.listReviewComments({
      owner,
      repo,
      pull_number: pullNumber,
      per_page: PER_PAGE,
      page,
    }),
  );

  const ownReviews = allReviews.filter((r) =>
    sameLogin(r.user?.login, username),
  );
  // Comments in a pending (unsubmitted) review are drafts nobody else sees
  const pendingReviewIds = new Set(
    ownReviews.filter((r) => r.state === 'PENDING').map((r) => r.id),
  );

  const reviews: GivenReview[] = [];
  for (const review of ownReviews) {
    const state = review.state as GivenReview['state'];
    if (!REVIEW_STATES.has(state) || !review.submitted_at) continue;
    if (!inRange(review.submitted_at, range)) continue;
    reviews.push({
      reviewId: review.id,
      state,
      submittedAt: review.submitted_at,
      url: review.html_url,
      body: review.body ?? '',
    });
  }

  const comments: GivenReviewComment[] = [];
  for (const comment of allComments) {
    if (!sameLogin(comment.user?.login, username)) continue;
    if (pendingReviewIds.has(comment.pull_request_review_id ?? -1)) continue;
    // The endpoint's `since` filters by last update, so filter creation
    // locally: an old comment edited inside the range is not new review work
    if (!inRange(comment.created_at, range)) continue;
    comments.push({
      commentId: comment.id,
      reviewId: comment.pull_request_review_id ?? null,
      inReplyToId: comment.in_reply_to_id ?? null,
      path: comment.path,
      line: comment.line ?? comment.original_line ?? null,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
      url: comment.html_url,
      body: comment.body,
    });
  }

  const mergedReviews = mergeEntries(
    existing?.reviews ?? [],
    reviews,
    (r) => r.reviewId,
    (r) => r.submittedAt,
    range,
  );
  const mergedComments = mergeEntries(
    existing?.comments ?? [],
    comments,
    (c) => c.commentId,
    (c) => c.createdAt,
    range,
  );
  if (mergedReviews.length === 0 && mergedComments.length === 0) {
    return { kind: 'empty' };
  }

  const record: PRReviewRecord = {
    type: 'pr-review',
    reviewer: username,
    pr: {
      url: `https://github.com/${owner}/${repo}/pull/${item.number}`,
      org: owner,
      repository: repo,
      prNumber: item.number,
      title: item.title,
      author: item.user?.login ?? 'unknown',
      state: mapPRState(item.state, item.pull_request?.merged_at ?? null),
    },
    prUpdatedAt: item.updated_at,
    fetchedRange: {
      since: range.since.toISOString(),
      until: range.until.toISOString(),
    },
    reviews: mergedReviews,
    comments: mergedComments,
  };
  writeMarkdownFile(filePath, record, renderReviewRecordBody(record));
  return {
    kind: 'written',
    reviews: reviews.length,
    comments: comments.length,
  };
}

interface FetchOrgReviewsParams {
  octokit: Octokit;
  orgConfig: GitHubOrgConfig;
  username: string;
  range: Range;
  outputDir: string;
  spinner: Ora;
  useCache?: boolean;
  verbose?: boolean;
}

async function fetchOrgReviews(
  params: FetchOrgReviewsParams,
): Promise<GitHubReviewFetchResult> {
  const { octokit, orgConfig, username, range, outputDir, spinner } = params;
  const org = orgConfig.name;
  const result: GitHubReviewFetchResult = {
    org,
    recordsWritten: 0,
    recordsUnchanged: 0,
    reviews: 0,
    comments: 0,
    problems: [],
  };

  const allRepos = orgConfig.repos.length === 1 && orgConfig.repos[0] === '*';
  const repoFilter = allRepos
    ? null
    : new Set(orgConfig.repos.map((r) => r.toLowerCase()));

  spinner.text = `Searching ${chalk.cyan(org)} for PRs reviewed by ${username}...`;
  // The search qualifier depends on the account kind, so an unavailable
  // lookup stops this org rather than guessing; a rate limit stops the run.
  let ownerQualifier: string;
  try {
    ownerQualifier = (await isUser(octokit, org))
      ? `user:${org}`
      : `org:${org}`;
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    const advice = isAccessError(error)
      ? ' Check that your token is valid and can access it.'
      : '';
    result.problems.push(
      `Could not check whether "${org}" is a GitHub user or org (${message}).${advice}`,
    );
    return result;
  }
  const found = new Map<string, SearchItem>();
  try {
    await searchReviewedPRs(
      octokit,
      `is:pr reviewed-by:${username} -author:${username} ${ownerQualifier}`,
      { from: formatDate(range.since), to: null },
      formatDate(new Date()),
      found,
      result.problems,
    );
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    const advice = isAccessError(error)
      ? ` Check that "${org}" is the exact GitHub org or user name and that your token can access it.`
      : '';
    result.problems.push(
      `Could not search for reviewed PRs (${message}).${advice}`,
    );
    return result;
  }

  let failed = 0;
  for (const item of found.values()) {
    const location = parseRepository(item);
    if (!location || !sameLogin(location.owner, org)) continue;
    if (repoFilter && !repoFilter.has(location.repo.toLowerCase())) continue;
    // Replies in threads on the user's own PR are not reviews given
    if (sameLogin(item.user?.login, username)) continue;

    const label = `${location.owner}/${location.repo}#${item.number}`;
    spinner.text = `Fetching reviews on ${chalk.cyan(label)}...`;
    try {
      const outcome = await fetchPRReviews({
        octokit,
        item,
        owner: location.owner,
        repo: location.repo,
        username,
        range,
        outputDir,
        useCache: params.useCache,
      });
      if (outcome.kind === 'unchanged') {
        result.recordsUnchanged++;
      } else if (outcome.kind === 'written') {
        result.recordsWritten++;
        result.reviews += outcome.reviews;
        result.comments += outcome.comments;
        if (params.verbose) {
          spinner.stop();
          console.log(
            `  ${chalk.green('✓')} ${label}: ${outcome.reviews} reviews, ${outcome.comments} inline comments`,
          );
          spinner.start();
        }
      }
    } catch (error) {
      if (error instanceof RateLimitError) throw error;
      failed++;
      spinner.stop();
      console.log(
        `  ${chalk.red('✗')} ${label}: ${chalk.red(error instanceof Error ? error.message : String(error))}`,
      );
      spinner.start();
    }
  }
  if (failed > 0) {
    result.problems.push(`Reviews could not be fetched for ${failed} PRs.`);
  }

  return result;
}

/**
 * Refuse to fetch reviews into a work log whose `pr-reviews/` already holds
 * records for a different GitHub user, e.g. after `github.username` changed.
 * Fetching would mix two people's review work, and tools that read the work
 * log would present the other person's reviews as this user's. Reads only.
 *
 * @throws CliError naming the other reviewers and how to proceed
 */
export async function assertReviewRecordsBelongTo(
  outputDir: string,
  username: string,
): Promise<void> {
  const { foreign, foreignReviewers } = splitReviewRecordsByReviewer(
    await readAllPRReviews(outputDir),
    username,
  );
  if (foreign.length === 0) return;
  const reviewsDir = join(outputDir, DIRECTORIES.PR_REVIEWS);
  throw new CliError(
    `${reviewsDir} holds ${foreign.length} review record(s) for another GitHub user (${foreignReviewers.join(', ')}), but github.username is ${username}. ` +
      "Fetching would mix two people's review work, so nothing was fetched. " +
      `Use a separate profile or output directory for ${username}, or remove ${reviewsDir} if those records are no longer needed.`,
  );
}

/**
 * Fetch the reviews and inline review comments the configured user gave
 * inside the fetch range, on any PR in the configured orgs and repos, and
 * store them as review records.
 *
 * Refuses, before any request, when the work log holds review records for a
 * different user. Requests run one at a time. A rate limit stops the run;
 * any other failure is reported per org, the run continues, and the exit
 * code is set to 1.
 */
export async function fetchGitHubReviews(
  options: FetchGitHubReviewsOptions,
): Promise<GitHubReviewFetchResult[]> {
  const { config, outputDir, verbose, useCache } = options;

  if (!config.github.orgs.length) {
    console.log(chalk.dim('No GitHub orgs configured, skipping PR reviews.'));
    return [];
  }

  const username = config.github.username;
  await assertReviewRecordsBelongTo(outputDir, username);

  const token = getGitHubToken(config);
  if (!token) {
    throw new Error(
      'GitHub token not found. Set GITHUB_TOKEN env var or add token to config.',
    );
  }

  const octokit = new Octokit({ auth: token });
  const range: Range = {
    since: parseDate(config.fetch.since),
    until: config.fetch.until ? parseDate(config.fetch.until) : new Date(),
  };

  console.log(
    `${chalk.cyan('GitHub')} - Fetching PR reviews given by ${chalk.green(username)}`,
  );
  console.log(
    `${chalk.gray('Date range:')} ${formatDate(range.since)} to ${formatDate(range.until)}\n`,
  );

  const spinner = ora();
  const results: GitHubReviewFetchResult[] = [];

  for (const orgConfig of config.github.orgs) {
    console.log(`${chalk.cyan('Org:')} ${orgConfig.name}`);
    spinner.start(`Searching ${orgConfig.name}...`);
    const result = await fetchOrgReviews({
      octokit,
      orgConfig,
      username,
      range,
      outputDir,
      spinner,
      useCache,
      verbose,
    });
    spinner.stop();
    results.push(result);

    const unchanged =
      result.recordsUnchanged > 0
        ? chalk.gray(` (${result.recordsUnchanged} unchanged)`)
        : '';
    console.log(
      `  ${chalk.green(result.recordsWritten)} reviewed PRs: ${result.reviews} reviews, ${result.comments} inline comments${unchanged}`,
    );
    if (result.problems.length > 0) {
      for (const problem of result.problems) {
        console.log(`  ${chalk.yellow('⚠')} ${chalk.yellow(problem)}`);
      }
      console.log(
        `  ${chalk.yellow('⚠')} ${chalk.yellow(`PR reviews for ${chalk.bold(orgConfig.name)} may be incomplete.`)}`,
      );
      process.exitCode = 1;
    }
    console.log();
  }

  return results;
}
