import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import { deleteProfile, isWorkspaceMode, profileExists } from '@core/index';

export const deleteCommand = new Command('delete')
  .description('Delete a profile and all its data')
  .argument('<name>', 'Profile name to delete')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(async (name: string, options: { force?: boolean }) => {
    if (!isWorkspaceMode()) {
      console.error(chalk.red('Workspace mode not enabled.'));
      process.exit(1);
    }

    if (!profileExists(name)) {
      console.error(chalk.red(`Profile '${name}' does not exist.`));
      process.exit(1);
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
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : 'Unknown error',
      );
      process.exit(1);
    }
  });
