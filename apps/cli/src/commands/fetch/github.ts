import {
  findConfigPath,
  getOutputDirectory,
  loadConfig,
} from '@work-chronicler/core';
import { Command } from 'commander';

export const fetchGitHubCommand = new Command('fetch:github')
  .description('Fetch pull requests from GitHub')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      const configPath = findConfigPath(options.config);
      const config = await loadConfig(options.config);
      const outputDir = getOutputDirectory(config, configPath ?? undefined);

      console.log('Fetching GitHub PRs...\n');

      // TODO: Implement GitHub fetching
      // - Use Octokit to fetch PRs
      // - Filter by author and date range
      // - Write to work-log directory

      console.log('GitHub fetch not yet implemented');
      console.log(`GitHub username: ${config.github.username}`);
      console.log(`Orgs: ${config.github.orgs.map((o) => o.name).join(', ')}`);
      console.log(`Output: ${outputDir}`);
    } catch (error) {
      console.error(
        'Error:',
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });
