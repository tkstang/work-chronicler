/**
 * fetch github subcommand
 *
 * Fetches pull requests from GitHub for the configured user and organizations.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { toCliError } from '@cli/errors';
import {
  buildReportConfig,
  getReportById,
  loadManagerConfigForFetch,
  resolveReportIds,
  resolveReportOutputDir,
} from '@commands/fetch/fetch-manager.utils';
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

import { fetchGitHubPRs, RateLimitError } from './github.utils';

interface FetchGitHubOptions {
  config?: string;
  verbose?: boolean;
  cache?: boolean;
  report?: string;
  allReports?: boolean;
}

/**
 * Fetch GitHub PRs in IC mode
 */
async function fetchGitHubICMode(options: FetchGitHubOptions): Promise<void> {
  const configPath = findConfigPath(options.config);
  const config = await loadConfig(options.config);
  const outputDir = getOutputDirectory(config, configPath ?? undefined);

  // Determine cache behavior - prompt if data exists and --cache not specified
  let useCache = options.cache;
  if (!options.cache) {
    const prDir = join(outputDir, DIRECTORIES.PULL_REQUESTS);
    if (existsSync(prDir)) {
      useCache = await promptUseCache();
    }
  }

  const results = await fetchGitHubPRs({
    config,
    outputDir,
    verbose: options.verbose,
    useCache,
  });

  const totalWritten = results.reduce((sum, r) => sum + r.prsWritten, 0);

  console.log(
    `\n${process.exitCode ? chalk.yellow('⚠') : chalk.green('✓')} Fetched ${chalk.cyan(totalWritten)} PRs to ${chalk.gray(outputDir)}`,
  );
}

/**
 * Fetch GitHub PRs in manager mode
 */
async function fetchGitHubManagerMode(
  options: FetchGitHubOptions,
): Promise<void> {
  const reportIds = await resolveReportIds(options);

  console.log(
    chalk.blue(
      `\n📥 Fetching GitHub PRs for ${reportIds.length} report(s)...\n`,
    ),
  );

  // Load manager config
  const managerConfig = loadManagerConfigForFetch();

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

      // Build IC-compatible config from manager config + report
      const reportConfig = buildReportConfig(managerConfig, report);

      // Determine cache behavior - prompt if data exists and --cache not specified
      let useCache = options.cache;
      if (!options.cache) {
        const prDir = join(outputDir, DIRECTORIES.PULL_REQUESTS);
        if (existsSync(prDir)) {
          useCache = await promptUseCache();
        }
      }

      const results = await fetchGitHubPRs({
        config: reportConfig, // Use report-specific config
        outputDir,
        verbose: options.verbose,
        useCache,
      });

      const totalWritten = results.reduce((sum, r) => sum + r.prsWritten, 0);

      console.log(
        chalk.green(
          `✓ ${report.name} complete (${totalWritten} PRs fetched)\n`,
        ),
      );
    } catch (error) {
      // Later reports share the same token, so a rate limit stops the run
      if (error instanceof RateLimitError) throw error;
      process.exitCode = 1;
      console.error(
        chalk.red(`✗ ${report.name} failed:`),
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  console.log(
    process.exitCode
      ? chalk.yellow('\n⚠ All reports processed, with warnings (see above)')
      : chalk.green('\n✓ All reports complete'),
  );
}

export const githubCommand = new Command('github')
  .description('Fetch pull requests from GitHub')
  .option('-c, --config <path>', 'Path to config file')
  .option('-v, --verbose', 'Show detailed output')
  .option('--cache', 'Skip PRs that already exist in work log')
  .option('--report <id>', 'Report ID (manager mode only)')
  .option('--all-reports', 'Fetch for all reports (manager mode only)')
  .action(async (options) => {
    try {
      const activeProfile = getActiveProfile();

      // Check for manager mode
      if (isManagerMode(activeProfile)) {
        await fetchGitHubManagerMode(options);
        return;
      }

      // IC mode - existing logic
      await fetchGitHubICMode(options);
    } catch (error) {
      throw toCliError(error, chalk.red('\n❌ Error:'));
    }
  });
