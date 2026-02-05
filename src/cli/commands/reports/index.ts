/**
 * reports command
 *
 * Parent command for managing reports in manager mode.
 * Subcommands: add, list, remove, update
 */

import { Command } from 'commander';
import { addCommand } from './add';

export const reportsCommand = new Command('reports')
  .description('Manage reports (manager mode only)')
  .addCommand(addCommand);
