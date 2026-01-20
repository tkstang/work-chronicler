import { existsSync } from 'node:fs';
import { join } from 'node:path';

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
  JIRA: 'jira',
  PERFORMANCE_REVIEWS: 'performance-reviews',
  ANALYSIS: '.analysis',
  FILTERED: 'filtered',
} as const;

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
  return join(outputDir, DIRECTORIES.PULL_REQUESTS, org, repo, fileName);
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
  if (repo) {
    return join(outputDir, DIRECTORIES.PULL_REQUESTS, org, repo);
  }
  return join(outputDir, DIRECTORIES.PULL_REQUESTS, org);
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
