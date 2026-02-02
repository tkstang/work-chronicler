#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { analyzeCommand } from '@commands/analyze';
import { fetchAllCommand } from '@commands/fetch/all';
import { fetchGitHubCommand } from '@commands/fetch/github';
import { fetchJiraCommand } from '@commands/fetch/jira';
import { filterCommand } from '@commands/filter';
import { initCommand } from '@commands/init/index';
import { linkCommand } from '@commands/link';
import { mcpCommand } from '@commands/mcp';
import { statusCommand } from '@commands/status';
import { profileCommand } from '@commands/subcommands/profile/index';
import { findConfigPath, ProfileNameSchema } from '@core/index';
import { Command } from 'commander';
import { config as loadDotenv } from 'dotenv';

/**
 * Load .env file based on current config path resolution
 */
function loadEnvFile(): void {
  const configPath = findConfigPath();
  if (configPath) {
    const envPath = resolve(dirname(configPath), '.env');
    if (existsSync(envPath)) {
      loadDotenv({ path: envPath, override: true });
    }
  } else {
    // Fallback to current directory
    loadDotenv();
  }
}

// Initial .env load (before --profile is parsed)
loadEnvFile();

const program = new Command();

program
  .name('work-chronicler')
  .description(
    'Gather, analyze, and summarize your work history from GitHub PRs and JIRA tickets',
  )
  .version('0.1.0')
  .option('--profile <name>', 'Use a specific profile (overrides active profile)')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts();
    if (opts.profile) {
      // Validate profile name
      const result = ProfileNameSchema.safeParse(opts.profile);
      if (!result.success) {
        console.error(`Invalid profile name: ${result.error.errors[0]?.message}`);
        process.exit(1);
      }
      // Set environment variable so getActiveProfile() uses it
      process.env.WORK_CHRONICLER_PROFILE = opts.profile;
      // Reload .env from the specified profile
      loadEnvFile();
    }
  });

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
program.addCommand(profileCommand);

program.parse();
