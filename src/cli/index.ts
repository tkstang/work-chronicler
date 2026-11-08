#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

import { CliError, handleCliError } from '@cli/errors';
import { analyzeCommand } from '@commands/analyze';
import { fetchCommand } from '@commands/fetch/index';
import { filterCommand } from '@commands/filter/index';
import { importCommand } from '@commands/import/index';
import { initCommand } from '@commands/init/index';
import { linkCommand } from '@commands/link';
import { mcpCommand } from '@commands/mcp';
import { profileCommand } from '@commands/profile/index';
import { reportsCommand } from '@commands/reports/index';
import { skillsCommand } from '@commands/skills/index';
import { slackCommand } from '@commands/slack/index';
import { statusCommand } from '@commands/status';
import { validateCommand } from '@commands/validate';
import { workspaceCommand } from '@commands/workspace/index';
import { findConfigPath, ProfileNameSchema } from '@core/index';
import { Command } from 'commander';
import { config as loadDotenv } from 'dotenv';

/**
 * Load .env file based on current config path resolution
 *
 * @param override - Whether .env should override existing env vars (default: false)
 */
function loadEnvFile(override = false): void {
  try {
    const configPath = findConfigPath();
    if (configPath) {
      const envPath = resolve(dirname(configPath), '.env');
      if (existsSync(envPath)) {
        loadDotenv({ path: envPath, override });
      }
    } else {
      // Fallback to current directory
      loadDotenv({ override });
    }
  } catch (error) {
    // Handle invalid profile name or other config errors gracefully
    const message = error instanceof Error ? error.message : String(error);
    throw new CliError(`Error loading environment: ${message}`, {
      cause: error,
    });
  }
}

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

/**
 * Build the CLI program with all commands registered
 */
function createProgram(): Command {
  const program = new Command();

  program
    .name('work-chronicler')
    .description(
      'Gather, analyze, and summarize your work history from GitHub PRs and JIRA tickets',
    )
    .version(version)
    .option(
      '--profile <name>',
      'Use a specific profile (overrides active profile)',
    )
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts();
      if (opts.profile) {
        // Validate profile name
        const result = ProfileNameSchema.safeParse(opts.profile);
        if (!result.success) {
          throw new CliError(
            `Invalid profile name: ${result.error.issues[0]?.message}`,
          );
        }
        // Set environment variable so getActiveProfile() uses it
        process.env.WORK_CHRONICLER_PROFILE = opts.profile;
        // Reload .env from the specified profile (override:true since user explicitly requested this profile)
        loadEnvFile(true);
      }
    });

  // Register commands
  program.addCommand(initCommand);
  program.addCommand(statusCommand);
  program.addCommand(linkCommand);
  program.addCommand(analyzeCommand);
  program.addCommand(filterCommand);
  program.addCommand(fetchCommand);
  program.addCommand(importCommand);
  program.addCommand(validateCommand);
  program.addCommand(mcpCommand);
  program.addCommand(profileCommand);
  program.addCommand(reportsCommand);
  program.addCommand(workspaceCommand);
  program.addCommand(skillsCommand);
  program.addCommand(slackCommand);

  return program;
}

/**
 * Run the CLI
 */
async function main(): Promise<void> {
  // Initial .env load (before --profile is parsed)
  // Use override:false so real env vars take precedence over .env
  loadEnvFile(false);
  await createProgram().parseAsync();
}

/**
 * Resolve once everything already queued on a stream has been handed to the
 * OS, so a forced exit does not cut off output to a slow pipe.
 */
function drain(stream: NodeJS.WriteStream): Promise<void> {
  return new Promise((resolve) => {
    if (!stream.writable) {
      resolve();
      return;
    }
    stream.write('', () => resolve());
  });
}

main().catch(async (error: unknown) => {
  process.exitCode = handleCliError(error);
  // Exit now, as each command's process.exit(1) used to: a spinner or prompt
  // left open by the failure would otherwise keep the process alive. Flush
  // stdout/stderr first (bounded, in case the reader never drains the pipe).
  await Promise.race([
    Promise.all([drain(process.stdout), drain(process.stderr)]),
    new Promise((resolve) => setTimeout(resolve, 5000).unref()),
  ]);
  process.exit();
});
