/**
 * fetch github subcommand
 *
 * Fetches pull requests from GitHub for the configured user and organizations.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  DIRECTORIES,
  findConfigPath,
  getOutputDirectory,
  loadConfig,
} from '@core/index';
import { promptUseCache } from '@prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import { fetchGitHubPRs } from './github.utils';

export const githubCommand = new Command('github')
  .description('Fetch pull requests from GitHub')
  .option('-c, --config <path>', 'Path to config file')
  .option('-v, --verbose', 'Show detailed output')
  .option('--cache', 'Skip PRs that already exist in work log')
  .action(async (options) => {
    try {
      const configPath = findConfigPath(options.config);
      const config = await loadConfig(options.config);
      const outputDir = getOutputDirectory(config, configPath ?? undefined);

      // Determine cache behavior - prompt if data exists and --cache not specified
      let useCache = options.cache;
      if (!options.cache) {
        const prDir = join(outputDir, DIRECTORIES.PULL_REQUESTS);
        if (existsSync(prDir)) {
          useCache = await promptUseCache();
        }
      }

      const results = await fetchGitHubPRs({
        config,
        outputDir,
        verbose: options.verbose,
        useCache,
      });

      const totalWritten = results.reduce((sum, r) => sum + r.prsWritten, 0);

      console.log(
        `\n${chalk.green('✓')} Fetched ${chalk.cyan(totalWritten)} PRs to ${chalk.gray(outputDir)}`,
      );
    } catch (error) {
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });
