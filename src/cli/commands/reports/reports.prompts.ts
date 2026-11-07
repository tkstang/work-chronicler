import { discoverRepos } from '@commands/init/init.utils';
import { input, select } from '@inquirer/prompts';
import { getGitHubNameProblem, normalizeGitHubName } from '@wc-types/github';
import type { ManagerConfig, ReportConfig } from '@wc-types/manager';
import chalk from 'chalk';

/**
 * Prompt for a new report's details
 *
 * Shared by `reports add` and `init --mode manager`.
 *
 * @param config - Manager config (GitHub org, token and fetch range are used for repo auto-discovery)
 * @returns The report to add
 */
export async function promptForReport(
  config: ManagerConfig,
): Promise<ReportConfig> {
  console.log(chalk.blue('\nAdd new report:\n'));

  const name = await input({
    message: 'Name:',
    validate: (value) => {
      if (!value.trim()) return 'Name is required';
      return true;
    },
  });

  const github = normalizeGitHubName(
    await input({
      message: 'GitHub username:',
      validate: (value) => {
        return getGitHubNameProblem(normalizeGitHubName(value)) ?? true;
      },
    }),
  );

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

    // Discover over the profile's fetch range, the same window that
    // `fetch github` will later pull this report's PRs from.
    const result = await discoverRepos(
      token,
      org,
      github,
      50, // prCount
      config.fetch.since,
      config.fetch.until,
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
