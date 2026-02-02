import { Command } from 'commander';
import { installSubcommand } from './install';
import { listSubcommand } from './list';

export const skillsCommand = new Command('skills')
  .description('Manage work-chronicler AI skills')
  .addCommand(installSubcommand)
  .addCommand(listSubcommand);
