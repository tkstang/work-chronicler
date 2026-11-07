import { CliError } from '@cli/errors';
import { getActiveProfile, isWorkspaceMode } from '@core/index';
import { Command } from 'commander';

export const profileSubcommand = new Command('profile')
  .description('Output the active profile name')
  .action(() => {
    if (!isWorkspaceMode()) {
      throw new CliError(
        'Workspace not initialized. Run `work-chronicler init` first.',
      );
    }
    console.log(getActiveProfile());
  });
