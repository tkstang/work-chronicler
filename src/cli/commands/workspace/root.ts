import { CliError } from '@cli/errors';
import { getActiveProfile, getProfileDir, isWorkspaceMode } from '@core/index';
import { Command } from 'commander';

export const rootSubcommand = new Command('root')
  .description('Output the profile root directory path')
  .action(() => {
    if (!isWorkspaceMode()) {
      throw new CliError(
        'Workspace not initialized. Run `work-chronicler init` first.',
      );
    }
    console.log(getProfileDir(getActiveProfile()));
  });
