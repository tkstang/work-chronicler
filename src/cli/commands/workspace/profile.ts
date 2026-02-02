import { getActiveProfile, isWorkspaceMode } from '@core/index';
import { Command } from 'commander';

export const profileSubcommand = new Command('profile')
  .description('Output the active profile name')
  .action(() => {
    if (!isWorkspaceMode()) {
      console.error(
        'Workspace not initialized. Run `work-chronicler init` first.',
      );
      process.exit(1);
    }
    console.log(getActiveProfile());
  });
