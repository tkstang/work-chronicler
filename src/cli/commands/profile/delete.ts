/**
 * profile delete subcommand
 *
 * Deletes a profile and all its data.
 */

import { CliError, toCliError } from '@cli/errors';
import { deleteProfile, isWorkspaceMode, profileExists } from '@core/index';
import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';

export const deleteCommand = new Command('delete')
  .description('Delete a profile and all its data')
  .argument('<name>', 'Profile name to delete')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(async (name: string, options: { force?: boolean }) => {
    if (!isWorkspaceMode()) {
      throw new CliError(chalk.red('Workspace mode not enabled.'));
    }

    if (!profileExists(name)) {
      throw new CliError(chalk.red(`Profile '${name}' does not exist.`));
    }

    // Confirm deletion unless --force is used
    if (!options.force) {
      console.log(
        chalk.yellow(
          `\nWarning: This will permanently delete the '${name}' profile and all its data.`,
        ),
      );

      const confirmed = await confirm({
        message: 'Are you sure?',
        default: false,
      });

      if (!confirmed) {
        console.log('Cancelled.');
        return;
      }
    }

    try {
      deleteProfile(name);
      console.log(chalk.green(`\nProfile '${name}' deleted successfully`));
    } catch (error) {
      throw toCliError(error, chalk.red('Error:'), 'Unknown error');
    }
  });
