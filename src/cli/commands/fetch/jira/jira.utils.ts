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
    const errorText = await response.text();
    throw new Error(`JIRA API error ${response.status}: ${errorText}`);
  }

  return response.json() as Promise<T>;
}

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
  const maxResults = 50;

  const sinceStr = formatJqlDate(since);
  const untilStr = formatJqlDate(until);

  // JQL to find tickets assigned to current user within date range
  const jql = `project = "${project}" AND assignee = currentUser() AND created >= "${sinceStr}" AND created <= "${untilStr}" ORDER BY created DESC`;

  while (true) {
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

    const issues = response.issues || [];
    if (issues.length === 0) break;

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

    // Use token-based pagination
    if (response.isLast || !response.nextPageToken) break;
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
