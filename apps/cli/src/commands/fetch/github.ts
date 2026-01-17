import { fetchGitHubPRs } from '@fetchers/github';
import {
  findConfigPath,
  getOutputDirectory,
  loadConfig,
} from '@work-chronicler/core';
import chalk from 'chalk';
import { Command } from 'commander';

export const fetchGitHubCommand = new Command('fetch:github')
  .description('Fetch pull requests from GitHub')
  .option('-c, --config <path>', 'Path to config file')
  .option('-v, --verbose', 'Show detailed output')
  .option('--cache', 'Skip PRs that already exist in work log')
  .action(async (options) => {
    try {
      const configPath = findConfigPath(options.config);
      const config = await loadConfig(options.config);
      const outputDir = getOutputDirectory(config, configPath ?? undefined);

      const results = await fetchGitHubPRs({
        config,
        outputDir,
        verbose: options.verbose,
        useCache: options.cache,
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
