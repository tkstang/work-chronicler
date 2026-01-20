import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PullRequest } from '@wc-types/pr';
import type { JiraTicket } from '@wc-types/ticket';
import { stringify as stringifyYaml } from 'yaml';

/**
 * Valid frontmatter types for markdown files.
 *
 * Union type representing the structured data that can be written
 * as YAML frontmatter in work-log markdown files.
 */
export type MarkdownFrontmatter = PullRequest | JiraTicket;

/**
 * Write a markdown file with YAML frontmatter.
 *
 * Creates parent directories if they don't exist. The frontmatter
 * is serialized as YAML with double-quoted strings for consistency.
 *
 * @param filePath - Absolute path where the file should be written
 * @param frontmatter - Structured data to serialize as YAML frontmatter
 * @param body - Markdown body content (typically PR/ticket description)
 *
 * @example
 * ```ts
 * writeMarkdownFile(
 *   '/path/to/work-log/pull-requests/org/repo/2024-01-15_123.md',
 *   { title: 'Add feature', prNumber: 123, ... },
 *   'This PR adds a new feature...'
 * );
 * ```
 */
export function writeMarkdownFile(
  filePath: string,
  frontmatter: MarkdownFrontmatter,
  body: string,
): void {
  const dir = dirname(filePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const yamlContent = stringifyYaml(frontmatter, {
    lineWidth: 0,
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  });

  const content = `---\n${yamlContent}---\n\n${body}\n`;
  writeFileSync(filePath, content, 'utf-8');
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 *
 * @param dirPath - Absolute path to the directory
 *
 * @example
 * ```ts
 * ensureDirectory('/path/to/work-log/pull-requests/org/repo');
 * ```
 */
export function ensureDirectory(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}
