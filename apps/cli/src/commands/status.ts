import {
  findConfigPath,
  getOutputDirectory,
  loadConfig,
  readAllPRs,
  readAllTickets,
} from '@work-chronicler/core';
import { Command } from 'commander';

export const statusCommand = new Command('status')
  .description('Show status of fetched data')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      const configPath = findConfigPath(options.config);
      const config = await loadConfig(options.config);
      const outputDir = getOutputDirectory(config, configPath ?? undefined);

      const prs = await readAllPRs(outputDir);
      const tickets = await readAllTickets(outputDir);

      console.log('Work Chronicler Status');
      console.log('======================\n');
      console.log(`Config: ${configPath ?? 'Not found'}`);
      console.log(`Output directory: ${outputDir}`);
      console.log(
        `Date range: ${config.fetch.since} to ${config.fetch.until ?? 'now'}`,
      );
      console.log(`\nPull Requests: ${prs.length} files`);
      console.log(`JIRA Tickets:  ${tickets.length} files`);

      if (prs.length > 0 || tickets.length > 0) {
        console.log(
          '\nRun `work-chronicler link` to cross-reference PRs and tickets',
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
