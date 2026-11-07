import { CliError } from '@cli/errors';
import { getActiveProfile, getAnalysisDir, isWorkspaceMode } from '@core/index';
import { Command } from 'commander';

export const analysisSubcommand = new Command('analysis')
  .description('Output the analysis directory path')
  .action(() => {
    if (!isWorkspaceMode()) {
      throw new CliError(
        'Workspace not initialized. Run `work-chronicler init` first.',
      );
    }
    console.log(getAnalysisDir(getActiveProfile()));
  });
