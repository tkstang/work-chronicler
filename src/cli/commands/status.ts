import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { toCliError } from '@cli/errors';
import { TRANSACTION_NAME } from '@core/import/transaction';
import {
  DIRECTORIES,
  type FilteredSubsetState,
  findConfigPath,
  getFilteredSubsetState,
  getOutputDirectory,
  loadConfig,
  readAllPRReviews,
  readAllPRs,
  readAllTickets,
  scanImportedRecords,
  splitReviewRecordsByReviewer,
} from '@core/index';
import { Command } from 'commander';

/** How many unreadable imported record files to name */
const SKIPPED_SHOWN = 3;

function describeSubset(outputDir: string): string[] {
  let state: FilteredSubsetState;
  try {
    state = getFilteredSubsetState(outputDir);
  } catch (error) {
    return [
      `Filtered subset: cannot be read (${error instanceof Error ? error.message : String(error)})`,
    ];
  }

  if (state.status === 'none') {
    return ['Filtered subset: none (read commands use the full work log)'];
  }
  if (state.status === 'interrupted' && state.locked) {
    return [
      'Filtered subset: a `work-chronicler filter` run is replacing filtered/ right now (it holds .filter-lock); `analyze` (without `--full`) and the MCP server refuse to run until it finishes. If no filter is running, run `work-chronicler filter` again or `work-chronicler filter --clear`.',
    ];
  }
  if (state.status === 'interrupted') {
    return [
      'Filtered subset: a `work-chronicler filter` run was interrupted while replacing filtered/; `analyze` (without `--full`) and the MCP server refuse to run until you run `work-chronicler filter` again (it restores the previous subset first) or `work-chronicler filter --clear`.',
    ];
  }

  const lines: string[] = [];
  const { selection } = state;
  if (selection) {
    const { counts } = selection;
    lines.push(
      `Filtered subset: in use by \`analyze\` and the MCP server (${counts.pullRequests} PRs, ${counts.tickets} tickets, ${counts.prReviews} reviewed PRs, ${counts.messages} messages; filters: ${selection.filters.join('; ') || 'none'}). Run \`work-chronicler filter --clear\` to use the full work log.`,
    );
  } else {
    lines.push(
      'Filtered subset: in use by `analyze` and the MCP server (made before 0.6.0; run `work-chronicler filter` again to record its filters, or `work-chronicler filter --clear` to use the full work log).',
    );
  }
  if (state.missing.includes(DIRECTORIES.PR_REVIEWS)) {
    lines.push(
      'The filtered/ subset was created before PR reviews were fetched and does not include them. Re-run `work-chronicler filter` to add them.',
    );
  }
  if (state.missing.includes(DIRECTORIES.MESSAGES)) {
    lines.push(
      'The filtered/ subset was created before messages were imported and does not include them. Re-run `work-chronicler filter` to add them.',
    );
  }
  return lines;
}

export const statusCommand = new Command('status')
  .description('Show status of fetched and imported data')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      const configPath = findConfigPath(options.config);
      const config = await loadConfig(options.config);
      const outputDir = getOutputDirectory(config, configPath ?? undefined);

      const prs = await readAllPRs(outputDir);
      const tickets = await readAllTickets(outputDir);
      // Records written for another GitHub user are not this user's work
      const {
        own: reviewRecords,
        foreign,
        foreignReviewers,
      } = splitReviewRecordsByReviewer(
        await readAllPRReviews(outputDir),
        config.github.username,
      );
      const reviewCount = reviewRecords.reduce(
        (sum, r) => sum + r.frontmatter.reviews.length,
        0,
      );
      const commentCount = reviewRecords.reduce(
        (sum, r) => sum + r.frontmatter.comments.length,
        0,
      );
      const imported = scanImportedRecords(outputDir);
      const messages = imported.records.filter(
        (r) => r.frontmatter.type === 'message',
      );
      const bySource = new Map<string, number>();
      for (const message of messages) {
        const source = message.frontmatter.source;
        bySource.set(source, (bySource.get(source) ?? 0) + 1);
      }
      const unverified = messages.filter(
        (m) => m.frontmatter.attribution.status === 'unverified',
      ).length;

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
      const sources = [...bySource.entries()]
        .map(([source, count]) => `${source} ${count}`)
        .join(', ');
      console.log(
        `Messages:      ${messages.length} imported (${sources ? `${sources}; ` : ''}supplementary evidence, not counted as PRs or tickets${unverified > 0 ? `; ${unverified} with unverified attribution` : ''})`,
      );
      if (imported.skipped.length > 0) {
        console.log(
          `\n${imported.skipped.length} imported record file(s) could not be read and are ignored:`,
        );
        for (const { filePath, reason } of imported.skipped.slice(
          0,
          SKIPPED_SHOWN,
        )) {
          console.log(`  ${filePath}: ${reason}`);
        }
        if (imported.skipped.length > SKIPPED_SHOWN) {
          console.log(
            `  ...and ${imported.skipped.length - SKIPPED_SHOWN} more`,
          );
        }
      }
      if (foreign.length > 0) {
        console.log(
          `\n${foreign.length} review record(s) in pr-reviews/ belong to another GitHub user (${foreignReviewers.join(', ')}), not ${config.github.username}, and are not counted. Use a separate profile or output directory for each person, or remove them.`,
        );
      }
      if (existsSync(join(outputDir, TRANSACTION_NAME))) {
        console.log(
          `\nAn import is running or did not finish (${TRANSACTION_NAME}/ exists). If no import is running, run \`work-chronicler import\` again (an empty directory will do) to finish it; until then \`work-chronicler validate\` reports RECOVERY_REQUIRED.`,
        );
      }

      console.log();
      for (const line of describeSubset(outputDir)) {
        console.log(line);
      }

      if (prs.length > 0 || tickets.length > 0) {
        console.log(
          '\nRun `work-chronicler link` to cross-reference PRs and tickets',
        );
      }
    } catch (error) {
      throw toCliError(error, 'Error:');
    }
  });
