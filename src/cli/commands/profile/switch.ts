/**
 * profile switch subcommand
 *
 * Switches to a different profile.
 */

import { isWorkspaceMode, profileExists, setActiveProfile } from '@core/index';
import chalk from 'chalk';
import { Command } from 'commander';

export const switchCommand = new Command('switch')
  .description('Switch to a different profile')
  .argument('<name>', 'Profile name to switch to')
  .action(async (name: string) => {
    if (!isWorkspaceMode()) {
      console.error(chalk.red('Workspace mode not enabled.'));
      console.error('Run `work-chronicler init` to create your first profile.');
      process.exit(1);
    }

    if (!profileExists(name)) {
      console.error(chalk.red(`Profile '${name}' does not exist.`));
      console.error(
        "Run 'work-chronicler profile list' to see available profiles.",
      );
      process.exit(1);
    }

    try {
      setActiveProfile(name);
      console.log(chalk.green(`\nSwitched to profile '${name}'`));
      console.log(
        chalk.dim(
          '\nAll commands will now use this profile unless overridden with --profile flag',
        ),
      );
    } catch (error) {
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : 'Unknown error',
      );
      process.exit(1);
    }
  });
