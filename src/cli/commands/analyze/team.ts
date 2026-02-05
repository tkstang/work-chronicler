/**
 * analyze team command
 *
 * Generate team-wide analysis across all reports (manager mode only).
 */

import { writeTeamAnalysis } from '@cli/analyzer';
import { getActiveProfile } from '@workspace/global-config';
import { loadManagerConfig } from '@workspace/report-manager';
import { generateReportId } from '@workspace/report-utils';
import { getReportAnalysisDir, isManagerMode } from '@workspace/resolver';
import chalk from 'chalk';
import { Command } from 'commander';

/**
 * analyze team command
 */
export const teamCommand = new Command('team')
  .description('Generate team-wide analysis (manager mode only)')
  .action(async () => {
    try {
      const activeProfile = getActiveProfile();

      if (!isManagerMode(activeProfile)) {
        console.error(
          chalk.red(
            '\n❌ Error: "analyze team" command only available in manager mode.',
          ),
        );
        console.log(
          chalk.gray('Use "analyze" without subcommands for IC mode analysis.'),
        );
        process.exit(1);
      }

      const profileName = activeProfile;
      const config = loadManagerConfig(profileName);

      // Extract report IDs from config
      const reportIds = config.reports.map((report) =>
        generateReportId(report.name),
      );

      console.log(
        chalk.cyan(
          `\n📊 Generating team analysis for ${chalk.bold(reportIds.length)} reports...\n`,
        ),
      );

      // Generate team analysis
      await writeTeamAnalysis(profileName, reportIds);

      console.log(chalk.green('\n✓ Team analysis generated successfully'));
      console.log(
        chalk.gray(
          `\nOutput: ${getReportAnalysisDir('manager', profileName)}/team-*.json`,
        ),
      );
    } catch (error) {
      console.error(
        chalk.red('\n❌ Error:'),
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });
