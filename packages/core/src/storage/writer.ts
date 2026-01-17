import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PullRequest } from 'src/types/pr';
import type { JiraTicket } from 'src/types/ticket';
import { stringify as stringifyYaml } from 'yaml';

/**
 * Valid frontmatter types for markdown files
 */
export type MarkdownFrontmatter = PullRequest | JiraTicket;

/**
 * Write a markdown file with YAML frontmatter
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
 * Ensure a directory exists
 */
export function ensureDirectory(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}
