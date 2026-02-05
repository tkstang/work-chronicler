/**
 * analyze reports command
 *
 * Generate per-report analysis (manager mode only).
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  classifyPRImpact,
  detectProjects,
  generateStats,
  generateTimeline,
} from '@cli/analyzer';
import {
  getAnalysisFilePath,
  readAllPRs,
  readAllTickets,
  writeMarkdownFile,
} from '@core/index';
import { getActiveProfile } from '@workspace/global-config';
import {
  getReportAnalysisDir,
  getReportWorkLogDir,
  isManagerMode,
} from '@workspace/resolver';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';

/**
 * analyze reports <id> command
 */
export const reportsCommand = new Command('reports')
  .description('Generate per-report analysis (manager mode only)')
  .argument('<id>', 'Report ID (e.g., "alice-smith")')
  .option('--tag-prs', 'Update PR files with impact tags')
  .option('--projects', 'Detect and group related PRs/tickets into projects')
  .option('--timeline', 'Generate chronological timeline grouped by week/month')
  .option('--all', 'Run all analysis (tag-prs, projects, timeline)')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (reportId: string, options) => {
    try {
      const activeProfile = getActiveProfile();

      if (!isManagerMode(activeProfile)) {
        console.error(
          chalk.red(
            '\n❌ Error: "analyze reports" command only available in manager mode.',
          ),
        );
        console.log(
          chalk.gray('Use "analyze" without subcommands for IC mode analysis.'),
        );
        process.exit(1);
      }

      const profileName = activeProfile;

      // Get report-specific paths
      const workLogDir = getReportWorkLogDir(profileName, reportId);
      const analysisDir = getReportAnalysisDir(profileName, reportId);

      // Ensure directories exist
      if (!existsSync(workLogDir)) {
        console.error(
          chalk.red(
            `\n❌ Error: Work-log directory not found for report "${reportId}"`,
          ),
        );
        console.log(chalk.gray(`Expected: ${workLogDir}`));
        process.exit(1);
      }

      if (!existsSync(analysisDir)) {
        mkdirSync(analysisDir, { recursive: true });
      }

      // Determine what to analyze
      const hasAnalysisFlags =
        options.tagPrs || options.projects || options.timeline || options.all;

      const analyzeOpts = {
        tagPrs: options.tagPrs || options.all || !hasAnalysisFlags,
        projects: options.projects || options.all || !hasAnalysisFlags,
        timeline: options.timeline || options.all || !hasAnalysisFlags,
      };

      console.log(chalk.cyan(`\n📊 Analyzing ${chalk.bold(reportId)}...\n`));

      // Load all data
      const spinner = ora('Loading PRs...').start();
      const prs = await readAllPRs(workLogDir);
      spinner.text = 'Loading tickets...';
      const tickets = await readAllTickets(workLogDir);
      spinner.succeed(
        `Loaded ${chalk.cyan(prs.length)} PRs and ${chalk.cyan(tickets.length)} tickets`,
      );

      // Determine date range from data
      const today = new Date().toISOString().split('T')[0];
      if (!today) {
        throw new Error('Failed to generate current date');
      }

      let since: string = today;
      let until: string = today;

      if (prs.length > 0) {
        const dates = prs
          .map((pr) => pr.frontmatter.mergedAt || pr.frontmatter.createdAt)
          .filter((d): d is string => Boolean(d))
          .map((d) => {
            const datePart = d.split('T')[0];
            return datePart;
          })
          .filter((d): d is string => Boolean(d))
          .sort();

        if (dates.length > 0) {
          const firstDate = dates[0];
          const lastDate = dates[dates.length - 1];
          if (firstDate && lastDate) {
            since = firstDate;
            until = lastDate;
          }
        }
      } else {
        console.log(
          chalk.yellow(
            'Warning: No date range found in data, using current date',
          ),
        );
      }

      console.log(`${chalk.gray('Date range:')} ${since} to ${until}`);
      console.log();

      // Generate stats
      spinner.start('Generating statistics...');
      const stats = generateStats(prs, tickets, since, until);
      spinner.succeed('Generated statistics');

      // Write stats file
      const statsPath = getAnalysisFilePath(analysisDir, 'stats');
      const dir = dirname(statsPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(statsPath, JSON.stringify(stats, null, 2));
      console.log(`${chalk.green('✓')} Wrote ${chalk.cyan(statsPath)}`);

      // Optionally tag PRs with impact
      if (analyzeOpts.tagPrs) {
        spinner.start('Tagging PRs with impact levels...');
        let updated = 0;
        let skipped = 0;

        for (const pr of prs) {
          const currentImpact = pr.frontmatter.impact;
          // Use default thresholds for manager mode - could be configurable later
          const newImpact = classifyPRImpact(pr.frontmatter);

          // Only update if not already tagged or if impact changed
          if (currentImpact !== newImpact) {
            const updatedFrontmatter = {
              ...pr.frontmatter,
              impact: newImpact,
            };
            writeMarkdownFile(pr.filePath, updatedFrontmatter, pr.body);
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

      // Detect projects if requested
      if (analyzeOpts.projects) {
        console.log();
        spinner.start('Detecting projects...');
        const projectsAnalysis = detectProjects(prs, tickets, since, until);
        spinner.succeed(
          `Detected ${chalk.cyan(projectsAnalysis.summary.totalProjects)} projects`,
        );

        // Write projects file
        const projectsPath = getAnalysisFilePath(analysisDir, 'projects');
        writeFileSync(projectsPath, JSON.stringify(projectsAnalysis, null, 2));
        console.log(`${chalk.green('✓')} Wrote ${chalk.cyan(projectsPath)}`);

        // Print project summary
        console.log();
        console.log(chalk.bold('Projects Detected:'));
        console.log(
          `  By confidence: ${chalk.green(projectsAnalysis.summary.byConfidence.high)} high, ${chalk.yellow(projectsAnalysis.summary.byConfidence.medium)} medium, ${chalk.gray(projectsAnalysis.summary.byConfidence.low)} low`,
        );
        console.log(
          `  By signal: ${chalk.cyan(projectsAnalysis.summary.bySignal.tickets)} ticket-based`,
        );
        if (projectsAnalysis.summary.unassignedPRs > 0) {
          console.log(
            `  Unassigned PRs: ${chalk.gray(projectsAnalysis.summary.unassignedPRs)}`,
          );
        }

        // Show top projects
        if (projectsAnalysis.projects.length > 0) {
          console.log();
          console.log(chalk.bold('Top Projects:'));
          const topProjects = projectsAnalysis.projects.slice(0, 5);
          for (const project of topProjects) {
            const confidenceColor =
              project.confidence === 'high'
                ? chalk.green
                : project.confidence === 'medium'
                  ? chalk.yellow
                  : chalk.gray;
            console.log(
              `  ${confidenceColor('●')} ${project.name} (${chalk.cyan(project.stats.prCount)} PRs, ${chalk.cyan(project.stats.ticketCount)} tickets)`,
            );
          }
        }
      }

      // Generate timeline if requested
      if (analyzeOpts.timeline) {
        console.log();
        spinner.start('Generating timeline...');
        const timeline = generateTimeline(prs, tickets, since, until);
        spinner.succeed(
          `Generated timeline: ${chalk.cyan(timeline.summary.totalMonths)} months, ${chalk.cyan(timeline.summary.totalWeeks)} weeks`,
        );

        // Write timeline file
        const timelinePath = getAnalysisFilePath(analysisDir, 'timeline');
        writeFileSync(timelinePath, JSON.stringify(timeline, null, 2));
        console.log(`${chalk.green('✓')} Wrote ${chalk.cyan(timelinePath)}`);

        // Print timeline summary
        console.log();
        console.log(chalk.bold('Timeline Summary:'));
        if (timeline.summary.busiestWeek) {
          console.log(
            `  Busiest week: ${chalk.cyan(timeline.summary.busiestWeek.weekStart)} (${timeline.summary.busiestWeek.prCount} PRs)`,
          );
        }
        if (timeline.summary.busiestMonth) {
          console.log(
            `  Busiest month: ${chalk.cyan(timeline.summary.busiestMonth.month)} (${timeline.summary.busiestMonth.prCount} PRs)`,
          );
        }

        // Show recent months
        if (timeline.months.length > 0) {
          console.log();
          console.log(chalk.bold('Recent Activity:'));
          const recentMonths = timeline.months.slice(-3).reverse();
          for (const month of recentMonths) {
            const impactStr = [
              month.stats.byImpact.flagship > 0
                ? chalk.magenta(`${month.stats.byImpact.flagship}F`)
                : null,
              month.stats.byImpact.major > 0
                ? chalk.green(`${month.stats.byImpact.major}M`)
                : null,
              month.stats.byImpact.standard > 0
                ? chalk.yellow(`${month.stats.byImpact.standard}S`)
                : null,
              month.stats.byImpact.minor > 0
                ? chalk.gray(`${month.stats.byImpact.minor}m`)
                : null,
            ]
              .filter(Boolean)
              .join(' ');
            console.log(
              `  ${month.monthName}: ${chalk.cyan(month.stats.prCount)} PRs, ${chalk.cyan(month.stats.ticketCount)} tickets ${impactStr ? `[${impactStr}]` : ''}`,
            );
          }
        }
      }

      console.log(chalk.green('\n✓ Report analysis generated successfully'));
    } catch (error) {
      console.error(
        chalk.red('\n❌ Error:'),
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });
