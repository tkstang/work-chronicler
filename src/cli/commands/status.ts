import { toCliError } from '@cli/errors';
import {
  findConfigPath,
  getOutputDirectory,
  loadConfig,
  readAllPRReviews,
  readAllPRs,
  readAllTickets,
} from '@core/index';
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
      const reviewRecords = await readAllPRReviews(outputDir);
      const reviewCount = reviewRecords.reduce(
        (sum, r) => sum + r.frontmatter.reviews.length,
        0,
      );
      const commentCount = reviewRecords.reduce(
        (sum, r) => sum + r.frontmatter.comments.length,
        0,
      );

      console.log('Work Chronicler Status');
      console.log('======================\n');
      console.log(`Config: ${configPath ?? 'Not found'}`);
      console.log(`Output directory: ${outputDir}`);
      console.log(
        `Date range: ${config.fetch.since} to ${config.fetch.until ?? 'now'}`,
      );
      console.log(`\nPull Requests: ${prs.length} files`);
      console.log(`JIRA Tickets:  ${tickets.length} files`);
      console.log(
        `PR Reviews:    ${reviewRecords.length} reviewed PRs (${reviewCount} reviews, ${commentCount} inline comments; not counted as authored PRs)`,
      );

      if (prs.length > 0 || tickets.length > 0) {
        console.log(
          '\nRun `work-chronicler link` to cross-reference PRs and tickets',
        );
      }
    } catch (error) {
      throw toCliError(error, 'Error:');
    }
  });
