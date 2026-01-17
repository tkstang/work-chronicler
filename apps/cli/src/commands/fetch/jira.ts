import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fetchJiraTickets } from '@fetchers/jira';
import { promptUseCache } from '@prompts';
import {
  DIRECTORIES,
  findConfigPath,
  getOutputDirectory,
  loadConfig,
} from '@work-chronicler/core';
import chalk from 'chalk';
import { Command } from 'commander';

export const fetchJiraCommand = new Command('fetch:jira')
  .description('Fetch tickets from JIRA')
  .option('-c, --config <path>', 'Path to config file')
  .option('-v, --verbose', 'Show detailed output')
  .option('--cache', 'Skip tickets that already exist in work log')
  .action(async (options) => {
    try {
      const configPath = findConfigPath(options.config);
      const config = await loadConfig(options.config);
      const outputDir = getOutputDirectory(config, configPath ?? undefined);

      // Determine cache behavior - prompt if data exists and --cache not specified
      let useCache = options.cache;
      if (!options.cache) {
        const jiraDir = join(outputDir, DIRECTORIES.JIRA);
        if (existsSync(jiraDir)) {
          useCache = await promptUseCache();
        }
      }

      const results = await fetchJiraTickets({
        config,
        outputDir,
        verbose: options.verbose,
        useCache,
      });

      const totalWritten = results.reduce(
        (sum, r) => sum + r.ticketsWritten,
        0,
      );

      console.log(
        `\n${chalk.green('✓')} Fetched ${chalk.cyan(totalWritten)} tickets to ${chalk.gray(outputDir)}`,
      );
    } catch (error) {
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });
