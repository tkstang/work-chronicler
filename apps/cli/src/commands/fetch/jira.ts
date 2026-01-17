import {
  findConfigPath,
  getOutputDirectory,
  loadConfig,
} from '@work-chronicler/core';
import { Command } from 'commander';

export const fetchJiraCommand = new Command('fetch:jira')
  .description('Fetch tickets from JIRA')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      const configPath = findConfigPath(options.config);
      const config = await loadConfig(options.config);
      const outputDir = getOutputDirectory(config, configPath ?? undefined);

      if (!config.jira?.instances.length) {
        console.log('No JIRA instances configured');
        return;
      }

      console.log('Fetching JIRA tickets...\n');

      // TODO: Implement JIRA fetching
      // - Use jira.js to fetch tickets
      // - Filter by assignee and date range
      // - Write to work-log directory

      console.log('JIRA fetch not yet implemented');
      console.log(
        `Instances: ${config.jira.instances.map((i) => i.name).join(', ')}`,
      );
      console.log(`Output: ${outputDir}`);
    } catch (error) {
      console.error(
        'Error:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });
