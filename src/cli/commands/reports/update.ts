/**
 * reports update command
 */

import { CliError, toCliError } from '@cli/errors';
import { getActiveProfile } from '@workspace/global-config';
import { updateReport } from '@workspace/report-manager';
import { isManagerMode } from '@workspace/resolver';
import chalk from 'chalk';
import { Command } from 'commander';

/**
 * reports update command
 */
export const updateCommand = new Command('update')
  .description('Update a report (add/remove repos or Jira projects)')
  .argument('<report-id>', 'Report ID to update')
  .option('--add-repo <repo>', 'Add a repo to the report')
  .option('--remove-repo <repo>', 'Remove a repo from the report')
  .option('--add-jira-project <project>', 'Add a Jira project to the report')
  .option(
    '--remove-jira-project <project>',
    'Remove a Jira project from the report',
  )
  .action(async (reportId, options) => {
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

      // Check that at least one option was provided
      if (
        !options.addRepo &&
        !options.removeRepo &&
        !options.addJiraProject &&
        !options.removeJiraProject
      ) {
        throw new CliError(
          chalk.red('\n❌ Error: Must provide at least one update option.'),
          {
            hint: chalk.gray(
              '\nAvailable options: --add-repo, --remove-repo, --add-jira-project, --remove-jira-project',
            ),
          },
        );
      }

      const profileName = activeProfile;

      updateReport(profileName, reportId, {
        addRepo: options.addRepo,
        removeRepo: options.removeRepo,
        addJiraProject: options.addJiraProject,
        removeJiraProject: options.removeJiraProject,
      });

      console.log(chalk.green(`\n✓ Report "${reportId}" updated successfully`));
    } catch (error) {
      throw toCliError(error, chalk.red('\n❌ Error:'));
    }
  });
