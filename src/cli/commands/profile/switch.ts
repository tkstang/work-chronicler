/**
 * profile switch subcommand
 *
 * Switches to a different profile.
 */

import { CliError, toCliError } from '@cli/errors';
import { isWorkspaceMode, profileExists, setActiveProfile } from '@core/index';
import chalk from 'chalk';
import { Command } from 'commander';

export const switchCommand = new Command('switch')
  .description('Switch to a different profile')
  .argument('<name>', 'Profile name to switch to')
  .action(async (name: string) => {
    if (!isWorkspaceMode()) {
      throw new CliError(
        `${chalk.red('Workspace mode not enabled.')}\nRun \`work-chronicler init\` to create your first profile.`,
      );
    }

    if (!profileExists(name)) {
      throw new CliError(
        `${chalk.red(`Profile '${name}' does not exist.`)}\nRun 'work-chronicler profile list' to see available profiles.`,
      );
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
      throw toCliError(error, chalk.red('Error:'), 'Unknown error');
    }
  });
