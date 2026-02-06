/**
 * fetch jira subcommand
 *
 * Fetches tickets from JIRA for the configured user and instances.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  DIRECTORIES,
  findConfigPath,
  getOutputDirectory,
  loadConfig,
} from '@core/index';
import { promptUseCache } from '@prompts';
import { getActiveProfile } from '@workspace/global-config';
import { isManagerMode } from '@workspace/resolver';
import chalk from 'chalk';
import { Command } from 'commander';
import {
  getReportById,
  resolveReportIds,
  resolveReportOutputDir,
} from '../fetch-manager.utils';
import { fetchJiraTickets } from './jira.utils';

/**
 * Fetch Jira tickets in IC mode
 */
async function fetchJiraICMode(options: any): Promise<void> {
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

  const totalWritten = results.reduce((sum, r) => sum + r.ticketsWritten, 0);

  console.log(
    `\n${chalk.green('✓')} Fetched ${chalk.cyan(totalWritten)} tickets to ${chalk.gray(outputDir)}`,
  );
}

/**
 * Fetch Jira tickets in manager mode
 */
async function fetchJiraManagerMode(options: any): Promise<void> {
  const reportIds = await resolveReportIds(options);

  console.log(
    chalk.blue(
      `\n📥 Fetching Jira tickets for ${reportIds.length} report(s)...\n`,
    ),
  );

  // Load base config (will be overridden per-report)
  const baseConfig = await loadConfig(options.config);

  for (let i = 0; i < reportIds.length; i++) {
    const reportId = reportIds[i]!;
    const report = getReportById(reportId);

    console.log(
      chalk.blue(
        `\nFetching data for ${report.name} (${i + 1}/${reportIds.length})...`,
      ),
    );

    try {
      const outputDir = resolveReportOutputDir(reportId);

      // Override jira.email with report's email (if Jira is configured)
      const reportConfig = {
        ...baseConfig,
        jira: baseConfig.jira
          ? {
              ...baseConfig.jira,
              email: report.email, // Use report's email, not manager's
            }
          : undefined,
      };

      // Determine cache behavior - prompt if data exists and --cache not specified
      let useCache = options.cache;
      if (!options.cache) {
        const jiraDir = join(outputDir, DIRECTORIES.JIRA);
        if (existsSync(jiraDir)) {
          useCache = await promptUseCache();
        }
      }

      const results = await fetchJiraTickets({
        config: reportConfig, // Use report-specific config
        outputDir,
        verbose: options.verbose,
        useCache,
      });

      const totalWritten = results.reduce(
        (sum, r) => sum + r.ticketsWritten,
        0,
      );

      console.log(
        chalk.green(
          `✓ ${report.name} complete (${totalWritten} tickets fetched)\n`,
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

export const jiraCommand = new Command('jira')
  .description('Fetch tickets from JIRA')
  .option('-c, --config <path>', 'Path to config file')
  .option('-v, --verbose', 'Show detailed output')
  .option('--cache', 'Skip tickets that already exist in work log')
  .option('--report <id>', 'Report ID (manager mode only)')
  .option('--all-reports', 'Fetch for all reports (manager mode only)')
  .action(async (options) => {
    try {
      const activeProfile = getActiveProfile();

      // Check for manager mode
      if (isManagerMode(activeProfile)) {
        await fetchJiraManagerMode(options);
        return;
      }

      // IC mode - existing logic
      await fetchJiraICMode(options);
    } catch (error) {
      console.error(
        chalk.red('\n❌ Error:'),
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });
