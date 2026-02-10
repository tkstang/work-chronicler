/**
 * fetch all subcommand
 *
 * Fetches both GitHub PRs and JIRA tickets, then links them.
 */

import { findConfigPath, getOutputDirectory, loadConfig } from '@core/index';
import { linkPRsToTickets } from '@linker/index';
import { getActiveProfile } from '@workspace/global-config';
import { isManagerMode } from '@workspace/resolver';
import chalk from 'chalk';
import { Command } from 'commander';
import { resolveCacheBehavior } from './fetch.utils';
import {
  getReportById,
  resolveReportIds,
  resolveReportOutputDir,
} from './fetch-manager.utils';
import { fetchGitHubPRs } from './github/github.utils';
import { fetchJiraTickets } from './jira/jira.utils';

interface FetchAllOptions {
  config?: string;
  verbose?: boolean;
  cache?: boolean;
  link: boolean;
  report?: string;
  allReports?: boolean;
}

/**
 * Fetch all data in IC mode
 */
async function fetchAllICMode(options: FetchAllOptions): Promise<void> {
  const configPath = findConfigPath(options.config);
  const config = await loadConfig(options.config);
  const outputDir = getOutputDirectory(config, configPath ?? undefined);

  // Determine cache behavior - prompt if data exists and --cache not specified
  const useCache = await resolveCacheBehavior({
    outputDir,
    cacheFlag: options.cache,
    checkDirectories: ['github', 'jira'],
  });

  console.log(chalk.bold('\n📥 Fetching Work History\n'));
  console.log(`${chalk.gray('Output directory:')} ${outputDir}`);
  if (useCache) {
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
    useCache,
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
      useCache,
    });
    totalTickets = jiraResults.reduce((sum, r) => sum + r.ticketsWritten, 0);
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
  console.log(`  ${chalk.cyan('PRs fetched:')}      ${chalk.green(totalPRs)}`);
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
}

/**
 * Fetch all data in manager mode
 */
async function fetchAllManagerMode(options: FetchAllOptions): Promise<void> {
  const reportIds = await resolveReportIds(options);

  console.log(
    chalk.blue(`\n📥 Fetching all data for ${reportIds.length} report(s)...\n`),
  );

  // Load config once outside loop (for efficiency)
  const baseConfig = await loadConfig(options.config);

  for (let i = 0; i < reportIds.length; i++) {
    const reportId = reportIds[i]!;
    const report = getReportById(reportId);

    console.log(
      chalk.blue(
        `\n=== Fetching data for ${report.name} (${i + 1}/${reportIds.length}) ===\n`,
      ),
    );

    try {
      const outputDir = resolveReportOutputDir(reportId);

      // Override config with report's credentials
      const reportConfig = {
        ...baseConfig,
        github: {
          ...baseConfig.github,
          username: report.github, // Use report's GitHub username
        },
        jira: baseConfig.jira
          ? {
              ...baseConfig.jira,
              email: report.email, // Use report's Jira email
            }
          : undefined,
      };

      // Determine cache behavior - prompt if data exists and --cache not specified
      const useCache = await resolveCacheBehavior({
        outputDir,
        cacheFlag: options.cache,
        checkDirectories: ['github', 'jira'],
      });

      // Fetch GitHub PRs
      console.log(chalk.blue('📥 Fetching GitHub PRs...'));
      const githubResults = await fetchGitHubPRs({
        config: reportConfig,
        outputDir,
        verbose: options.verbose,
        useCache,
      });
      const totalPRs = githubResults.reduce((sum, r) => sum + r.prsWritten, 0);

      // Fetch Jira tickets
      console.log(chalk.blue('📥 Fetching Jira tickets...'));
      const jiraResults = await fetchJiraTickets({
        config: reportConfig,
        outputDir,
        verbose: options.verbose,
        useCache,
      });
      const totalTickets = jiraResults.reduce(
        (sum, r) => sum + r.ticketsWritten,
        0,
      );

      // Link PRs and tickets
      if (options.link !== false) {
        console.log(chalk.blue('🔗 Linking PRs to tickets...'));
        await linkPRsToTickets({
          config: reportConfig,
          outputDir,
          verbose: options.verbose,
        });
      }

      console.log(
        chalk.green(
          `✓ ${report.name} complete (${totalPRs} PRs, ${totalTickets} tickets)\n`,
        ),
      );
    } catch (error) {
      console.error(
        chalk.red(`✗ ${report.name} failed:`),
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  console.log(chalk.green('\n✓ All reports complete'));
}

export const allCommand = new Command('all')
  .description('Fetch both GitHub PRs and JIRA tickets, then link them')
  .option('-c, --config <path>', 'Path to config file')
  .option('-v, --verbose', 'Show detailed output')
  .option('--no-link', 'Skip linking PRs to tickets')
  .option('--cache', 'Skip items that already exist in work log')
  .option('--report <id>', 'Report ID (manager mode only)')
  .option('--all-reports', 'Fetch for all reports (manager mode only)')
  .action(async (options) => {
    try {
      const activeProfile = getActiveProfile();

      // Check for manager mode
      if (isManagerMode(activeProfile)) {
        await fetchAllManagerMode(options);
        return;
      }

      // IC mode - existing logic
      await fetchAllICMode(options);
    } catch (error) {
      console.error(
        chalk.red('\n❌ Error:'),
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });
