import { getActiveProfile, getWorkLogDir, isWorkspaceMode } from '@core/index';
import { Command } from 'commander';

export const workLogSubcommand = new Command('work-log')
  .description('Output the work-log directory path')
  .action(() => {
    if (!isWorkspaceMode()) {
      console.error(
        'Workspace not initialized. Run `work-chronicler init` first.',
      );
      process.exit(1);
    }
    console.log(getWorkLogDir(getActiveProfile()));
  });
