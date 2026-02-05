/**
 * Manager mode fetch utilities
 */

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
    console.error(
      chalk.red('\n❌ Error: No reports configured in manager profile.'),
    );
    console.log(chalk.gray('Add reports with "reports add"'));
    process.exit(1);
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
      console.error(chalk.red(`\n❌ Error: Report "${reportId}" not found`));
      process.exit(1);
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
