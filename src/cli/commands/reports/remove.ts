/**
 * reports remove command
 */

import { select } from '@inquirer/prompts';
import { getActiveProfile } from '@workspace/global-config';
import { removeReport } from '@workspace/report-manager';
import { isManagerMode } from '@workspace/resolver';
import chalk from 'chalk';
import { Command } from 'commander';

/**
 * reports remove command
 */
export const removeCommand = new Command('remove')
  .description('Remove a report')
  .argument('<id>', 'Report ID (e.g., "alice-smith")')
  .option('--keep-data', 'Keep data (remove from config only)')
  .option(
    '--delete-data',
    'Delete data (remove config + delete all work-log/analysis/outputs)',
  )
  .action(async (id, options) => {
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

      const profileName = activeProfile;

      let deleteData = false;

      if (options.deleteData) {
        deleteData = true;
      } else if (options.keepData) {
        deleteData = false;
      } else {
        // Interactive prompt
        const choice = await select({
          message: `What should we do with ${id}'s data?`,
          choices: [
            { name: 'Keep data (remove from config only)', value: 'keep' },
            {
              name: 'Delete data (remove config + delete all work-log/analysis/outputs)',
              value: 'delete',
            },
          ],
        });

        deleteData = choice === 'delete';
      }

      if (deleteData) {
        console.log(
          chalk.yellow(
            '\n⚠️  Deleting data is permanent and cannot be undone.\n',
          ),
        );
      }

      removeReport(profileName, id, deleteData);

      if (deleteData) {
        console.log(chalk.green(`\n✓ ${id} removed and data deleted`));
      } else {
        console.log(
          chalk.green(`\n✓ ${id} removed from config (data preserved)`),
        );
      }
    } catch (error) {
      console.error(
        chalk.red('\n❌ Error:'),
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });
