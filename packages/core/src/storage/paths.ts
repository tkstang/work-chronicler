import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Directory names within the work-log
 */
export const DIRECTORIES = {
  PULL_REQUESTS: 'pull-requests',
  JIRA: 'jira',
  PERFORMANCE_REVIEWS: 'performance-reviews',
  ANALYSIS: '.analysis',
  FILTERED: 'filtered',
} as const;

/**
 * Check if filtered data exists and return the appropriate directory.
 * If filtered/ exists and has data, returns the filtered path.
 * Otherwise returns the original outputDir.
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
 * Get the path for a PR file
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
 * Get the path for a JIRA ticket file
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
 * Get the path for an analysis file
 */
export function getAnalysisFilePath(
  outputDir: string,
  analysisName: string,
): string {
  return join(outputDir, DIRECTORIES.ANALYSIS, `${analysisName}.json`);
}

/**
 * Get the pull requests directory for an org/repo
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
 * Get the JIRA directory for an org/project
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
