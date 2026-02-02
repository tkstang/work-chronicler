import { Command } from 'commander';
import { analysisSubcommand } from './analysis';
import { profileSubcommand } from './profile';
import { rootSubcommand } from './root';
import { workLogSubcommand } from './work-log';

export const workspaceCommand = new Command('workspace')
  .description('Output workspace paths for the active profile')
  .addCommand(profileSubcommand)
  .addCommand(workLogSubcommand)
  .addCommand(analysisSubcommand)
  .addCommand(rootSubcommand);
