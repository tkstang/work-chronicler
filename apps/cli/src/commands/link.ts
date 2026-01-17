import {
  findConfigPath,
  getOutputDirectory,
  loadConfig,
} from '@work-chronicler/core';
import { Command } from 'commander';

export const linkCommand = new Command('link')
  .description('Cross-reference PRs and JIRA tickets')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      const configPath = findConfigPath(options.config);
      const config = await loadConfig(options.config);
      const outputDir = getOutputDirectory(config, configPath ?? undefined);

      console.log('Linking PRs to JIRA tickets...\n');

      // TODO: Implement linking logic
      // - Read all PRs
      // - Extract JIRA ticket keys from PR titles/descriptions
      // - Update PR frontmatter with linked tickets
      // - Update ticket frontmatter with linked PRs

      console.log('Link command not yet implemented');
      console.log(`Would operate on: ${outputDir}`);
    } catch (error) {
      console.error(
        'Error:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });
