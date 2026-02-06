/**
 * reports list command
 */

import type { ManagerConfig } from '@wc-types/manager';
import { getActiveProfile } from '@workspace/global-config';
import { listReports, loadManagerConfig } from '@workspace/report-manager';
import { isManagerMode } from '@workspace/resolver';
import chalk from 'chalk';
import { Command } from 'commander';

/**
 * reports list command
 */
export const listCommand = new Command('list')
  .description('List all reports')
  .action(async () => {
    try {
      const activeProfile = getActiveProfile();

      if (!isManagerMode(activeProfile)) {
        console.error(
          chalk.red(
            '\n❌ Error: "reports" commands only available in manager mode.',
          ),
        );
        process.exit(1);
      }

      const profileName = activeProfile;
      const config: ManagerConfig = loadManagerConfig(profileName);

      const reports = listReports(profileName);

      console.log(chalk.blue(`\nManager profile: ${activeProfile}`));
      console.log(chalk.gray(`Org: ${config.github.org}\n`));

      if (reports.length === 0) {
        console.log(chalk.yellow('No reports configured.'));
        console.log(chalk.gray('\nAdd reports with "reports add"'));
        return;
      }

      console.log(chalk.bold(`Reports (${reports.length}):`));

      for (const [index, report] of reports.entries()) {
        console.log(
          `\n  ${index + 1}. ${chalk.bold(report.name)} (${chalk.gray(report.id)})`,
        );
        console.log(`     GitHub: ${report.github} | Email: ${report.email}`);
        console.log(
          `     Repos: ${report.repoCount} | Jira Projects: ${report.jiraProjectCount}`,
        );

        if (report.lastFetchTime) {
          const date = new Date(report.lastFetchTime);
          console.log(`     Last fetch: ${date.toLocaleString()}`);
        }
      }

      console.log('');
    } catch (error) {
      console.error(
        chalk.red('\n❌ Error:'),
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });
