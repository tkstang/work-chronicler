#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { analyzeCommand } from '@commands/analyze';
import { fetchAllCommand } from '@commands/fetch/all';
import { fetchGitHubCommand } from '@commands/fetch/github';
import { fetchJiraCommand } from '@commands/fetch/jira';
import { filterCommand } from '@commands/filter';
import { initCommand } from '@commands/init';
import { linkCommand } from '@commands/link';
import { mcpCommand } from '@commands/mcp';
import { statusCommand } from '@commands/status';
import { findConfigPath } from '@work-chronicler/core';
import { Command } from 'commander';
import { config as loadDotenv } from 'dotenv';

// Load .env from config directory or current directory
const configPath = findConfigPath();
if (configPath) {
  const envPath = resolve(dirname(configPath), '.env');
  if (existsSync(envPath)) {
    loadDotenv({ path: envPath });
  }
} else {
  // Fallback to current directory
  loadDotenv();
}

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
program.addCommand(filterCommand);
program.addCommand(fetchGitHubCommand);
program.addCommand(fetchJiraCommand);
program.addCommand(fetchAllCommand);
program.addCommand(mcpCommand);

program.parse();
