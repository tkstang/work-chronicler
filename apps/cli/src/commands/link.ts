import { linkPRsToTickets } from '@linker/index';
import {
  findConfigPath,
  getOutputDirectory,
  loadConfig,
} from '@work-chronicler/core';
import chalk from 'chalk';
import { Command } from 'commander';

export const linkCommand = new Command('link')
  .description('Cross-reference PRs and JIRA tickets')
  .option('-c, --config <path>', 'Path to config file')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options) => {
    try {
      const configPath = findConfigPath(options.config);
      const config = await loadConfig(options.config);
      const outputDir = getOutputDirectory(config, configPath ?? undefined);

      const result = await linkPRsToTickets({
        config,
        outputDir,
        verbose: options.verbose,
      });

      console.log(
        `\n${chalk.green('✓')} Created ${chalk.cyan(result.linksFound)} links (${result.prsUpdated} PRs, ${result.ticketsUpdated} tickets updated)`,
      );
    } catch (error) {
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });
