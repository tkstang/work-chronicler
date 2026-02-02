import { Command } from 'commander';
import { deleteCommand } from './delete';
import { listCommand } from './list';
import { switchCommand } from './switch';

export const profileCommand = new Command('profile')
  .description('Manage work-chronicler profiles')
  .addCommand(listCommand)
  .addCommand(switchCommand)
  .addCommand(deleteCommand);
