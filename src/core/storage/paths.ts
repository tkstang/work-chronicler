import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { getGitHubNameProblem, normalizeGitHubName } from '@wc-types/github';
import {
  IMPORT_SOURCES,
  type ImportedRecordIdentity,
  type ImportedRecordType,
  importedRecordIdentityKey,
} from '@wc-types/imported-record';

/**
 * Standard directory names within the work-log structure.
 *
 * @example
 * ```ts
 * const prDir = join(outputDir, DIRECTORIES.PULL_REQUESTS);
 * // prDir: "/path/to/work-log/pull-requests"
 * ```
 */
export const DIRECTORIES = {
  PULL_REQUESTS: 'pull-requests',
  /**
   * Reviews the user gave on other people's PRs. Deliberately outside
   * `pull-requests/` so no authored-PR reader ever sees them.
   */
  PR_REVIEWS: 'pr-reviews',
  JIRA: 'jira',
  /** Imported messages (`work-chronicler import`), by source */
  MESSAGES: 'messages',
  PERFORMANCE_REVIEWS: 'performance-reviews',
  ANALYSIS: '.analysis',
  FILTERED: 'filtered',
} as const;

/**
 * The work-log directory for each imported record type.
 */
export const IMPORTED_RECORD_DIRECTORIES: Record<ImportedRecordType, string> = {
  message: DIRECTORIES.MESSAGES,
};

/**
 * Normalize an org for use as a directory name, refusing names that would
 * still produce an `@`-prefixed or empty directory.
 */
function toOrgDirectory(org: string): string {
  const normalized = normalizeGitHubName(org);
  const problem = getGitHubNameProblem(normalized);
  if (problem) throw new Error(`Invalid GitHub org "${org}": ${problem}`);
  return normalized;
}

/**
 * Get the effective output directory, preferring filtered data if available.
 *
 * Checks if a `filtered/` subdirectory exists with PR data.
 * If so, returns that path for read operations to use the filtered subset.
 *
 * @param outputDir - Base work-log output directory
 * @returns Object with `dir` (path to use) and `isFiltered` (whether using filtered data)
 *
 * @example
 * ```ts
 * const { dir, isFiltered } = getEffectiveOutputDir('/path/to/work-log');
 * if (isFiltered) {
 *   console.log('Using filtered data');
 * }
 * ```
 */
export function getEffectiveOutputDir(outputDir: string): {
  dir: string;
  isFiltered: boolean;
} {
  const filteredDir = join(outputDir, DIRECTORIES.FILTERED);
  const filteredPRDir = join(filteredDir, DIRECTORIES.PULL_REQUESTS);

  // Check if filtered directory exists and has PR data
  if (existsSync(filteredPRDir)) {
    return { dir: filteredDir, isFiltered: true };
  }

  return { dir: outputDir, isFiltered: false };
}

/**
 * Whether the work log's `filtered/` subset was written before any review
 * records existed: it has PRs but no `pr-reviews/` directory, while the full
 * work log has one. `filter` writes `filtered/pr-reviews/` (empty when
 * nothing matches) whenever the work log has `pr-reviews/`, so a missing
 * directory means the subset predates the first review fetch.
 *
 * @param outputDir - Base work-log output directory (not `filtered/`)
 */
export function isFilteredSubsetMissingReviews(outputDir: string): boolean {
  const filteredDir = join(outputDir, DIRECTORIES.FILTERED);
  return (
    existsSync(join(filteredDir, DIRECTORIES.PULL_REQUESTS)) &&
    !existsSync(join(filteredDir, DIRECTORIES.PR_REVIEWS)) &&
    existsSync(join(outputDir, DIRECTORIES.PR_REVIEWS))
  );
}

/**
 * Get the file path for storing a PR markdown file.
 *
 * @param outputDir - Base work-log output directory
 * @param org - GitHub organization name
 * @param repo - Repository name
 * @param date - PR creation date (used in filename)
 * @param prNumber - PR number (used in filename)
 * @returns Full path like `{outputDir}/pull-requests/{org}/{repo}/{date}_{prNumber}.md`
 */
export function getPRFilePath(
  outputDir: string,
  org: string,
  repo: string,
  date: Date,
  prNumber: number,
): string {
  const dateStr = date.toISOString().split('T')[0];
  const fileName = `${dateStr}_${prNumber}.md`;
  return join(
    outputDir,
    DIRECTORIES.PULL_REQUESTS,
    toOrgDirectory(org),
    repo,
    fileName,
  );
}

