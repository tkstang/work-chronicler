import {
  findConfigPath,
  getOutputDirectory,
  loadConfig,
} from '@work-chronicler/core';
import { Command } from 'commander';

export const fetchAllCommand = new Command('fetch:all')
  .description('Fetch both GitHub PRs and JIRA tickets')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      const configPath = findConfigPath(options.config);
      const config = await loadConfig(options.config);
      const outputDir = getOutputDirectory(config, configPath ?? undefined);

      console.log('Fetching all data...\n');

      // TODO: Implement combined fetching
      // - Fetch GitHub PRs
      // - Fetch JIRA tickets
      // - Report totals

      console.log('Combined fetch not yet implemented');
      console.log(`Output: ${outputDir}`);
      console.log(`\nWould fetch:`);
      console.log(`  - GitHub PRs for ${config.github.username}`);
      if (config.jira?.instances.length) {
        console.log(
          `  - JIRA tickets from ${config.jira.instances.length} instance(s)`,
        );
      }
    } catch (error) {
      console.error(
        'Error:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });
