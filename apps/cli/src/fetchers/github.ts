import { Octokit } from '@octokit/rest';
import {
  type Config,
  type GitHubOrgConfig,
  getPRFilePath,
  type PullRequest,
  readAllPRs,
  writeMarkdownFile,
} from '@work-chronicler/core';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';

/**
 * Check if an error is a GitHub rate limit error and handle it
 */
function handleRateLimitError(error: unknown): never {
  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    error.status === 403
  ) {
    const reqError = error as {
      message?: string;
      response?: { headers?: Record<string, string> };
    };
    const rateLimitRemaining =
      reqError.response?.headers?.['x-ratelimit-remaining'];
    const rateLimitReset = reqError.response?.headers?.['x-ratelimit-reset'];

    if (
      rateLimitRemaining === '0' ||
      reqError.message?.includes('rate limit')
    ) {
      let message = 'GitHub API rate limit exceeded.';
      if (rateLimitReset) {
        const resetDate = new Date(Number.parseInt(rateLimitReset, 10) * 1000);
        message += ` Rate limit resets at: ${resetDate.toLocaleString()}`;
      }
      message += '\nTip: Use --cache flag to avoid re-fetching existing PRs.';
      throw new Error(message);
    }
  }
  throw error;
}

interface FetchGitHubOptions {
  config: Config;
  outputDir: string;
  verbose?: boolean;
  useCache?: boolean;
}

interface FetchResult {
  org: string;
  repo: string;
  prsWritten: number;
  prsSkipped: number;
  prsCached: number;
}

interface CacheInfo {
  cachedPRs: Set<string>;
  oldestCachedDate: Date | null;
  newestCachedDate: Date | null;
}

/**
 * Get GitHub token from config or environment
 */
function getGitHubToken(config: Config): string | undefined {
  return config.github.token || process.env.GITHUB_TOKEN;
}

/**
 * Parse date string to Date object
 */
function parseDate(dateStr: string): Date {
  return new Date(dateStr);
}

/**
 * Format date for display (YYYY-MM-DD)
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

/**
 * Map GitHub PR state to our state
 */
function mapPRState(
  state: string,
  mergedAt: string | null,
): 'open' | 'closed' | 'merged' {
  if (mergedAt) return 'merged';
  if (state === 'open') return 'open';
  return 'closed';
}

/**
 * Check if the given name is a user (not an organization)
 */
async function isUser(octokit: Octokit, name: string): Promise<boolean> {
  try {
    const { data } = await octokit.users.getByUsername({ username: name });
    return data.type === 'User';
  } catch {
    return false;
  }
}

/**
 * List all repositories for an organization or user
 */
async function listOrgRepos(
  octokit: Octokit,
  org: string,
  spinner: Ora,
): Promise<string[]> {
  const repos: string[] = [];
  let page = 1;

  spinner.text = `Listing repositories for ${chalk.cyan(org)}...`;

  const userAccount = await isUser(octokit, org);

  while (true) {
    const response = userAccount
      ? await octokit.repos.listForUser({
          username: org,
          type: 'owner',
          per_page: 100,
          page,
        })
      : await octokit.repos.listForOrg({
          org,
          type: 'all',
          per_page: 100,
          page,
        });

    if (response.data.length === 0) break;

    for (const repo of response.data) {
      repos.push(repo.name);
    }

    spinner.text = `Listing repositories for ${chalk.cyan(org)}... (${repos.length} found)`;

    if (response.data.length < 100) break;
    page++;
  }

  return repos;
}

/**
 * Fetch PRs for a single repository
 */
