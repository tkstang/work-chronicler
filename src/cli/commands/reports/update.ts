/**
 * reports update command
 */

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
        console.error(
          chalk.red(
            '\n❌ Error: "reports" commands only available in manager mode.',
          ),
        );
        console.log(chalk.gray('Current profile is in IC mode.'));
        console.log(
          chalk.gray(
            '\nHint: Create a manager profile with "init --mode manager"',
          ),
        );
        process.exit(1);
      }

      // Check that at least one option was provided
      if (
        !options.addRepo &&
        !options.removeRepo &&
        !options.addJiraProject &&
        !options.removeJiraProject
      ) {
        console.error(
          chalk.red('\n❌ Error: Must provide at least one update option.'),
        );
        console.log(
          chalk.gray(
            '\nAvailable options: --add-repo, --remove-repo, --add-jira-project, --remove-jira-project',
          ),
        );
        process.exit(1);
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
      console.error(
        chalk.red('\n❌ Error:'),
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });
