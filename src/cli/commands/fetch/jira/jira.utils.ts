/**
 * JIRA fetching utilities
 *
 * Contains the core logic for fetching tickets from JIRA.
 */

import {
  getTicketFilePath,
  type JiraInstanceConfig,
  type JiraTicket,
  readAllTickets,
  writeMarkdownFile,
} from '@core/index';
import chalk from 'chalk';
import ora, { type Ora } from 'ora';

import { RateLimitError } from '../github/github.utils';
import type {
  FetchJiraOptions,
  JiraFetchResult,
  JiraSearchResponse,
} from './jira.types';

/**
 * Get JIRA token from instance config or environment
 */
function getJiraToken(instance: JiraInstanceConfig): string | undefined {
  return instance.token || process.env.JIRA_TOKEN;
}

/**
 * Get JIRA email from instance config or environment
 */
function getJiraEmail(instance: JiraInstanceConfig): string | undefined {
  return instance.email || process.env.JIRA_EMAIL;
}

/**
 * Parse date string to Date object
 */
function parseDate(dateStr: string): Date {
  return new Date(dateStr);
}

/**
 * Format date for JQL query (YYYY-MM-DD)
 */
function formatJqlDate(date: Date): string {
  const iso = date.toISOString();
  const dateStr = iso.split('T')[0];
  return dateStr ?? iso.slice(0, 10);
}

/**
 * A failed JIRA API response, keeping the HTTP status and `Retry-After` header
 */
class JiraApiError extends Error {
  override name = 'JiraApiError';

  constructor(
    message: string,
    readonly status: number,
    readonly retryAfter: string | null,
  ) {
    super(message);
  }
}

/**
 * Describe when a `Retry-After` value (seconds or an HTTP date) allows a retry
 */
function describeRetryAfter(retryAfter: string | null): string {
  if (!retryAfter) return '';
  const trimmed = retryAfter.trim();
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number.parseInt(trimmed, 10);
    const at = new Date(Date.now() + seconds * 1000);
    return ` Retry after ${seconds} seconds (${at.toLocaleString()}).`;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return ` Retry-After: ${trimmed}.`;
  return ` Retry after ${date.toLocaleString()}.`;
}

/**
 * Thrown when JIRA rate limits the credentials. Every project shares them, so
 * callers rethrow it instead of treating it as a per-project failure.
 */
class JiraRateLimitError extends RateLimitError {
  override name = 'JiraRateLimitError';

  constructor(readonly retryAfter: string | null) {
    super(
      `JIRA API rate limit exceeded.${describeRetryAfter(retryAfter)}\nTip: Use --cache flag to avoid re-fetching existing tickets.`,
    );
  }
}

interface JiraFetchParams {
  baseUrl: string;
  path: string;
  email: string;
  token: string;
  options?: RequestInit;
}

/**
 * Make authenticated request to JIRA API
 */
async function jiraFetch<T>(params: JiraFetchParams): Promise<T> {
  const { baseUrl, path, email, token, options = {} } = params;
  const auth = Buffer.from(`${email}:${token}`).toString('base64');

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const retryAfter = response.headers.get('retry-after');
    if (response.status === 429) throw new JiraRateLimitError(retryAfter);
    const errorText = await response.text();
    throw new JiraApiError(
      `JIRA API error ${response.status}: ${errorText}`,
      response.status,
      retryAfter,
    );
  }

  return response.json() as Promise<T>;
}

/**
 * Upper bound on pages per project. It only guards against a server that keeps
 * returning fresh page tokens without ever reaching the end, so it sits far
 * above any real history (pages can be small or even empty).
 */
export const MAX_PAGES = 20_000;

interface FetchProjectTicketsParams {
  baseUrl: string;
  email: string;
  token: string;
  instanceName: string;
  project: string;
  since: Date;
  until: Date;
  outputDir: string;
  spinner: Ora;
  cachedTickets: Set<string>;
  verbose?: boolean;
}

/**
 * Fetch tickets for a single project
 */
