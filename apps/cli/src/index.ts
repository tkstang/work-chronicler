#!/usr/bin/env node

import { analyzeCommand } from '@commands/analyze';
import { fetchAllCommand } from '@commands/fetch/all';
import { fetchGitHubCommand } from '@commands/fetch/github';
import { fetchJiraCommand } from '@commands/fetch/jira';
import { initCommand } from '@commands/init';
import { linkCommand } from '@commands/link';
import { statusCommand } from '@commands/status';
import { Command } from 'commander';

const program = new Command();

program
  .name('work-chronicler')
  .description(
    'Gather, analyze, and summarize your work history from GitHub PRs and JIRA tickets',
  )
  .version('0.1.0');

// Register commands
program.addCommand(initCommand);
program.addCommand(statusCommand);
program.addCommand(linkCommand);
program.addCommand(analyzeCommand);
program.addCommand(fetchGitHubCommand);
program.addCommand(fetchJiraCommand);
program.addCommand(fetchAllCommand);

program.parse();
