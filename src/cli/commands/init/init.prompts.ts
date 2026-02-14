import { checkbox, confirm, input, password, select } from '@inquirer/prompts';
import chalk from 'chalk';
import type { PRLookbackDepth } from './init.utils';

/**
 * Data source options
 */
export type DataSource = 'github' | 'jira';

/**
 * Time range options
 */
export type TimeRange = '3months' | '6months' | '12months' | 'custom';

/**
 * Repo discovery method
 */
export type RepoDiscoveryMethod = 'manual' | 'auto' | 'all';

/**
 * Prompt for profile name
 */
export async function promptProfileName(
  defaultName = 'default',
): Promise<string> {
  return await input({
    message: 'What would you like to name this profile?',
    default: defaultName,
    validate: (value: string) => {
      if (!value.trim()) {
        return 'Profile name cannot be empty';
      }
      if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(value)) {
        return 'Profile name must start with alphanumeric and contain only alphanumeric characters and hyphens';
      }
      if (value.length > 50) {
        return 'Profile name must be 50 characters or less';
      }
      return true;
    },
  });
}

/**
 * Prompt for data sources
 */
export async function promptDataSources(): Promise<DataSource[]> {
  const sources = await checkbox<DataSource>({
    message: 'Which data sources would you like to use?',
    choices: [
      { name: 'GitHub', value: 'github', checked: true },
      { name: 'JIRA', value: 'jira' },
    ],
    validate: (selected) => {
      if (selected.length === 0) {
        return 'At least one data source is required';
      }
      return true;
    },
  });

  return sources;
}

/**
 * Prompt for time range
 */
export async function promptTimeRange(): Promise<{
  since: string;
  until: string | null;
  timeRange: TimeRange;
}> {
  const timeRange = await select<TimeRange>({
    message: 'How far back should we fetch data?',
    choices: [
      { name: 'Last 3 months', value: '3months' },
      { name: 'Last 6 months', value: '6months' },
      { name: 'Last 12 months', value: '12months' },
      { name: 'Custom date range', value: 'custom' },
    ],
  });

  let since: string;
  let until: string | null = null;
  const now = new Date();

  switch (timeRange) {
    case '3months':
      since = new Date(now.setMonth(now.getMonth() - 3))
        .toISOString()
        .split('T')[0]!;
      break;
    case '6months':
      since = new Date(now.setMonth(now.getMonth() - 6))
        .toISOString()
        .split('T')[0]!;
      break;
    case '12months':
      since = new Date(now.setMonth(now.getMonth() - 12))
        .toISOString()
        .split('T')[0]!;
      break;
    case 'custom': {
      while (true) {
        const start = await input({
          message: 'Enter start date (YYYY-MM-DD):',
          validate: validateIsoDate,
        });
        const end = await input({
          message: 'Enter end date (YYYY-MM-DD) (optional, blank for now):',
          validate: (value: string) => {
            if (!value.trim()) return true;
            return validateIsoDate(value);
          },
        });

        since = start.trim();
        until = end.trim() ? end.trim() : null;

        if (until) {
          const sinceDate = new Date(`${since}T00:00:00Z`);
          const untilDate = new Date(`${until}T00:00:00Z`);
          if (sinceDate > untilDate) {
            console.log(
              chalk.red('End date must be the same as or after start date.\n'),
            );
            continue;
          }
        }

        break;
      }
      break;
    }
  }

  return { since, until, timeRange };
}

function validateIsoDate(value: string): true | string {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return 'Please enter a date in YYYY-MM-DD format';
  }
  const date = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return 'Please enter a valid date';
  }
  return true;
}

/**
 * Prompt for GitHub username
 */
export async function promptGitHubUsername(): Promise<string> {
  return await input({
    message: "What's your GitHub username?",
    validate: (value: string) => {
      if (!value.trim()) {
        return 'GitHub username is required';
      }
      return true;
    },
  });
}

