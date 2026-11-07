import { CliError, toCliError } from '@cli/errors';
import { isWorkspaceMode } from '@core/index';
import chalk from 'chalk';
import { Command } from 'commander';

import { runIcInit } from './ic';
import { runManagerInit } from './manager';

export const initCommand = new Command('init')
  .description('Initialize a new work-chronicler profile with guided setup')
  .option('--profile <name>', 'Profile name (skips profile name prompt)')
  .option('--mode <mode>', 'Profile mode: ic or manager (default: ic)')
  .action(async (options: { profile?: string; mode?: string }) => {
    try {
      console.log(chalk.cyan('\nWelcome to work-chronicler!\n'));

      if (isWorkspaceMode()) {
        console.log(chalk.dim("Let's set up a new profile.\n"));
      } else {
        console.log(chalk.dim("Let's set up your first profile.\n"));
      }

      // Validate mode option
      const mode = options.mode?.toLowerCase() ?? 'ic';
      if (mode !== 'ic' && mode !== 'manager') {
        throw new CliError(
          chalk.red('\nError: --mode must be either "ic" or "manager"'),
        );
      }

      if (mode === 'manager') {
        await runManagerInit(options.profile);
      } else {
        await runIcInit(options.profile);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('User force closed')
      ) {
        // Ctrl+C at a prompt: a cancellation, not a failure (exit 0)
        console.log(chalk.yellow('\n\nSetup cancelled.'));
        return;
      }
      throw toCliError(error, chalk.red('\nError:'), 'Unknown error');
    }
  });
