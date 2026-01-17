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
 * Read all PR files from the work-log
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
      }
    } catch {
      // Skip files that can't be parsed
    }
  }

  return results;
}

/**
 * Read all JIRA ticket files from the work-log
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
      }
    } catch {
      // Skip files that can't be parsed
    }
  }

  return results;
}

/**
 * Read a single PR file by path
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
 * Read a single ticket file by path
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