async function fetchRepoPRs(
  octokit: Octokit,
  org: string,
  repo: string,
  username: string,
  since: Date,
  until: Date,
  outputDir: string,
  spinner: Ora,
  cacheInfo: CacheInfo,
  verbose?: boolean,
): Promise<{ written: number; skipped: number; cached: number }> {
  let written = 0;
  const skipped = 0;
  let cached = 0;
  let page = 1;

  // Determine if we can skip this repo entirely based on cache
  // If we have cached PRs and the requested range is within the cached range, skip
  if (
    cacheInfo.cachedPRs.size > 0 &&
    cacheInfo.oldestCachedDate &&
    cacheInfo.newestCachedDate &&
    since >= cacheInfo.oldestCachedDate &&
    until <= cacheInfo.newestCachedDate
  ) {
    // Count cached PRs for this repo
    for (const key of cacheInfo.cachedPRs) {
      if (key.startsWith(`${org}/${repo}/`)) {
        cached++;
      }
    }
    return { written: 0, skipped: 0, cached };
  }

  while (true) {
    let response: Awaited<ReturnType<typeof octokit.pulls.list>>;
    try {
      response = await octokit.pulls.list({
        owner: org,
        repo,
        state: 'all',
        sort: 'created',
        direction: 'desc',
        per_page: 100,
        page,
      });
    } catch (error) {
      handleRateLimitError(error);
    }

    if (response.data.length === 0) break;

    let foundOlderThanRange = false;

    for (const pr of response.data) {
      const createdAt = new Date(pr.created_at);

      // Skip if PR was created after our range
      if (createdAt > until) {
        continue;
      }

      // Stop if we've gone past our date range
      if (createdAt < since) {
        foundOlderThanRange = true;
        break;
      }

      // Skip if not by our user
      if (pr.user?.login.toLowerCase() !== username.toLowerCase()) {
        continue;
      }

      // Skip if already cached
      const cacheKey = `${org}/${repo}/${pr.number}`;
      if (cacheInfo.cachedPRs.has(cacheKey)) {
        cached++;
        continue;
      }

      spinner.text = `${chalk.gray(org)}/${chalk.cyan(repo)} - Fetching PR #${pr.number}...`;

      // Fetch additional PR details (additions, deletions, etc.)
      let prDetails: Awaited<ReturnType<typeof octokit.pulls.get>>;
      try {
        prDetails = await octokit.pulls.get({
          owner: org,
          repo,
          pull_number: pr.number,
        });
      } catch (error) {
        handleRateLimitError(error);
      }

      const prData: PullRequest = {
        title: pr.title,
        prNumber: pr.number,
        repository: repo,
        org,
        author: pr.user?.login ?? 'unknown',
        state: mapPRState(pr.state, pr.merged_at),
        createdAt: pr.created_at,
        mergedAt: pr.merged_at,
        closedAt: pr.closed_at,
        url: pr.html_url,
        additions: prDetails.data.additions,
        deletions: prDetails.data.deletions,
        changedFiles: prDetails.data.changed_files,
        jiraTickets: [],
        labels: pr.labels.map((l) => l.name),
      };

      const filePath = getPRFilePath(
        outputDir,
        org,
        repo,
        createdAt,
        pr.number,
      );
      const body = pr.body ?? '';

      writeMarkdownFile(filePath, prData, body);
      written++;

      if (verbose) {
        spinner.stop();
        console.log(`  ${chalk.green('✓')} PR #${pr.number}: ${pr.title}`);
        spinner.start();
      }
    }

    // Stop pagination if we found PRs older than our range
    if (foundOlderThanRange) break;
    if (response.data.length < 100) break;

    page++;
  }

  return { written, skipped, cached };
}

/**
 * Fetch PRs for an organization
 */
async function fetchOrgPRs(
  octokit: Octokit,
  orgConfig: GitHubOrgConfig,
  username: string,
  since: Date,
  until: Date,
  outputDir: string,
  spinner: Ora,
  cacheInfo: CacheInfo,
  verbose?: boolean,
): Promise<FetchResult[]> {
  const results: FetchResult[] = [];
  const org = orgConfig.name;

  // Get list of repos to fetch
  let repos: string[];
  if (orgConfig.repos.length === 1 && orgConfig.repos[0] === '*') {
    repos = await listOrgRepos(octokit, org, spinner);
    spinner.stop();
    console.log(
      `  ${chalk.gray('Found')} ${chalk.cyan(repos.length)} ${chalk.gray('repositories')}`,
    );
    spinner.start();
  } else {
    repos = orgConfig.repos;
  }

  for (const repo of repos) {
    try {
      spinner.text = `Fetching ${chalk.gray(org)}/${chalk.cyan(repo)}...`;

      const { written, skipped, cached } = await fetchRepoPRs(
        octokit,
        org,
        repo,
        username,
        since,
        until,
        outputDir,
        spinner,
        cacheInfo,
        verbose,
      );

      results.push({
        org,
        repo,
        prsWritten: written,
        prsSkipped: skipped,
        prsCached: cached,
      });

      if (written > 0 || cached > 0) {
        spinner.stop();
        if (written > 0) {
          const cacheInfoStr =
            cached > 0 ? chalk.gray(` (${cached} cached)`) : '';
          console.log(
            `  ${chalk.green('✓')} ${chalk.gray(org)}/${chalk.cyan(repo)}: ${chalk.green(written)} new PRs${cacheInfoStr}`,
          );
        } else {
          console.log(
            `  ${chalk.gray('○')} ${chalk.gray(org)}/${chalk.cyan(repo)}: ${chalk.gray(`${cached} cached (up to date)`)}`,
          );
        }
        spinner.start();
      }
    } catch (error) {
      spinner.stop();
      if (error instanceof Error && 'status' in error && error.status === 404) {
        console.log(
          `  ${chalk.yellow('⚠')} ${chalk.gray(org)}/${chalk.cyan(repo)}: ${chalk.yellow('not found (skipped)')}`,
        );
      } else {
        console.log(
          `  ${chalk.red('✗')} ${chalk.gray(org)}/${chalk.cyan(repo)}: ${chalk.red(error instanceof Error ? error.message : String(error))}`,
        );
      }
      spinner.start();
    }
  }

  return results;
}