async function fetchProjectTickets(
  params: FetchProjectTicketsParams,
): Promise<{ written: number; skipped: number; cached: number }> {
  const {
    baseUrl,
    email,
    token,
    instanceName,
    project,
    since,
    until,
    outputDir,
    spinner,
    cachedTickets,
    verbose,
  } = params;

  let written = 0;
  let skipped = 0;
  let cached = 0;
  let nextPageToken: string | undefined;
  const seenPageTokens = new Set<string>();
  const maxResults = 50;

  const sinceStr = formatJqlDate(since);
  const untilStr = formatJqlDate(until);

  // JQL to find tickets assigned to current user within date range
  const jql = `project = "${project}" AND assignee = currentUser() AND created >= "${sinceStr}" AND created <= "${untilStr}" ORDER BY created DESC`;

  for (let page = 1; ; page++) {
    if (page > MAX_PAGES) {
      throw new Error(
        `JIRA pagination error: no last page after ${MAX_PAGES} pages, so results are incomplete`,
      );
    }
    spinner.text = `Fetching ${chalk.gray(instanceName)}/${chalk.cyan(project)}...`;

    // Use POST to /rest/api/3/search/jql (the new endpoint)
    const requestBody: {
      jql: string;
      maxResults: number;
      fields: string[];
      nextPageToken?: string;
    } = {
      jql,
      maxResults,
      fields: [
        'summary',
        'issuetype',
        'status',
        'created',
        'resolutiondate',
        'customfield_10016',
        'description',
      ],
    };

    if (nextPageToken) {
      requestBody.nextPageToken = nextPageToken;
    }

    const response = await jiraFetch<JiraSearchResponse>({
      baseUrl,
      path: '/rest/api/3/search/jql',
      email,
      token,
      options: {
        method: 'POST',
        body: JSON.stringify(requestBody),
      },
    });

    // A page can be empty while more pages follow, so only the pagination
    // fields below decide when to stop.
    const issues = response.issues || [];

    for (const issue of issues) {
      const fields = issue.fields;
      if (!fields) {
        skipped++;
        continue;
      }

      // Skip if already cached
      const cacheKey = `${instanceName}/${issue.key}`;
      if (cachedTickets.has(cacheKey)) {
        cached++;
        continue;
      }

      spinner.text = `${chalk.gray(instanceName)}/${chalk.cyan(project)} - Fetching ${issue.key}...`;

      // Extract story points (field ID varies by JIRA instance)
      let storyPoints: number | null = null;
      const storyPointsField = fields.customfield_10016;
      if (typeof storyPointsField === 'number') {
        storyPoints = storyPointsField;
      }

      const ticketData: JiraTicket = {
        key: issue.key,
        summary: fields.summary ?? '',
        project,
        org: instanceName,
        issueType: fields.issuetype?.name ?? 'unknown',
        status: fields.status?.name ?? 'unknown',
        storyPoints,
        url: `${baseUrl}/browse/${issue.key}`,
        createdAt: fields.created ?? new Date().toISOString(),
        resolvedAt: fields.resolutiondate ?? null,
        linkedPRs: [],
      };

      const filePath = getTicketFilePath(
        outputDir,
        instanceName,
        project,
        issue.key,
      );

      // Get description as body
      let body = '';
      if (fields.description) {
        // Handle Atlassian Document Format (ADF)
        if (
          typeof fields.description === 'object' &&
          'content' in fields.description
        ) {
          body = extractTextFromAdf(fields.description);
        } else if (typeof fields.description === 'string') {
          body = fields.description;
        }
      }

      writeMarkdownFile(filePath, ticketData, body);
      written++;

      if (verbose) {
        spinner.stop();
        console.log(`  ${chalk.green('✓')} ${issue.key}: ${fields.summary}`);
        spinner.start();
      }
    }

    // Use token-based pagination. A token already sent would fetch the same
    // page again forever, and the pages after it are unreachable, so the
    // project's results are incomplete.
    if (response.isLast || !response.nextPageToken) break;
    if (seenPageTokens.has(response.nextPageToken)) {
      throw new Error(
        `JIRA pagination error: the server repeated page token "${response.nextPageToken}" before the last page, so results are incomplete`,
      );
    }
    seenPageTokens.add(response.nextPageToken);
    nextPageToken = response.nextPageToken;
  }

  return { written, skipped, cached };
}

/**
 * Extract plain text from Atlassian Document Format
 */
function extractTextFromAdf(adf: unknown): string {
  if (!adf || typeof adf !== 'object') return '';

  const doc = adf as { content?: unknown[] };
  if (!doc.content || !Array.isArray(doc.content)) return '';

  const extractFromNode = (node: unknown): string => {
    if (!node || typeof node !== 'object') return '';

    const n = node as { type?: string; text?: string; content?: unknown[] };

    if (n.type === 'text' && n.text) {
      return n.text;
    }

    if (n.content && Array.isArray(n.content)) {
      return n.content.map(extractFromNode).join('');
    }

    return '';
  };

  return doc.content
    .map((node) => {
      const text = extractFromNode(node);
      const n = node as { type?: string };
      // Add newlines after paragraphs and headings
      if (n.type === 'paragraph' || n.type?.startsWith('heading')) {
        return `${text}\n\n`;
      }
      return text;
    })
    .join('')
    .trim();
}