/**
 * Get an imported record's location relative to the work log, as path
 * segments: `[<type directory>, <source>, <hash>.md]`.
 *
 * The file name is the first 32 hex digits of the SHA-256 of the record's
 * identity, so nothing a record contains is ever used as path text: a source
 * ID with `../`, a backslash or a different letter case cannot move or alias
 * the destination. The same identity always maps to the same file, which is
 * what makes import an upsert.
 *
 * @param identity - Record identity
 * @returns Path segments under the work-log root
 */
export function getImportedRecordSegments(
  identity: ImportedRecordIdentity,
): string[] {
  const directory = IMPORTED_RECORD_DIRECTORIES[identity.type];
  if (!directory || !IMPORT_SOURCES.includes(identity.source)) {
    throw new Error('Unknown imported record type or source');
  }
  const hash = createHash('sha256')
    .update(importedRecordIdentityKey(identity))
    .digest('hex')
    .slice(0, 32);
  return [directory, identity.source, `${hash}.md`];
}

/**
 * Get the file path for an imported record.
 *
 * @param outputDir - Base work-log directory (an IC work log or a report's)
 * @param identity - Record identity
 * @returns Full path like `{outputDir}/messages/slack/{hash}.md`
 */
export function getImportedRecordFilePath(
  outputDir: string,
  identity: ImportedRecordIdentity,
): string {
  return join(outputDir, ...getImportedRecordSegments(identity));
}

/**
 * Get the file path for a review record: the reviews the user gave on one
 * PR. Keyed by the PR's identity (org, repo, number), never by a date, so
 * every fetch of the same PR updates the same file.
 *
 * @param outputDir - Base work-log output directory
 * @param org - Org or user that owns the reviewed PR's repository
 * @param repo - Repository name
 * @param prNumber - Reviewed PR number
 * @returns Full path like `{outputDir}/pr-reviews/{org}/{repo}/{prNumber}.md`
 */
export function getPRReviewFilePath(
  outputDir: string,
  org: string,
  repo: string,
  prNumber: number,
): string {
  if (!repo || repo === '.' || repo === '..' || /[/\\]/.test(repo)) {
    throw new Error(`Invalid repository name "${repo}"`);
  }
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error(`Invalid PR number "${prNumber}"`);
  }
  return join(
    outputDir,
    DIRECTORIES.PR_REVIEWS,
    toOrgDirectory(org),
    repo,
    `${prNumber}.md`,
  );
}

/**
 * Get the file path for storing a JIRA ticket markdown file.
 *
 * @param outputDir - Base work-log output directory
 * @param org - JIRA instance name
 * @param project - JIRA project key
 * @param ticketKey - Ticket key (e.g., "PROJ-123")
 * @returns Full path like `{outputDir}/jira/{org}/{project}/{ticketKey}.md`
 */
export function getTicketFilePath(
  outputDir: string,
  org: string,
  project: string,
  ticketKey: string,
): string {
  const fileName = `${ticketKey}.md`;
  return join(outputDir, DIRECTORIES.JIRA, org, project, fileName);
}

/**
 * Get the file path for an analysis JSON file.
 *
 * @param outputDir - Base work-log output directory
 * @param analysisName - Name of analysis file (without extension)
 * @returns Full path like `{outputDir}/.analysis/{analysisName}.json`
 */
export function getAnalysisFilePath(
  outputDir: string,
  analysisName: string,
): string {
  return join(outputDir, DIRECTORIES.ANALYSIS, `${analysisName}.json`);
}

/**
 * Get the directory path for pull requests.
 *
 * @param outputDir - Base work-log output directory
 * @param org - GitHub organization name
 * @param repo - Optional repository name (omit to get org-level directory)
 * @returns Directory path for the org or org/repo
 */
export function getPRDirectory(
  outputDir: string,
  org: string,
  repo?: string,
): string {
  const orgDir = toOrgDirectory(org);
  if (repo) {
    return join(outputDir, DIRECTORIES.PULL_REQUESTS, orgDir, repo);
  }
  return join(outputDir, DIRECTORIES.PULL_REQUESTS, orgDir);
}

/**
 * Get the directory path for JIRA tickets.
 *
 * @param outputDir - Base work-log output directory
 * @param org - JIRA instance name
 * @param project - Optional project key (omit to get instance-level directory)
 * @returns Directory path for the instance or instance/project
 */
export function getJiraDirectory(
  outputDir: string,
  org: string,
  project?: string,
): string {
  if (project) {
    return join(outputDir, DIRECTORIES.JIRA, org, project);
  }
  return join(outputDir, DIRECTORIES.JIRA, org);
}
