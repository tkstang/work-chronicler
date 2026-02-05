/**
 * reports add command
 */

import { discoverRepos } from '@commands/init/init.utils';
import { input, select } from '@inquirer/prompts';
import type { ManagerConfig, ReportConfig } from '@wc-types/manager';
import { getActiveProfile } from '@workspace/global-config';
import { addReport, loadManagerConfig } from '@workspace/report-manager';
import { isManagerMode } from '@workspace/resolver';
import chalk from 'chalk';
import { Command } from 'commander';

/**
 * reports add command
 */
export const addCommand = new Command('add')
  .description('Add a new report to manager profile')
  .argument('[name]', 'Report name (e.g., "Alice Smith")')
  .option('--github <username>', 'GitHub username')
  .option('--email <email>', 'Email address')
  .option('--repos <repos>', 'Comma-separated list of repos')
  .option('--jira-projects <projects>', 'Comma-separated Jira projects')
  .action(async (name, options) => {
    try {
      const activeProfile = getActiveProfile();

      if (!isManagerMode(activeProfile)) {
        console.error(
          chalk.red(
            '\n❌ Error: "reports" commands only available in manager mode.',
          ),
        );
        console.log(chalk.gray('Current profile is in IC mode.'));
        console.log(
          chalk.gray(
            '\nHint: Create a manager profile with "init --mode manager"',
          ),
        );
        process.exit(1);
      }

      const profileName = activeProfile;

      // Load config to get org and token
      const config = loadManagerConfig(profileName);

      let report: ReportConfig;

      if (options.github && options.email) {
        // Non-interactive mode
        report = {
          name: name || options.github,
          github: options.github,
          email: options.email,
          repos: options.repos
            ? options.repos.split(',').map((r: string) => r.trim())
            : [],
          jiraProjects: options.jiraProjects
            ? options.jiraProjects.split(',').map((p: string) => p.trim())
            : [],
        };
      } else {
        // Interactive mode
        report = await promptForReport(config);
      }

      await addReport(profileName, report);

      console.log(chalk.green(`\n✓ ${report.name} added to manager profile`));
    } catch (error) {
      console.error(
        chalk.red('\n❌ Error:'),
        error instanceof Error ? error.message : String(error),
      );
      process.exit(1);
    }
  });

/**
 * Prompt user for report details
 */
async function promptForReport(config: ManagerConfig): Promise<ReportConfig> {
  console.log(chalk.blue('\nAdd new report:\n'));

  const name = await input({
    message: 'Name:',
    validate: (value) => {
      if (!value.trim()) return 'Name is required';
      return true;
    },
  });

  const github = await input({
    message: 'GitHub username:',
    validate: (value) => {
      if (!value.trim()) return 'GitHub username is required';
      return true;
    },
  });

  const email = await input({
    message: 'Email:',
    validate: (value) => {
      if (!value.trim()) return 'Email is required';
      if (!value.includes('@')) return 'Invalid email format';
      return true;
    },
  });

  // Repos
  const reposChoice = await select({
    message: 'Repos:',
    choices: [
      { name: 'Auto-discover', value: 'discover' },
      { name: 'Specify manually', value: 'manual' },
      { name: 'Skip for now', value: 'skip' },
    ],
  });

  let repos: string[] = [];

  if (reposChoice === 'discover') {
    console.log(chalk.blue(`\n🔍 Discovering repos for ${github}...\n`));

    const token = config.github?.token || process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GitHub token not found in config or environment');
    }

    const org = config.github?.org;
    if (!org) {
      throw new Error('GitHub org not found in config');
    }

    // Use existing discovery logic
    const result = await discoverRepos(
      token,
      org,
      github,
      50, // prCount
      '6months', // since (6 months ago)
      null, // until
    );

    repos = result.repos;

    if (repos.length === 0) {
      console.log(
        chalk.yellow(
          'No repos found. You can add them later with "reports update".',
        ),
      );
    } else {
      console.log(chalk.green(`✓ Found ${repos.length} repos\n`));
    }
  } else if (reposChoice === 'manual') {
    const reposInput = await input({
      message: 'Repos (comma-separated):',
    });
    repos = reposInput
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);
  }

  // Jira projects
  const jiraInput = await input({
    message: 'Jira projects (comma-separated, or leave blank):',
  });

  const jiraProjects = jiraInput
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  return {
    name,
    github,
    email,
    repos,
    jiraProjects,
  };
}
