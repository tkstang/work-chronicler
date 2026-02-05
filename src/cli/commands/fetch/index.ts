/**
 * fetch command
 *
 * Parent command for fetching work data from external sources.
 * Subcommands: all, github, jira
 */

import { Command } from 'commander';
import { allCommand } from './all';
import { githubCommand } from './github/index';
import { jiraCommand } from './jira/index';

export const fetchCommand = new Command('fetch')
  .description('Fetch work data from external sources')
  .addCommand(allCommand)
  .addCommand(githubCommand)
  .addCommand(jiraCommand);
