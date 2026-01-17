import { fetchGitHubPRs } from '@fetchers/github';
import { fetchJiraTickets } from '@fetchers/jira';
import { linkPRsToTickets } from '@linker/index';
import {
  findConfigPath,
  getOutputDirectory,
  loadConfig,
} from '@work-chronicler/core';
import chalk from 'chalk';
import { Command } from 'commander';

export const fetchAllCommand = new Command('fetch:all')
  .description('Fetch both GitHub PRs and JIRA tickets, then link them')
  .option('-c, --config <path>', 'Path to config file')
  .option('-v, --verbose', 'Show detailed output')
  .option('--no-link', 'Skip linking PRs to tickets')
  .option('--cache', 'Skip items that already exist in work log')
  .action(async (options) => {
    try {
      const configPath = findConfigPath(options.config);
      const config = await loadConfig(options.config);
      const outputDir = getOutputDirectory(config, configPath ?? undefined);

      console.log(chalk.bold('\n📥 Fetching Work History\n'));
      console.log(`${chalk.gray('Output directory:')} ${outputDir}`);
      if (options.cache) {
        console.log(
          `${chalk.gray('Cache mode:')} ${chalk.cyan('enabled')} (skipping existing items)`,
        );
      }
      console.log();

      // Fetch GitHub PRs
      console.log(chalk.bold.underline('Step 1/3: GitHub PRs\n'));
      const githubResults = await fetchGitHubPRs({
        config,
        outputDir,
        verbose: options.verbose,
        useCache: options.cache,
      });
      const totalPRs = githubResults.reduce((sum, r) => sum + r.prsWritten, 0);

      // Fetch JIRA tickets
      let totalTickets = 0;
      if (config.jira?.instances.length) {
        console.log(chalk.bold.underline('\nStep 2/3: JIRA Tickets\n'));
        const jiraResults = await fetchJiraTickets({
          config,
          outputDir,
          verbose: options.verbose,
          useCache: options.cache,
        });
        totalTickets = jiraResults.reduce(
          (sum, r) => sum + r.ticketsWritten,
          0,
        );
      } else {
        console.log(chalk.bold.underline('\nStep 2/3: JIRA Tickets\n'));
        console.log(chalk.gray('No JIRA instances configured, skipping...\n'));
      }

      // Link PRs to tickets
      let linksCreated = 0;
      if (options.link !== false && totalPRs > 0) {
        console.log(chalk.bold.underline('\nStep 3/3: Linking\n'));
        const linkResult = await linkPRsToTickets({
          config,
          outputDir,
          verbose: options.verbose,
        });
        linksCreated = linkResult.linksFound;
      } else if (options.link === false) {
        console.log(chalk.bold.underline('\nStep 3/3: Linking\n'));
        console.log(chalk.gray('Linking skipped (--no-link flag)\n'));
      }

      // Summary
      const separator = '═'.repeat(40);
      console.log(chalk.bold(`\n${separator}`));
      console.log(chalk.bold('📊 Summary'));
      console.log(separator);
      console.log(
        `  ${chalk.cyan('PRs fetched:')}      ${chalk.green(totalPRs)}`,
      );
      console.log(
        `  ${chalk.cyan('Tickets fetched:')} ${chalk.green(totalTickets)}`,
      );
      console.log(
        `  ${chalk.cyan('Links created:')}   ${chalk.green(linksCreated)}`,
      );
      console.log(`${separator}\n`);

      console.log(
        `${chalk.green('✓')} Done! Data saved to ${chalk.cyan(outputDir)}`,
      );
    } catch (error) {
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });
