/**
 * Manager mode fetch utilities
 */

import { CliError } from '@cli/errors';
import type { JiraFetchResult } from '@commands/fetch/jira/jira.types';
import { AnalysisConfigSchema, type Config } from '@config/schema';
import { select } from '@inquirer/prompts';
import type { ManagerConfig, ReportConfig } from '@wc-types/manager';
import { getActiveProfile } from '@workspace/global-config';
import { loadManagerConfig } from '@workspace/report-manager';
import { generateReportId } from '@workspace/report-utils';
import { getReportWorkLogDir, isManagerMode } from '@workspace/resolver';
import chalk from 'chalk';

/**
 * Resolve report ID(s) for fetch operation
 *
 * @param options - Command options
 * @returns Array of report IDs to fetch
 */
export async function resolveReportIds(options: {
  report?: string;
  allReports?: boolean;
}): Promise<string[]> {
  const activeProfile = getActiveProfile();

  if (!isManagerMode(activeProfile)) {
    // Not in manager mode - return empty array
    return [];
  }

  const config = loadManagerConfig(activeProfile);

  if (config.reports.length === 0) {
    throw new CliError(
      chalk.red('\n❌ Error: No reports configured in manager profile.'),
      { hint: chalk.gray('Add reports with "reports add"') },
    );
  }

  // If --all-reports flag
  if (options.allReports) {
    return config.reports.map((r) => generateReportId(r.name));
  }

  // If --report <id> flag
  if (options.report) {
    const reportId = options.report;
    const report = config.reports.find(
      (r) => generateReportId(r.name) === reportId,
    );

    if (!report) {
      throw new CliError(
        chalk.red(`\n❌ Error: Report "${reportId}" not found`),
      );
    }

    return [reportId];
  }

  // Interactive prompt
  const choices = [
    ...config.reports.map((r) => ({
      name: `${r.name} (${generateReportId(r.name)})`,
      value: generateReportId(r.name),
    })),
    { name: 'All reports', value: '_all' },
  ];

  const choice = await select({
    message: 'Which report(s)?',
    choices,
  });

  if (choice === '_all') {
    return config.reports.map((r) => generateReportId(r.name));
  }

  return [choice];
}

/**
 * Get report details by ID
 *
 * @param reportId - Report ID
 * @returns Report config
 */
export function getReportById(reportId: string): ReportConfig {
  const activeProfile = getActiveProfile();
  const config = loadManagerConfig(activeProfile);

  const report = config.reports.find(
    (r) => generateReportId(r.name) === reportId,
  );

  if (!report) {
    throw new Error(`Report "${reportId}" not found`);
  }

  return report;
}

/**
 * Resolve output directory for a report
 *
 * @param reportId - Report ID
 * @returns Absolute path to report's work-log directory
 */
export function resolveReportOutputDir(reportId: string): string {
  const activeProfile = getActiveProfile();
  return getReportWorkLogDir(activeProfile, reportId);
}

/**
 * Load and return the manager config for the active profile.
 *
 * @returns Manager config validated against ManagerConfigSchema
 */
export function loadManagerConfigForFetch(): ManagerConfig {
  const activeProfile = getActiveProfile();
  return loadManagerConfig(activeProfile);
}

/**
 * Build an IC-compatible Config from a manager config and a specific report.
 *
 * The fetch utilities (fetchGitHubPRs, fetchJiraTickets, linkPRsToTickets)
 * all expect a Config (IC schema). This function bridges the gap by
 * constructing one from the manager config + per-report overrides.
 *
 * @param managerConfig - The manager profile config
 * @param report - The specific report to build the config for
 * @returns A Config object compatible with IC fetch utilities
 */
export function buildReportConfig(
  managerConfig: ManagerConfig,
  report: ReportConfig,
): Config {
  // Build GitHub orgs array from manager org + report repos
  const orgs = [
    {
      name: managerConfig.github.org,
      repos: report.repos.length > 0 ? report.repos : ['*'],
    },
  ];

  // Build JIRA instances from manager's JIRA config + report's projects
  const jira =
    managerConfig.jira && report.jiraProjects.length > 0
      ? {
          instances: [
            {
              name: managerConfig.jira.host,
              url: managerConfig.jira.host.startsWith('https://')
                ? managerConfig.jira.host
                : `https://${managerConfig.jira.host}`,
              email: report.email,
              token: managerConfig.jira.token,
              projects: report.jiraProjects,
            },
          ],
        }
      : undefined;

  return {
    github: {
      username: report.github,
      token: managerConfig.github.token,
      orgs,
    },
    jira,
    output: { directory: './work-log' },
    fetch: {
      since: managerConfig.fetch.since,
      until: managerConfig.fetch.until,
    },
    analysis: managerConfig.analysis ?? AnalysisConfigSchema.parse({}),
  };
}

/**
 * The per-report summary line for a manager fetch: green "complete", or
 * yellow "incomplete" naming the JIRA projects whose fetch failed.
 *
 * @param reportName - Report display name
 * @param counts - What was fetched, e.g. "3 PRs, 2 tickets"
 * @param jiraResults - The report's JIRA fetch results
 */
export function formatReportOutcome(
  reportName: string,
  counts: string,
  jiraResults: JiraFetchResult[],
): string {
  const failed = jiraResults
    .filter((result) => result.error !== undefined)
    .map((result) => result.project);
  if (failed.length === 0) {
    return chalk.green(`✓ ${reportName} complete (${counts})\n`);
  }
  return chalk.yellow(
    `⚠ ${reportName} incomplete (${counts}; JIRA failed for ${failed.join(', ')})\n`,
  );
}
