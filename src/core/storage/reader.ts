import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  type Stats,
  statSync,
} from 'node:fs';
import { join } from 'node:path';

import { parseImportedRecordFile } from '@core/import/record-file';
import { MAX_STORED_BYTES } from '@core/import/staging';
import {
  getImportedRecordIdentity,
  IMPORT_SOURCES,
  type ImportedRecordFile,
} from '@wc-types/imported-record';
import { type PullRequestFile, PullRequestSchema } from '@wc-types/pr';
import {
  type PRReviewRecordFile,
  PRReviewRecordSchema,
} from '@wc-types/pr-review';
import { type JiraTicketFile, JiraTicketSchema } from '@wc-types/ticket';
import matter from 'gray-matter';

import {
  DIRECTORIES,
  getImportedRecordSegments,
  IMPORTED_RECORD_DIRECTORIES,
} from './paths';

/**
 * Filesystem reads the work-log readers use, so tests can inject failures
 * without relying on permissions.
 */
export interface ReaderFs {
  readdir(path: string): string[];
  stat(path: string): Stats;
  lstat(path: string): Stats;
  readFile(path: string): Buffer;
}

export const nodeReaderFs: ReaderFs = {
  readdir: (path) => readdirSync(path),
  stat: (path) => statSync(path),
  lstat: (path) => lstatSync(path),
  readFile: (path) => readFileSync(path),
};

/**
 * How a reader treats files it cannot use.
 */
export interface ReadOptions {
  fs?: ReaderFs;
  /**
   * Throw when a directory or file cannot be read (any filesystem error
   * other than a missing directory), instead of warning and skipping it.
   * Files that are read but are not valid records are still skipped with a
   * warning. Use it when a missing record would be mistaken for an absent
   * one, as when `filter` replaces the subset.
   */
  strict?: boolean;
}

/** A filesystem error (it has an error code), as opposed to a parse error */
function isFilesystemError(error: unknown): boolean {
  return typeof (error as NodeJS.ErrnoException | undefined)?.code === 'string';
}

/**
 * Read and parse a markdown file with frontmatter
 */
function readMarkdownFile(
  filePath: string,
  fs: ReaderFs = nodeReaderFs,
): {
  data: unknown;
  content: string;
} {
  const fileContent = fs.readFile(filePath).toString('utf-8');
  const { data, content } = matter(fileContent);
  return { data, content };
}

/**
 * Strip only the separators the writer puts around the body: it writes
 * `---\n\n<body>\n`, and gray-matter's content keeps one newline before and
 * after the body. Anything else, such as leading blank lines or a first
 * line's indentation (an indented code block), belongs to the body.
 */
function normalizeBody(content: string): string {
  return content.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
}

/**
 * Recursively find all markdown files in a directory. A missing directory
 * has none; any other error reading the tree is thrown.
 */
