import { CliError } from '@cli/errors';
import { getActiveProfile, getWorkLogDir, isWorkspaceMode } from '@core/index';
import { Command } from 'commander';

export const workLogSubcommand = new Command('work-log')
  .description('Output the work-log directory path')
  .action(() => {
    if (!isWorkspaceMode()) {
      throw new CliError(
        'Workspace not initialized. Run `work-chronicler init` first.',
      );
    }
    console.log(getWorkLogDir(getActiveProfile()));
  });
