import { getActiveProfile, getProfileDir, isWorkspaceMode } from '@core/index';
import { Command } from 'commander';

export const rootSubcommand = new Command('root')
  .description('Output the profile root directory path')
  .action(() => {
    if (!isWorkspaceMode()) {
      console.error(
        'Workspace not initialized. Run `work-chronicler init` first.',
      );
      process.exit(1);
    }
    console.log(getProfileDir(getActiveProfile()));
  });