function findMarkdownFiles(dir: string, fs: ReaderFs = nodeReaderFs): string[] {
  let entries: string[];
  try {
    entries = fs.readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = fs.stat(fullPath);

    if (stat.isDirectory()) {
      files.push(...findMarkdownFiles(fullPath, fs));
    } else if (entry.endsWith('.md')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Read every markdown record under a directory that matches a schema.
 */
function readAllMarkdownRecords<T>(
  dir: string,
  schema: {
    safeParse: (
      data: unknown,
    ) =>
      | { success: true; data: T }
      | { success: false; error: { issues: { message: string }[] } };
  },
  options: ReadOptions,
): { frontmatter: T; body: string; filePath: string }[] {
  const fs = options.fs ?? nodeReaderFs;
  const results: { frontmatter: T; body: string; filePath: string }[] = [];

  for (const filePath of findMarkdownFiles(dir, fs)) {
    try {
      const { data, content } = readMarkdownFile(filePath, fs);
      const parsed = schema.safeParse(data);

      if (parsed.success) {
        results.push({
          frontmatter: parsed.data,
          body: normalizeBody(content),
          filePath,
        });
      } else {
        console.warn(
          `Warning: Invalid frontmatter in ${filePath}: ${parsed.error.issues[0]?.message ?? 'unknown error'}`,
        );
      }
    } catch (error) {
      if (options.strict && isFilesystemError(error)) throw error;
      console.warn(
        `Warning: Failed to parse ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return results;
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
  options: ReadOptions = {},
): Promise<PullRequestFile[]> {
  return readAllMarkdownRecords(
    join(outputDir, DIRECTORIES.PULL_REQUESTS),
    PullRequestSchema,
    options,
  );
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
  options: ReadOptions = {},
): Promise<JiraTicketFile[]> {
  return readAllMarkdownRecords(
    join(outputDir, DIRECTORIES.JIRA),
    JiraTicketSchema,
    options,
  );
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
        body: normalizeBody(content),
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
        body: normalizeBody(content),
        filePath,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Read every review record (reviews the user gave on others' PRs) from the
 * work-log's `pr-reviews/` directory. Invalid files are logged with warnings
 * but don't stop processing.
 *
 * Review records are never returned by `readAllPRs`: they describe review
 * work, not authored PRs.
 *
 * @param outputDir - Base work-log output directory
 * @returns Parsed review records with frontmatter, body, and file path
 */
export async function readAllPRReviews(
  outputDir: string,
  options: ReadOptions = {},
): Promise<PRReviewRecordFile[]> {
  return readAllMarkdownRecords(
    join(outputDir, DIRECTORIES.PR_REVIEWS),
    PRReviewRecordSchema,
    options,
  );
}

/**
 * Read a single review record by its path.
 *
 * @param filePath - Absolute path to the review record file
 * @returns Parsed review record, or null if missing or invalid
 */
export async function readPRReview(
  filePath: string,
): Promise<PRReviewRecordFile | null> {
  if (!existsSync(filePath)) return null;
  try {
    const { data, content } = readMarkdownFile(filePath);
    const parsed = PRReviewRecordSchema.safeParse(data);
    if (!parsed.success) return null;
    return { frontmatter: parsed.data, body: normalizeBody(content), filePath };
  } catch {
    return null;
  }
}

/** An imported record file that could not be read, and why */
export interface SkippedImportedRecord {
  filePath: string;
  /** Fixed text; never contains anything from the file */
  reason: string;
  /**
   * The directory or file could not be read (a filesystem error other than
   * a missing directory), as opposed to a file that was read and rejected.
   * Records may be missing behind it.
   */
  unreadable: boolean;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

/**
 * Read every imported record in a work log, and report the files that could
 * not be read.
 *
 * Only the layout `import` writes is read:
 * `<type directory>/<source>/<hash>.md`, regular files only, for known types
 * and sources. Everything else in the work log root, such as `.import-lock`
 * and `.import-transaction/`, is never looked at. A file is skipped when it is
 * not a valid record or is not stored where its identity puts it (a copied or
 * renamed file), so each identity is read at most once.
 *
 * @param outputDir - Base work-log directory (an IC work log, a report's, or
 *   a `filtered/` subset)
 */
export function scanImportedRecords(
  outputDir: string,
  options: { fs?: ReaderFs } = {},
): {
  records: ImportedRecordFile[];
  skipped: SkippedImportedRecord[];
} {
  const fs = options.fs ?? nodeReaderFs;
  const records: ImportedRecordFile[] = [];
  const skipped: SkippedImportedRecord[] = [];

  for (const typeDir of new Set(Object.values(IMPORTED_RECORD_DIRECTORIES))) {
    for (const source of IMPORT_SOURCES) {
      const dir = join(outputDir, typeDir, source);
      let names: string[];
      try {
        names = fs.readdir(dir).sort();
      } catch (error) {
        if (!isMissing(error)) {
          skipped.push({
            filePath: dir,
            reason: 'directory could not be read',
            unreadable: true,
          });
        }
        continue;
      }

      for (const name of names) {
        if (!name.endsWith('.md')) continue;
        const filePath = join(dir, name);
        try {
          const stat = fs.lstat(filePath);
          if (!stat.isFile()) {
            skipped.push({
              filePath,
              reason: 'is not a regular file',
              unreadable: false,
            });
            continue;
          }
          if (stat.size > MAX_STORED_BYTES) {
            skipped.push({
              filePath,
              reason: 'is too large',
              unreadable: false,
            });
            continue;
          }
          const parsed = parseImportedRecordFile(fs.readFile(filePath));
          if (!parsed.ok) {
            const [issue] = parsed.issues;
            skipped.push({
              filePath,
              reason: `is not a valid imported record (${issue?.code ?? 'invalid'}${issue?.field ? ` at ${issue.field}` : ''})`,
              unreadable: false,
            });
            continue;
          }
          const expected = getImportedRecordSegments(
            getImportedRecordIdentity(parsed.record),
          );
          if (expected.join('/') !== `${typeDir}/${source}/${name}`) {
            skipped.push({
              filePath,
              reason: 'is not stored where its identity puts it',
              unreadable: false,
            });
            continue;
          }
          records.push({
            frontmatter: parsed.record,
            body: parsed.body,
            filePath,
          });
        } catch {
          skipped.push({
            filePath,
            reason: 'could not be read',
            unreadable: true,
          });
        }
      }
    }
  }

  return { records, skipped };
}

/**
 * Read every imported record (such as Slack messages) in a work log. Files
 * that cannot be read are logged with warnings that never quote their
 * contents, and skipped.
 *
 * @param outputDir - Base work-log directory
 * @returns Parsed records with frontmatter, body, and file path
 */
export async function readAllImportedRecords(
  outputDir: string,
): Promise<ImportedRecordFile[]> {
  const { records, skipped } = scanImportedRecords(outputDir);
  for (const { filePath, reason } of skipped) {
    console.warn(`Warning: Skipped ${filePath}: ${reason}`);
  }
  return records;
}
