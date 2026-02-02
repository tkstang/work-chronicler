import { Command } from 'commander';
import { listSubcommand } from './list';

export const skillsCommand = new Command('skills')
  .description('Manage work-chronicler AI skills')
  .addCommand(listSubcommand);
