import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  findConfigPath,
  getAnalysisFilePath,
  getOutputDirectory,
  loadConfig,
  readAllPRs,
  readAllTickets,
  writeMarkdownFile,
} from '@work-chronicler/core';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import { classifyPRImpact, generateStats } from '../analyzer';

export const analyzeCommand = new Command('analyze')
  .description('Analyze work history and generate stats')
  .option('-c, --config <path>', 'Path to config file')
  .option('--tag-prs', 'Update PR files with impact tags')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options) => {
    try {
      const configPath = findConfigPath(options.config);
      const config = await loadConfig(options.config);
      const outputDir = getOutputDirectory(config, configPath ?? undefined);

      const since = config.fetch.since;
      const until =
        config.fetch.until ?? new Date().toISOString().split('T')[0];

      console.log(chalk.cyan('Analyzing work history...\n'));
      console.log(`${chalk.gray('Date range:')} ${since} to ${until}`);
      console.log();

      // Load all data
      const spinner = ora('Loading PRs...').start();
      const prs = await readAllPRs(outputDir);
      spinner.text = 'Loading tickets...';
      const tickets = await readAllTickets(outputDir);
      spinner.succeed(
        `Loaded ${chalk.cyan(prs.length)} PRs and ${chalk.cyan(tickets.length)} tickets`,
      );

      // Generate stats
      spinner.start('Generating statistics...');
      const stats = generateStats(prs, tickets, since, until ?? '');
      spinner.succeed('Generated statistics');

      // Write stats file
      const statsPath = getAnalysisFilePath(outputDir, 'stats');
      const dir = dirname(statsPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(statsPath, JSON.stringify(stats, null, 2));
      console.log(`${chalk.green('✓')} Wrote ${chalk.cyan(statsPath)}`);

      // Optionally tag PRs with impact
      if (options.tagPrs) {
        spinner.start('Tagging PRs with impact levels...');
        let updated = 0;
        let skipped = 0;

        for (const pr of prs) {
          const currentImpact = pr.frontmatter.impact;
          const newImpact = classifyPRImpact(pr.frontmatter, config.analysis);

          // Only update if not already tagged or if impact changed
          if (currentImpact !== newImpact) {
            const updatedFrontmatter = {
              ...pr.frontmatter,
              impact: newImpact,
            };
            writeMarkdownFile(
              pr.filePath,
              updatedFrontmatter as unknown as Record<string, unknown>,
              pr.body,
            );
            updated++;

            if (options.verbose) {
              spinner.stop();
              console.log(
                `  ${chalk.green('✓')} ${pr.frontmatter.org}/${pr.frontmatter.repository}#${pr.frontmatter.prNumber}: ${chalk.yellow(newImpact)}`,
              );
              spinner.start('Tagging PRs with impact levels...');
            }
          } else {
            skipped++;
          }
        }

        spinner.succeed(
          `Tagged ${chalk.green(updated)} PRs${skipped > 0 ? chalk.gray(` (${skipped} already tagged)`) : ''}`,
        );
      }

      // Print summary
      console.log();
      console.log(chalk.cyan('Summary:'));
      console.log();

      console.log(chalk.bold('Pull Requests:'));
      console.log(`  Total: ${chalk.cyan(stats.prs.total)}`);
      console.log(
        `  Impact: ${chalk.magenta(stats.prs.byImpact.flagship)} flagship, ${chalk.green(stats.prs.byImpact.major)} major, ${chalk.yellow(stats.prs.byImpact.standard)} standard, ${chalk.gray(stats.prs.byImpact.minor)} minor`,
      );
      console.log(`  Merged: ${chalk.green(stats.prs.byState.merged ?? 0)}`);
      console.log(
        `  Linked to tickets: ${chalk.cyan(stats.links.prsWithTickets)}`,
      );
      console.log();

      console.log(chalk.bold('JIRA Tickets:'));
      console.log(`  Total: ${chalk.cyan(stats.tickets.total)}`);
      if (Object.keys(stats.tickets.byProject).length > 0) {
        console.log(
          `  Projects: ${Object.entries(stats.tickets.byProject)
            .map(([p, c]) => `${p} (${c})`)
            .join(', ')}`,
        );
      }
      console.log(`  Linked to PRs: ${chalk.cyan(stats.links.ticketsWithPRs)}`);
      console.log();

      console.log(chalk.bold('Top Repos:'));
      const topRepos = Object.entries(stats.prs.byRepo)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      for (const [repo, count] of topRepos) {
        console.log(`  ${repo}: ${chalk.cyan(count)} PRs`);
      }
    } catch (error) {
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });
