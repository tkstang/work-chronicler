import { toCliError } from '@cli/errors';
import {
  clearFilteredSubset,
  findConfigPath,
  getOutputDirectory,
  loadConfig,
} from '@core/index';
import { promptFilterInteractive } from '@prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';

import {
  describeFilters,
  type FilterCriteria,
  writeFilteredSubset,
} from './filter.utils';

function ratio(part: number, whole: number): string {
  return whole > 0
    ? `${part} / ${whole} (${Math.round((part / whole) * 100)}%)`
    : `${part} / ${whole}`;
}

function printWarnings(warnings: string[]): void {
  for (const warning of warnings) {
    console.log(chalk.yellow('Warning:'), warning);
  }
}

export const filterCommand = new Command('filter')
  .description(
    'Replace the filtered/ subset of the work log that read commands use',
  )
  .option('-c, --config <path>', 'Path to config file')
  .option(
    '--exclude-impact <levels...>',
    'Exclude PRs with these impact levels (minor, standard, major, flagship)',
  )
  .option(
    '--min-impact <level>',
    'Minimum impact level to include (minor, standard, major, flagship)',
  )
  .option('--min-loc <lines>', 'Minimum lines of code changed', parseInt)
  .option(
    '--linked-only',
    'Only include PRs linked to tickets, tickets linked to PRs, and messages mentioning either',
  )
  .option('--merged-only', 'Only include merged PRs')
  .option(
    '--exclude-status <statuses...>',
    'Exclude tickets with these statuses (e.g., "To Do", "Rejected")',
  )
  .option('--org <orgs...>', 'Only include PRs from these GitHub orgs')
  .option('--exclude-org <orgs...>', 'Exclude PRs from these GitHub orgs')
  .option(
    '--repo <repos...>',
    'Only include PRs from these repos (format: org/repo)',
  )
  .option(
    '--exclude-repo <repos...>',
    'Exclude PRs from these repos (format: org/repo)',
  )
  .option('--clear', 'Remove the filtered subset (use the full work log)')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options) => {
    try {
      const configPath = findConfigPath(options.config);
      const config = await loadConfig(options.config);
      const outputDir = getOutputDirectory(config, configPath ?? undefined);

      if (options.clear) {
        const { cleared, warnings } = clearFilteredSubset(outputDir);
        if (cleared) {
          console.log(chalk.green('✓'), 'Cleared filtered data');
        } else {
          console.log(chalk.yellow('No filtered data to clear'));
        }
        printWarnings(warnings);
        return;
      }

      console.log(chalk.cyan('Filtering work-log...\n'));

      const criteria: FilterCriteria = {
        excludeImpact: options.excludeImpact,
        minImpact: options.minImpact,
        minLoc: options.minLoc,
        linkedOnly: options.linkedOnly,
        mergedOnly: options.mergedOnly,
        excludeStatus: options.excludeStatus,
        org: options.org,
        excludeOrg: options.excludeOrg,
        repo: options.repo,
        excludeRepo: options.excludeRepo,
      };

      // If no filters specified, prompt interactively
      if (describeFilters(criteria).length === 0) {
        console.log(
          chalk.cyan('No filters specified. Starting interactive mode...\n'),
        );
        const prompted = await promptFilterInteractive();
        criteria.excludeImpact = prompted.excludeImpact;
        criteria.minImpact = prompted.minImpact ?? undefined;
        criteria.minLoc = prompted.minLoc ?? undefined;
        criteria.linkedOnly = prompted.linkedOnly;
        criteria.mergedOnly = prompted.mergedOnly;
        criteria.excludeStatus = prompted.excludeStatus;

        if (describeFilters(criteria).length === 0) {
          console.log(chalk.yellow('No filters selected. Exiting.'));
          return;
        }
        console.log();
      }

      console.log(chalk.gray('Filters:'));
      for (const f of describeFilters(criteria)) {
        console.log(`  - ${f}`);
      }
      console.log();

      const spinner = ora('Building the filtered subset...').start();
      let result: Awaited<ReturnType<typeof writeFilteredSubset>>;
      try {
        result = await writeFilteredSubset({ outputDir, config, criteria });
      } catch (error) {
        spinner.fail('The filtered subset was not changed');
        throw error;
      }
      spinner.succeed(`Wrote filtered files to ${chalk.cyan(result.dir)}`);
      printWarnings(result.warnings);

      const { counts, totals, stats } = result;
      console.log();
      console.log(chalk.cyan('Filtered Summary:'));
      console.log(`  PRs: ${ratio(counts.pullRequests, totals.pullRequests)}`);
      console.log(`  Tickets: ${ratio(counts.tickets, totals.tickets)}`);
      if (totals.prReviews > 0) {
        console.log(
          `  Reviewed PRs: ${ratio(counts.prReviews, totals.prReviews)} (org and repo filters only)`,
        );
      }
      if (totals.messages > 0) {
        console.log(
          `  Messages: ${ratio(counts.messages, totals.messages)} (supplementary evidence; only --linked-only applies)`,
        );
      }
      console.log(
        `  Impact: ${chalk.magenta(stats.prs.byImpact.flagship)} flagship, ${chalk.green(stats.prs.byImpact.major)} major, ${chalk.yellow(stats.prs.byImpact.standard)} standard, ${chalk.gray(stats.prs.byImpact.minor)} minor`,
      );
      if (
        counts.pullRequests +
          counts.tickets +
          counts.prReviews +
          counts.messages ===
        0
      ) {
        console.log(
          chalk.yellow(
            '\nNothing matched. The empty subset is still used by `analyze` and the MCP server; run `work-chronicler filter --clear` to use the full work log.',
          ),
        );
      }
    } catch (error) {
      throw toCliError(error, chalk.red('Error:'));
    }
  });