interface FetchInstanceTicketsParams {
  instanceConfig: JiraInstanceConfig;
  since: Date;
  until: Date;
  outputDir: string;
  spinner: Ora;
  cachedTickets: Set<string>;
  verbose?: boolean;
}

/**
 * Fetch tickets for a JIRA instance
 */
async function fetchInstanceTickets(
  params: FetchInstanceTicketsParams,
): Promise<JiraFetchResult[]> {
  const {
    instanceConfig,
    since,
    until,
    outputDir,
    spinner,
    cachedTickets,
    verbose,
  } = params;

  const results: JiraFetchResult[] = [];
  const instanceName = instanceConfig.name;

  const token = getJiraToken(instanceConfig);
  const email = getJiraEmail(instanceConfig);

  if (!token) {
    throw new Error(
      `JIRA token not found for instance "${instanceName}". Set JIRA_TOKEN env var or add token to config.`,
    );
  }

  if (!email) {
    throw new Error(
      `JIRA email not found for instance "${instanceName}". Set JIRA_EMAIL env var or add email to config.`,
    );
  }

  for (const project of instanceConfig.projects) {
    try {
      spinner.text = `Fetching ${chalk.gray(instanceName)}/${chalk.cyan(project)}...`;

      const { written, skipped, cached } = await fetchProjectTickets({
        baseUrl: instanceConfig.url,
        email,
        token,
        instanceName,
        project,
        since,
        until,
        outputDir,
        spinner,
        cachedTickets,
        verbose,
      });

      results.push({
        instance: instanceName,
        project,
        ticketsWritten: written,
        ticketsSkipped: skipped,
        ticketsCached: cached,
      });

      if (written > 0 || cached > 0) {
        spinner.stop();
        const cacheInfo = cached > 0 ? chalk.gray(` (${cached} cached)`) : '';
        console.log(
          `  ${chalk.green('✓')} ${chalk.gray(instanceName)}/${chalk.cyan(project)}: ${chalk.green(written)} tickets${cacheInfo}`,
        );
        spinner.start();
      }
    } catch (error) {
      // The next project would hit the same rate limit, so stop the fetch
      if (error instanceof RateLimitError) throw error;
      // Keep fetching the other projects, but fail the run so a missing
      // project is never mistaken for a complete work log.
      process.exitCode = 1;
      spinner.stop();
      console.log(
        `  ${chalk.red('✗')} ${chalk.gray(instanceName)}/${chalk.cyan(project)}: ${chalk.red(error instanceof Error ? error.message : String(error))}`,
      );
      spinner.start();
    }
  }

  return results;
}

/**
 * Build a set of cached ticket keys from existing work log
 */
async function buildCacheSet(outputDir: string): Promise<Set<string>> {
  const cached = new Set<string>();
  const tickets = await readAllTickets(outputDir);

  for (const ticket of tickets) {
    const key = `${ticket.frontmatter.org}/${ticket.frontmatter.key}`;
    cached.add(key);
  }

  return cached;
}

/**
 * Fetch all JIRA tickets based on config
 *
 * @param options - Fetch options including config, output directory, and flags
 * @returns Array of fetch results per project
 */
export async function fetchJiraTickets(
  options: FetchJiraOptions,
): Promise<JiraFetchResult[]> {
  const { config, outputDir, verbose, useCache } = options;

  if (!config.jira?.instances.length) {
    console.log(chalk.gray('No JIRA instances configured'));
    return [];
  }

  const since = parseDate(config.fetch.since);
  const until = config.fetch.until ? parseDate(config.fetch.until) : new Date();

  const sinceStr = since.toISOString().split('T')[0] ?? '';
  const untilStr = until.toISOString().split('T')[0] ?? '';

  console.log(`${chalk.cyan('JIRA')} - Fetching tickets assigned to you`);
  console.log(`${chalk.gray('Date range:')} ${sinceStr} to ${untilStr}`);

  // Build cache if enabled
  let cachedTickets = new Set<string>();
  if (useCache) {
    const spinner = ora('Loading cached tickets...').start();
    cachedTickets = await buildCacheSet(outputDir);
    spinner.succeed(`Loaded ${chalk.cyan(cachedTickets.size)} cached tickets`);
  }
  console.log();

  const spinner = ora();
  const allResults: JiraFetchResult[] = [];

  for (const instanceConfig of config.jira.instances) {
    console.log(`${chalk.cyan('Instance:')} ${instanceConfig.name}`);
    spinner.start(`Fetching from ${instanceConfig.name}...`);

    const results = await fetchInstanceTickets({
      instanceConfig,
      since,
      until,
      outputDir,
      spinner,
      cachedTickets,
      verbose,
    });
    allResults.push(...results);

    spinner.stop();
  }

  return allResults;
}
