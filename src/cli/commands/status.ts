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
  readWorkLogLockHolders,
  scanImportedRecords,
  splitReviewRecordsByReviewer,
} from '@core/index';
import { Command } from 'commander';

/** How many unreadable imported record files to name */
const SKIPPED_SHOWN = 3;

/**
 * The work-log lock (shared by `import` and `filter`), when it is held: who
 * holds it and how to recover, one line per run holding it. While it is
 * held, `import`, `filter` and `filter --clear` are refused, so the subset
 * lines do not recommend them.
 */
function describeLock(outputDir: string): string[] {
  let holders: ReturnType<typeof readWorkLogLockHolders>;
  try {
    holders = readWorkLogLockHolders(outputDir);
  } catch {
    return [];
  }
  // A run holds every name of the lock with one owner: name it once
  const byRun = new Map<string, typeof holders>();
  for (const holder of holders) {
    const key = holder.owner
      ? JSON.stringify([holder.owner.runId, holder.owner.pid])
      : holder.path;
    byRun.set(key, [...(byRun.get(key) ?? []), holder]);
  }
  return [...byRun.values()].map((group) => {
    const [first] = group;
    const paths = group.map((holder) => holder.path).join(' and ');
    const command = first?.command ?? 'import';
    const owner = first?.owner;
    const who = owner
      ? `\`work-chronicler ${command}\` (process ${owner.pid} on ${owner.hostname}, started ${new Date(owner.startedAt).toISOString()})`
      : 'an owner that cannot be read';
    return `Work-log lock: ${paths} ${group.length > 1 ? 'are' : 'is'} held by ${who}. \`work-chronicler import\`, \`filter\` and \`filter --clear\` are refused while it is held. If that run is still going, wait for it; if you know no ${command} is running (it was stopped, or the machine was renamed), remove ${paths}.`;
  });
}

function describeSubset(outputDir: string, locked: boolean): string[] {
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
  if (state.status === 'interrupted' && locked) {
    return [
      'Filtered subset: a `work-chronicler filter` run is replacing filtered/ (see the work-log lock below); `analyze` (without `--full`) refuses to run and MCP tools return no results until it finishes or the lock is removed.',
    ];
  }
  if (state.status === 'interrupted') {
    return [
      'Filtered subset: a `work-chronicler filter` run was interrupted while replacing filtered/; `analyze` (without `--full`) refuses to run and MCP tools return no results until you run `work-chronicler filter` again (it restores the previous subset first) or `work-chronicler filter --clear`.',
    ];
  }

  const clearAdvice = locked
    ? ''
    : ' Run `work-chronicler filter --clear` to use the full work log.';
  const lines: string[] = [];
  const { selection } = state;
  if (selection) {
    const { counts } = selection;
    lines.push(
      `Filtered subset: in use by \`analyze\` and the MCP server (${counts.pullRequests} PRs, ${counts.tickets} tickets, ${counts.prReviews} reviewed PRs, ${counts.messages} messages; filters: ${selection.filters.join('; ') || 'none'}).${clearAdvice}`,
    );
  } else {
    lines.push(
      locked
        ? 'Filtered subset: in use by `analyze` and the MCP server (made before 0.6.0).'
        : 'Filtered subset: in use by `analyze` and the MCP server (made before 0.6.0; run `work-chronicler filter` again to record its filters, or `work-chronicler filter --clear` to use the full work log).',
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
      // Records written for another GitHub user are not this user's work,
      // and without a configured username none can be shown to be theirs
      const allReviewRecords = await readAllPRReviews(outputDir);
      const username = config.github.username;
      const {
        own: reviewRecords,
        foreign,
        foreignReviewers,
      } = username
        ? splitReviewRecordsByReviewer(allReviewRecords, username)
        : { own: [], foreign: [], foreignReviewers: [] };
      const unattributedReviewers = username
        ? []
        : [...new Set(allReviewRecords.map((r) => r.frontmatter.reviewer))];
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
      if (!username && allReviewRecords.length > 0) {
        console.log(
          `\n${allReviewRecords.length} review record(s) in pr-reviews/ (reviewer: ${unattributedReviewers.join(', ')}) are not counted: github.username is not set, so they cannot be attributed to you. Set github.username in the config to count your own.`,
        );
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
      const lock = describeLock(outputDir);
      for (const line of describeSubset(outputDir, lock.length > 0)) {
        console.log(line);
      }
      for (const line of lock) console.log(line);

      if (prs.length > 0 || tickets.length > 0) {
        console.log(
          '\nRun `work-chronicler link` to cross-reference PRs and tickets',
        );
      }
    } catch (error) {
      throw toCliError(error, 'Error:');
    }
  });
