/**
 * reports add command
 */

import { CliError, toCliError } from '@cli/errors';
import { getGitHubNameProblem, normalizeGitHubName } from '@wc-types/github';
import type { ReportConfig } from '@wc-types/manager';
import { getActiveProfile } from '@workspace/global-config';
import { addReport, loadManagerConfig } from '@workspace/report-manager';
import { isManagerMode } from '@workspace/resolver';
import chalk from 'chalk';
import { Command } from 'commander';

import { promptForReport } from './reports.prompts';

/**
 * reports add command
 */
export const addCommand = new Command('add')
  .description('Add a new report to manager profile')
  .argument('[name]', 'Report name (e.g., "Alice Smith")')
  .option('--github <username>', 'GitHub username')
  .option('--email <email>', 'Email address')
  .option('--repos <repos>', 'Comma-separated list of repos')
  .option('--jira-projects <projects>', 'Comma-separated Jira projects')
  .action(async (name, options) => {
    try {
      const activeProfile = getActiveProfile();

      if (!isManagerMode(activeProfile)) {
        throw new CliError(
          chalk.red(
            '\n❌ Error: "reports" commands only available in manager mode.',
          ),
          {
            hint: `${chalk.gray('Current profile is in IC mode.')}\n${chalk.gray('\nHint: Create a manager profile with "init --mode manager"')}`,
          },
        );
      }

      const profileName = activeProfile;

      // Load config to get org and token
      const config = loadManagerConfig(profileName);

      let report: ReportConfig;

      if (options.github && options.email) {
        // Non-interactive mode
        const githubProblem = getGitHubNameProblem(
          normalizeGitHubName(options.github),
        );
        if (githubProblem) throw new Error(githubProblem);
        report = {
          name: name || normalizeGitHubName(options.github),
          github: normalizeGitHubName(options.github),
          email: options.email,
          repos: options.repos
            ? options.repos.split(',').map((r: string) => r.trim())
            : [],
          jiraProjects: options.jiraProjects
            ? options.jiraProjects.split(',').map((p: string) => p.trim())
            : [],
        };
      } else {
        // Interactive mode
        report = await promptForReport(config);
      }

      await addReport(profileName, report);

      console.log(chalk.green(`\n✓ ${report.name} added to manager profile`));
    } catch (error) {
      throw toCliError(error, chalk.red('\n❌ Error:'));
    }
  });