/**
 * Prompt for GitHub organizations (multi-input)
 */
export async function promptGitHubOrgs(): Promise<string[]> {
  console.log(
    chalk.dim('\nFor personal repos, use your username as the org name'),
  );

  const orgs: string[] = [];
  let addMore = true;

  while (addMore) {
    const org = await input({
      message:
        orgs.length === 0
          ? 'Enter a GitHub organization (or username for personal repos):'
          : 'Enter another organization (or press Enter to finish):',
      validate: (value: string) => {
        if (orgs.length === 0 && !value.trim()) {
          return 'At least one organization is required';
        }
        return true;
      },
    });

    if (!org.trim()) {
      addMore = false;
    } else {
      orgs.push(org.trim());
    }
  }

  return orgs;
}

/**
 * Prompt for repo discovery method
 */
export async function promptRepoDiscoveryMethod(
  org: string,
): Promise<RepoDiscoveryMethod> {
  console.log(chalk.cyan(`\nConfiguring repos for '${org}'...`));

  return await select<RepoDiscoveryMethod>({
    message: `How should we find repos in '${org}'?`,
    choices: [
      {
        name: 'Manual entry (fastest)',
        value: 'manual',
        description: 'Type repo names yourself',
      },
      {
        name: 'Auto-discover',
        value: 'auto',
        description:
          'Find repos where you have PRs (requires read:org scope for orgs, slow for large orgs)',
      },
      {
        name: 'All repos (slowest)',
        value: 'all',
        description:
          "Include everything - repos: ['*'] (very slow for large orgs)",
      },
    ],
  });
}

/**
 * Prompt for PR lookback depth (auto-discover only)
 */
export async function promptPRLookbackDepth(): Promise<PRLookbackDepth> {
  console.log(
    chalk.dim('\nIn active repos, older PRs may be outside this range'),
  );

  return await select<PRLookbackDepth>({
    message: 'How many recent PRs per repo should we check?',
    choices: [
      { name: '50 PRs per repo (faster, ~30-60s)', value: 50 },
      { name: '100 PRs per repo (recommended, ~1-2 min)', value: 100 },
      { name: '200 PRs per repo (thorough, ~2-5 min)', value: 200 },
    ],
    default: 100,
  });
}

/**
 * Prompt for manual repo entry
 */
export async function promptManualRepos(org: string): Promise<string[]> {
  const repos: string[] = [];
  let addMore = true;

  while (addMore) {
    const repo = await input({
      message:
        repos.length === 0
          ? `Enter a repo name for '${org}':`
          : 'Enter another repo (or press Enter to finish):',
      validate: (value: string) => {
        if (repos.length === 0 && !value.trim()) {
          return 'At least one repo is required';
        }
        return true;
      },
    });

    if (!repo.trim()) {
      addMore = false;
    } else {
      // Strip org prefix if user entered it
      const repoName = repo.includes('/') ? repo.split('/').pop()! : repo;
      repos.push(repoName.trim());
    }
  }

  return repos;
}

/**
 * Prompt to confirm discovered repos
 */
export async function promptConfirmDiscoveredRepos(
  repos: string[],
): Promise<'yes' | 'no' | 'edit'> {
  console.log(chalk.cyan(`\nFound ${repos.length} repos:`));
  for (const repo of repos.slice(0, 10)) {
    console.log(`  - ${repo}`);
  }
  if (repos.length > 10) {
    console.log(chalk.dim(`  ... and ${repos.length - 10} more`));
  }

  return await select<'yes' | 'no' | 'edit'>({
    message: `Use these ${repos.length} repos?`,
    choices: [
      { name: 'Yes', value: 'yes' },
      { name: 'No, let me enter manually', value: 'no' },
      { name: 'Edit the list', value: 'edit' },
    ],
  });
}

/**
 * Prompt to edit repo list
 */
export async function promptEditRepos(repos: string[]): Promise<string[]> {
  return await checkbox<string>({
    message: 'Select repos to include:',
    choices: repos.map((repo) => ({ name: repo, value: repo, checked: true })),
  });
}

