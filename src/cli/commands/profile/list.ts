/**
 * profile list subcommand
 *
 * Lists all available profiles and indicates the active one.
 */

import { getActiveProfile, isWorkspaceMode, listProfiles } from '@core/index';
import chalk from 'chalk';
import { Command } from 'commander';

export const listCommand = new Command('list')
  .description('List all available profiles')
  .action(async () => {
    if (!isWorkspaceMode()) {
      console.log(chalk.yellow('Workspace mode not enabled.'));
      console.log('Run `work-chronicler init` to create your first profile.');
      return;
    }

    const profiles = listProfiles();

    if (profiles.length === 0) {
      console.log(chalk.yellow('No profiles found.'));
      console.log('Run `work-chronicler init` to create your first profile.');
      return;
    }

    const active = getActiveProfile();

    console.log(chalk.cyan('\nAvailable profiles:\n'));

    for (const profile of profiles) {
      if (profile === active) {
        console.log(chalk.green(`  * ${profile} (active)`));
      } else {
        console.log(`    ${profile}`);
      }
    }

    console.log(
      chalk.dim(
        "\nUse 'work-chronicler profile switch <name>' to change profiles",
      ),
    );
  });