/**
 * Build cache info from existing work log
 */
async function buildCacheInfo(outputDir: string): Promise<CacheInfo> {
  const cachedPRs = new Set<string>();
  let oldestCachedDate: Date | null = null;
  let newestCachedDate: Date | null = null;

  const prs = await readAllPRs(outputDir);

  for (const pr of prs) {
    const key = `${pr.frontmatter.org}/${pr.frontmatter.repository}/${pr.frontmatter.prNumber}`;
    cachedPRs.add(key);

    const createdAt = new Date(pr.frontmatter.createdAt);
    if (!oldestCachedDate || createdAt < oldestCachedDate) {
      oldestCachedDate = createdAt;
    }
    if (!newestCachedDate || createdAt > newestCachedDate) {
      newestCachedDate = createdAt;
    }
  }

  return { cachedPRs, oldestCachedDate, newestCachedDate };
}

/**
 * Fetch all PRs from GitHub based on config
 */
export async function fetchGitHubPRs(
  options: FetchGitHubOptions,
): Promise<FetchResult[]> {
  const { config, outputDir, verbose, useCache } = options;
  const token = getGitHubToken(config);

  if (!token) {
    throw new Error(
      'GitHub token not found. Set GITHUB_TOKEN env var or add token to config.',
    );
  }

  const octokit = new Octokit({ auth: token });
  const username = config.github.username;

  const since = parseDate(config.fetch.since);
  const until = config.fetch.until ? parseDate(config.fetch.until) : new Date();

  const sinceStr = formatDate(since);
  const untilStr = formatDate(until);

  console.log(
    `${chalk.cyan('GitHub')} - Fetching PRs by ${chalk.green(username)}`,
  );
  console.log(`${chalk.gray('Date range:')} ${sinceStr} to ${untilStr}`);

  // Build cache if enabled
  let cacheInfo: CacheInfo = {
    cachedPRs: new Set(),
    oldestCachedDate: null,
    newestCachedDate: null,
  };
  if (useCache) {
    const spinner = ora('Loading cached PRs...').start();
    cacheInfo = await buildCacheInfo(outputDir);
    if (cacheInfo.oldestCachedDate && cacheInfo.newestCachedDate) {
      const oldestStr = formatDate(cacheInfo.oldestCachedDate);
      const newestStr = formatDate(cacheInfo.newestCachedDate);
      spinner.succeed(
        `Loaded ${chalk.cyan(cacheInfo.cachedPRs.size)} cached PRs (${oldestStr} to ${newestStr})`,
      );
    } else {
      spinner.succeed(
        `Loaded ${chalk.cyan(cacheInfo.cachedPRs.size)} cached PRs`,
      );
    }
  }
  console.log();

  const spinner = ora();
  const allResults: FetchResult[] = [];

  for (const orgConfig of config.github.orgs) {
    console.log(`${chalk.cyan('Org:')} ${orgConfig.name}`);
    spinner.start(`Fetching from ${orgConfig.name}...`);

    const results = await fetchOrgPRs(
      octokit,
      orgConfig,
      username,
      since,
      until,
      outputDir,
      spinner,
      cacheInfo,
      verbose,
    );
    allResults.push(...results);

    spinner.stop();

    // Show org summary
    const orgWritten = results.reduce((sum, r) => sum + r.prsWritten, 0);
    const orgCached = results.reduce((sum, r) => sum + r.prsCached, 0);
    if (orgWritten === 0 && orgCached === 0) {
      console.log(`  ${chalk.gray('No PRs found for this org')}`);
    } else if (orgWritten === 0 && orgCached > 0) {
      console.log(
        `  ${chalk.gray(`Summary: ${orgCached} PRs already cached, nothing new to fetch`)}`,
      );
    }
    console.log();
  }

  return allResults;
}