/**
 * Prompt for all repos confirmation
 */
export async function promptConfirmAllRepos(org: string): Promise<boolean> {
  console.log(
    chalk.yellow(
      `\nWarning: This will fetch ALL repos in '${org}' (may be slow)`,
    ),
  );

  return await confirm({
    message: 'Continue?',
    default: true,
  });
}

/**
 * Prompt for JIRA instance name
 */
export async function promptJiraInstanceName(): Promise<string> {
  return await input({
    message: 'JIRA instance name (e.g., "mycompany"):',
    validate: (value: string) => {
      if (!value.trim()) {
        return 'Instance name is required';
      }
      return true;
    },
  });
}

/**
 * Prompt for JIRA URL
 */
export async function promptJiraUrl(): Promise<string> {
  return await input({
    message: 'JIRA URL:',
    validate: (value: string) => {
      if (!value.trim()) {
        return 'JIRA URL is required';
      }
      if (!value.startsWith('https://')) {
        return 'JIRA URL must start with https://';
      }
      try {
        const url = new URL(value);
        if (!url.host.includes('.')) {
          return 'Please enter a valid URL';
        }
      } catch {
        return 'Please enter a valid URL';
      }
      return true;
    },
  });
}

/**
 * Prompt for JIRA email
 */
export async function promptJiraEmail(): Promise<string> {
  return await input({
    message: 'JIRA email:',
    validate: (value: string) => {
      if (!value.trim()) {
        return 'Email is required';
      }
      if (!value.includes('@')) {
        return 'Please enter a valid email address';
      }
      return true;
    },
  });
}

/**
 * Prompt for JIRA projects (multi-input)
 */
export async function promptJiraProjects(): Promise<string[]> {
  const projects: string[] = [];
  let addMore = true;

  while (addMore) {
    const project = await input({
      message:
        projects.length === 0
          ? 'Enter a JIRA project key (e.g., "PROJ"):'
          : 'Enter another project (or press Enter to finish):',
      validate: (value: string) => {
        if (projects.length === 0 && !value.trim()) {
          return 'At least one project is required';
        }
        return true;
      },
    });

    if (!project.trim()) {
      addMore = false;
    } else {
      projects.push(project.trim().toUpperCase());
    }
  }

  return projects;
}

/**
 * Prompt for token readiness
 */
export async function promptTokensReady(
  sources: DataSource[],
): Promise<boolean> {
  console.log(chalk.cyan('\nAPI tokens are required to fetch data.\n'));
  console.log('Create your tokens at:');

  if (sources.includes('github')) {
    console.log(chalk.dim('  GitHub: https://github.com/settings/tokens'));
    console.log(
      chalk.dim(
        '          (Required scopes: repo or public_repo, read:org for orgs)',
      ),
    );
  }

  if (sources.includes('jira')) {
    console.log(
      chalk.dim(
        '  JIRA:   https://id.atlassian.com/manage-profile/security/api-tokens',
      ),
    );
  }

  console.log();

  return await confirm({
    message: 'Do you have your tokens ready?',
    default: true,
  });
}

/**
 * Prompt for GitHub token
 */
export async function promptGitHubToken(): Promise<string> {
  return await password({
    message: 'GitHub token:',
    validate: (value: string) => {
      if (!value.trim()) {
        return 'Token is required';
      }
      return true;
    },
  });
}

/**
 * Prompt for JIRA token
 */
export async function promptJiraToken(): Promise<string> {
  return await password({
    message: 'JIRA token:',
    validate: (value: string) => {
      if (!value.trim()) {
        return 'Token is required';
      }
      return true;
    },
  });
}

/**
 * Prompt to fetch now
 */
export async function promptFetchNow(): Promise<boolean> {
  return await confirm({
    message: 'Fetch data now? This may take a few minutes.',
    default: true,
  });
}
