import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';
import { type PullRequestFile, PullRequestSchema } from 'src/types/pr';
import { type JiraTicketFile, JiraTicketSchema } from 'src/types/ticket';
import { DIRECTORIES } from './paths';

/**
 * Read and parse a markdown file with frontmatter
 */
function readMarkdownFile(filePath: string): {
  data: unknown;
  content: string;
} {
  const fileContent = readFileSync(filePath, 'utf-8');
  const { data, content } = matter(fileContent);
  return { data, content };
}

/**
 * Recursively find all markdown files in a directory
 */
function findMarkdownFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }

  const files: string[] = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath));
    } else if (entry.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Read all PR markdown files from the work-log directory.
 *
 * Recursively scans the pull-requests directory and parses each markdown file.
 * Invalid files are logged with warnings but don't stop processing.
 *
 * @param outputDir - Base work-log output directory
 * @returns Array of parsed PR files with frontmatter, body, and file path
 *
 * @example
 * ```ts
 * const prs = await readAllPRs('/path/to/work-log');
 * for (const pr of prs) {
 *   console.log(pr.frontmatter.title, pr.frontmatter.prNumber);
 * }
 * ```
 */
export async function readAllPRs(
  outputDir: string,
): Promise<PullRequestFile[]> {
  const prDir = join(outputDir, DIRECTORIES.PULL_REQUESTS);
  const files = findMarkdownFiles(prDir);
  const results: PullRequestFile[] = [];

  for (const filePath of files) {
    try {
      const { data, content } = readMarkdownFile(filePath);
      const parsed = PullRequestSchema.safeParse(data);

      if (parsed.success) {
        results.push({
          frontmatter: parsed.data,
          body: content.trim(),
          filePath,
        });
      } else {
        console.warn(
          `Warning: Invalid frontmatter in ${filePath}: ${parsed.error.issues[0]?.message ?? 'unknown error'}`,
        );
      }
    } catch (error) {
      console.warn(
        `Warning: Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return results;
}

/**
 * Read all JIRA ticket markdown files from the work-log directory.
 *
 * Recursively scans the jira directory and parses each markdown file.
 * Invalid files are logged with warnings but don't stop processing.
 *
 * @param outputDir - Base work-log output directory
 * @returns Array of parsed ticket files with frontmatter, body, and file path
 *
 * @example
 * ```ts
 * const tickets = await readAllTickets('/path/to/work-log');
 * for (const ticket of tickets) {
 *   console.log(ticket.frontmatter.key, ticket.frontmatter.summary);
 * }
 * ```
 */
export async function readAllTickets(
  outputDir: string,
): Promise<JiraTicketFile[]> {
  const jiraDir = join(outputDir, DIRECTORIES.JIRA);
  const files = findMarkdownFiles(jiraDir);
  const results: JiraTicketFile[] = [];

  for (const filePath of files) {
    try {
      const { data, content } = readMarkdownFile(filePath);
      const parsed = JiraTicketSchema.safeParse(data);

      if (parsed.success) {
        results.push({
          frontmatter: parsed.data,
          body: content.trim(),
          filePath,
        });
      } else {
        console.warn(
          `Warning: Invalid frontmatter in ${filePath}: ${parsed.error.issues[0]?.message ?? 'unknown error'}`,
        );
      }
    } catch (error) {
      console.warn(
        `Warning: Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return results;
}

/**
 * Read a single PR markdown file by its path.
 *
 * @param filePath - Absolute path to the PR markdown file
 * @returns Parsed PR file with frontmatter and body, or null if invalid/not found
 *
 * @example
 * ```ts
 * const pr = await readPR('/path/to/work-log/pull-requests/org/repo/2024-01-15_123.md');
 * if (pr) {
 *   console.log(pr.frontmatter.title);
 * }
 * ```
 */
export async function readPR(
  filePath: string,
): Promise<PullRequestFile | null> {
  try {
    const { data, content } = readMarkdownFile(filePath);
    const parsed = PullRequestSchema.safeParse(data);

    if (parsed.success) {
      return {
        frontmatter: parsed.data,
        body: content.trim(),
        filePath,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Read a single JIRA ticket markdown file by its path.
 *
 * @param filePath - Absolute path to the ticket markdown file
 * @returns Parsed ticket file with frontmatter and body, or null if invalid/not found
 *
 * @example
 * ```ts
 * const ticket = await readTicket('/path/to/work-log/jira/instance/PROJ/PROJ-123.md');
 * if (ticket) {
 *   console.log(ticket.frontmatter.summary);
 * }
 * ```
 */
export async function readTicket(
  filePath: string,
): Promise<JiraTicketFile | null> {
  try {
    const { data, content } = readMarkdownFile(filePath);
    const parsed = JiraTicketSchema.safeParse(data);

    if (parsed.success) {
      return {
        frontmatter: parsed.data,
        body: content.trim(),
        filePath,
      };
    }
    return null;
  } catch {
    return null;
  }
}
