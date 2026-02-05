import { getActiveProfile, getAnalysisDir, isWorkspaceMode } from '@core/index';
import { Command } from 'commander';

export const analysisSubcommand = new Command('analysis')
  .description('Output the analysis directory path')
  .action(() => {
    if (!isWorkspaceMode()) {
      console.error(
        'Workspace not initialized. Run `work-chronicler init` first.',
      );
      process.exit(1);
    }
    console.log(getAnalysisDir(getActiveProfile()));
  });
