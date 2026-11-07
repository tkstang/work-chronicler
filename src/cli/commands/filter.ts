import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  classifyPRImpact,
  detectProjects,
  generateStats,
  generateTimeline,
  IMPACT_HIERARCHY,
} from '@analyzer/index';
import { toCliError } from '@cli/errors';
import {
  DIRECTORIES,
  findConfigPath,
  getGitHubNameProblem,
  getOutputDirectory,
  loadConfig,
  normalizeGitHubName,
  type PRImpact,
  readAllPRReviews,
  readAllPRs,
  readAllTickets,
  writeMarkdownFile,
} from '@core/index';
import { promptFilterInteractive } from '@prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import ora from 'ora';

export const filterCommand = new Command('filter')
  .description('Filter work-log to a subset based on criteria')
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
    'Only include PRs linked to tickets and tickets linked to PRs',
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
  .option('--clear', 'Remove existing filtered data')
  .option('-v, --verbose', 'Show detailed output')
  .action(async (options) => {
    try {
      const configPath = findConfigPath(options.config);
      const config = await loadConfig(options.config);
      const outputDir = getOutputDirectory(config, configPath ?? undefined);
      const filteredDir = join(outputDir, DIRECTORIES.FILTERED);

      // Handle --clear flag
      if (options.clear) {
        if (existsSync(filteredDir)) {
          rmSync(filteredDir, { recursive: true });
          console.log(chalk.green('✓'), 'Cleared filtered data');
        } else {
          console.log(chalk.yellow('No filtered data to clear'));
        }
        return;
      }

      console.log(chalk.cyan('Filtering work-log...\n'));

      // Show active filters
      const filters: string[] = [];
      if (options.org) {
        filters.push(`Include orgs: ${options.org.join(', ')}`);
      }
      if (options.excludeOrg) {
        filters.push(`Exclude orgs: ${options.excludeOrg.join(', ')}`);
      }
      if (options.repo) {
        filters.push(`Include repos: ${options.repo.join(', ')}`);
      }
      if (options.excludeRepo) {
        filters.push(`Exclude repos: ${options.excludeRepo.join(', ')}`);
      }
      if (options.excludeImpact) {
        filters.push(`Excluding impact: ${options.excludeImpact.join(', ')}`);
      }
      if (options.minImpact) {
        filters.push(`Minimum impact: ${options.minImpact}`);
      }
      if (options.minLoc) {
        filters.push(`Minimum LOC: ${options.minLoc}`);
      }
      if (options.linkedOnly) {
        filters.push('Linked only');
      }
      if (options.mergedOnly) {
        filters.push('Merged PRs only');
      }
      if (options.excludeStatus) {
        filters.push(
          `Excluding ticket status: ${options.excludeStatus.join(', ')}`,
        );
      }

      // If no filters specified, prompt interactively
      if (filters.length === 0) {
        console.log(
          chalk.cyan('No filters specified. Starting interactive mode...\n'),
        );
        const prompted = await promptFilterInteractive();

        // Apply prompted values to options
        if (prompted.excludeImpact.length > 0) {
          options.excludeImpact = prompted.excludeImpact;
          filters.push(
            `Excluding impact: ${prompted.excludeImpact.join(', ')}`,
          );
        }
        if (prompted.minImpact) {
          options.minImpact = prompted.minImpact;
          filters.push(`Minimum impact: ${prompted.minImpact}`);
        }
        if (prompted.minLoc) {
          options.minLoc = prompted.minLoc;
          filters.push(`Minimum LOC: ${prompted.minLoc}`);
        }
        if (prompted.linkedOnly) {
          options.linkedOnly = true;
          filters.push('Linked only');
        }
        if (prompted.mergedOnly) {
          options.mergedOnly = true;
          filters.push('Merged PRs only');
        }
        if (prompted.excludeStatus.length > 0) {
          options.excludeStatus = prompted.excludeStatus;
          filters.push(
            `Excluding ticket status: ${prompted.excludeStatus.join(', ')}`,
          );
        }

        // Check if user selected any filters
        if (filters.length === 0) {
          console.log(chalk.yellow('No filters selected. Exiting.'));
          return;
        }

        console.log();
      }

      console.log(chalk.gray('Filters:'));
      for (const f of filters) {
        console.log(`  - ${f}`);
      }
      console.log();

      // Load all data
      const spinner = ora('Loading PRs...').start();
      const allPRs = await readAllPRs(outputDir);
      spinner.text = 'Loading tickets...';
      const allTickets = await readAllTickets(outputDir);
      const allReviews = await readAllPRReviews(outputDir);
      spinner.succeed(
        `Loaded ${chalk.cyan(allPRs.length)} PRs and ${chalk.cyan(allTickets.length)} tickets`,
      );

      // Filter PRs
      spinner.start('Filtering PRs...');
      const excludeImpacts = new Set<PRImpact>(options.excludeImpact ?? []);
      const minImpactLevel = options.minImpact
        ? IMPACT_HIERARCHY[options.minImpact as PRImpact]
        : 0;

      // Build org/repo filter sets
      // Normalize like the config schema so `--org @acme` matches `acme`
      // and `--repo @acme/web` matches `acme/web`
      const toFilterKey = (o: string) => normalizeGitHubName(o).toLowerCase();
      // Reject selectors that can never match a stored org (e.g. `@`, `@@acme`)
      const toOrgSelector = (o: string) => {
        const problem = getGitHubNameProblem(normalizeGitHubName(o));
        if (problem) throw new Error(`Invalid org selector "${o}": ${problem}`);
        return toFilterKey(o);
      };
      const toRepoSelector = (r: string) => {
        const [org, repo, ...rest] = r.split('/');
        if (!org || !repo?.trim() || rest.length > 0) {
          throw new Error(`Invalid repo selector "${r}": use org/repo`);
        }
        return `${toOrgSelector(org)}/${repo.trim().toLowerCase()}`;
      };
      const includeOrgs = options.org
        ? new Set(options.org.map(toOrgSelector))
        : null;
      const excludeOrgs = new Set(
        (options.excludeOrg ?? []).map(toOrgSelector),
      );
      const includeRepos = options.repo
        ? new Set(options.repo.map(toRepoSelector))
        : null;
      const excludeRepos = new Set(
        (options.excludeRepo ?? []).map(toRepoSelector),
      );

      // Org and repo selectors, shared by PRs and review records
      const inScope = (org: string, repository: string) => {
        const orgKey = toFilterKey(org);
        const repoKey = `${orgKey}/${repository.toLowerCase()}`;

        // Check org inclusion (if specified, must be in the list)
        if (includeOrgs && !includeOrgs.has(orgKey)) {
          return false;
        }

        // Check org exclusion
        if (excludeOrgs.has(orgKey)) {
          return false;
        }

        // Check repo inclusion (if specified, must be in the list)
        if (includeRepos && !includeRepos.has(repoKey)) {
          return false;
        }

        // Check repo exclusion
        return !excludeRepos.has(repoKey);
      };

      const filteredPRs = allPRs.filter((pr) => {
        if (!inScope(pr.frontmatter.org, pr.frontmatter.repository)) {
          return false;
        }

        const impact =
          pr.frontmatter.impact ??
          classifyPRImpact(pr.frontmatter, config.analysis);
        const totalLines = pr.frontmatter.additions + pr.frontmatter.deletions;

        // Check exclude impact
        if (excludeImpacts.has(impact)) {
          return false;
        }

        // Check min impact
        if (IMPACT_HIERARCHY[impact] < minImpactLevel) {
          return false;
        }

        // Check min LOC
        if (options.minLoc && totalLines < options.minLoc) {
          return false;
        }

        // Check linked only
        if (options.linkedOnly && pr.frontmatter.jiraTickets.length === 0) {
          return false;
        }

        // Check merged only
        if (options.mergedOnly && pr.frontmatter.state !== 'merged') {
          return false;
        }

        return true;
      });

      // Filter tickets
      const linkedPRUrls = new Set(filteredPRs.map((pr) => pr.frontmatter.url));
      const excludeStatuses = new Set<string>(options.excludeStatus ?? []);

      const filteredTickets = allTickets.filter((ticket) => {
        // Check exclude status
        if (excludeStatuses.has(ticket.frontmatter.status)) {
          return false;
        }

        // If linked-only, only include tickets that have PRs in our filtered set
        if (options.linkedOnly) {
          return ticket.frontmatter.linkedPRs.some((url) =>
            linkedPRUrls.has(url),
          );
        }
        return true;
      });

      spinner.succeed(
        `Filtered to ${chalk.green(filteredPRs.length)} PRs and ${chalk.green(filteredTickets.length)} tickets`,
      );

      // Create filtered directory structure
      spinner.start('Writing filtered files...');

      // Create filtered directory structure
      const analysisDir = join(filteredDir, DIRECTORIES.ANALYSIS);

      // Write filtered PRs
      for (const pr of filteredPRs) {
        // Reconstruct path relative to filtered dir
        const relativePath = pr.filePath.replace(outputDir, '');
        const newPath = join(filteredDir, relativePath);
        const dir = dirname(newPath);

        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        writeMarkdownFile(newPath, pr.frontmatter, pr.body);
      }

      // Write filtered tickets
      for (const ticket of filteredTickets) {
        const relativePath = ticket.filePath.replace(outputDir, '');
        const newPath = join(filteredDir, relativePath);
        const dir = dirname(newPath);

        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }

        writeMarkdownFile(newPath, ticket.frontmatter, ticket.body);
      }

      // Review records describe review work, not authored PRs: only the org
      // and repo selectors apply to them, and they never enter the analysis
      const filteredReviews = allReviews.filter((record) =>
        inScope(record.frontmatter.pr.org, record.frontmatter.pr.repository),
      );
      for (const record of filteredReviews) {
        const relativePath = record.filePath.replace(outputDir, '');
        writeMarkdownFile(
          join(filteredDir, relativePath),
          record.frontmatter,
          record.body,
        );
      }

      // Generate analysis for filtered set
      const since = config.fetch.since;
      const until =
        config.fetch.until ?? new Date().toISOString().split('T')[0];

      if (!existsSync(analysisDir)) {
        mkdirSync(analysisDir, { recursive: true });
      }

      // Generate stats
      const stats = generateStats(
        filteredPRs,
        filteredTickets,
        since,
        until ?? '',
      );
      writeFileSync(
        join(analysisDir, 'stats.json'),
        JSON.stringify(stats, null, 2),
      );

      // Generate projects
      const projects = detectProjects(
        filteredPRs,
        filteredTickets,
        since,
        until ?? '',
      );
      writeFileSync(
        join(analysisDir, 'projects.json'),
        JSON.stringify(projects, null, 2),
      );

      // Generate timeline
      const timeline = generateTimeline(
        filteredPRs,
        filteredTickets,
        since,
        until ?? '',
      );
      writeFileSync(
        join(analysisDir, 'timeline.json'),
        JSON.stringify(timeline, null, 2),
      );

      spinner.succeed(`Wrote filtered files to ${chalk.cyan(filteredDir)}`);

      // Summary
      console.log();
      console.log(chalk.cyan('Filtered Summary:'));
      console.log(
        `  PRs: ${chalk.cyan(filteredPRs.length)} / ${allPRs.length} (${Math.round((filteredPRs.length / allPRs.length) * 100)}%)`,
      );
      console.log(
        `  Tickets: ${chalk.cyan(filteredTickets.length)} / ${allTickets.length}`,
      );
      if (allReviews.length > 0) {
        console.log(
          `  Reviewed PRs: ${chalk.cyan(filteredReviews.length)} / ${allReviews.length} (org and repo filters only)`,
        );
      }
      console.log(
        `  Impact: ${chalk.magenta(stats.prs.byImpact.flagship)} flagship, ${chalk.green(stats.prs.byImpact.major)} major, ${chalk.yellow(stats.prs.byImpact.standard)} standard, ${chalk.gray(stats.prs.byImpact.minor)} minor`,
      );
    } catch (error) {
      throw toCliError(error, chalk.red('Error:'));
    }
  });
