import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  findConfigPath,
  getAnalysisFilePath,
  getEffectiveOutputDir,
  getOutputDirectory,
  loadConfig,
  readAllPRs,
  readAllTickets,
  writeMarkdownFile,
} from '@core/index';
import { promptAnalyzeOptions, promptUseFiltered } from '@prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';
import {
  classifyPRImpact,
  detectProjects,
  generateStats,
  generateTimeline,
} from '../analyzer';
import { teamCommand } from './analyze/team';

export const analyzeCommand = new Command('analyze')
  .description('Analyze work history and generate stats')
  .option('-c, --config <path>', 'Path to config file')
  .option('--tag-prs', 'Update PR files with impact tags')
  .option('--projects', 'Detect and group related PRs/tickets into projects')
  .option('--timeline', 'Generate chronological timeline grouped by week/month')
  .option('--all', 'Run all analysis (tag-prs, projects, timeline)')
  .option('-v, --verbose', 'Show detailed output')
  .option('--full', 'Analyze full work-log even if filtered/ exists')
  .addCommand(teamCommand)
  .action(async (options) => {
    // Determine what to analyze
    const hasAnalysisFlags =
      options.tagPrs || options.projects || options.timeline || options.all;

    let analyzeOpts = {
      tagPrs: options.tagPrs || options.all,
      projects: options.projects || options.all,
      timeline: options.timeline || options.all,
    };

    // If no flags provided, prompt interactively
    if (!hasAnalysisFlags) {
      analyzeOpts = await promptAnalyzeOptions();
    }
    try {
      const configPath = findConfigPath(options.config);
      const config = await loadConfig(options.config);
      const baseOutputDir = getOutputDirectory(config, configPath ?? undefined);

      // Check if filtered data exists
      let outputDir = baseOutputDir;
      let isFiltered = false;
      const effective = getEffectiveOutputDir(baseOutputDir);

      if (effective.isFiltered) {
        if (options.full) {
          // User explicitly requested full work-log
          outputDir = baseOutputDir;
          isFiltered = false;
        } else {
          // Filtered data exists - prompt user
          const useFiltered = await promptUseFiltered();
          if (useFiltered) {
            outputDir = effective.dir;
            isFiltered = true;
          }
        }
      }

      const since = config.fetch.since;
      const until =
        config.fetch.until ?? new Date().toISOString().split('T')[0];

      console.log(chalk.cyan('Analyzing work history...\n'));
      if (isFiltered) {
        console.log(chalk.yellow('Using filtered data'));
      }
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
      if (analyzeOpts.tagPrs) {
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
        const projectsAnalysis = detectProjects(
          prs,
          tickets,
          since,
          until ?? '',
        );
        spinner.succeed(
          `Detected ${chalk.cyan(projectsAnalysis.summary.totalProjects)} projects`,
        );

        // Write projects file
        const projectsPath = getAnalysisFilePath(outputDir, 'projects');
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
        const timeline = generateTimeline(prs, tickets, since, until ?? '');
        spinner.succeed(
          `Generated timeline: ${chalk.cyan(timeline.summary.totalMonths)} months, ${chalk.cyan(timeline.summary.totalWeeks)} weeks`,
        );

        // Write timeline file
        const timelinePath = getAnalysisFilePath(outputDir, 'timeline');
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
    } catch (error) {
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });
