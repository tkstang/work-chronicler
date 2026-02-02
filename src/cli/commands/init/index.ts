import chalk from 'chalk';
import { Command } from 'commander';
import {
  createProfile,
  initializeWorkspaceWithProfile,
  isWorkspaceMode,
  profileExists,
  saveProfileEnv,
} from '@core/index';
import type { DataSource } from './init.prompts';
import {
  promptConfirmAllRepos,
  promptDataSources,
  promptFetchNow,
  promptGitHubOrgs,
  promptGitHubToken,
  promptGitHubUsername,
  promptJiraEmail,
  promptJiraInstanceName,
  promptJiraProjects,
  promptJiraToken,
  promptJiraUrl,
  promptManualRepos,
  promptProfileName,
  promptRepoDiscoveryMethod,
  promptTimeRange,
  promptTokensReady,
} from './init.prompts';
import type {
  WizardGitHubConfig,
  WizardGitHubOrg,
  WizardJiraConfig,
  WizardJiraInstance,
  WizardResult,
  WizardTokens,
} from './init.types';
import { wizardResultToConfig } from './init.types';

export const initCommand = new Command('init')
  .description('Initialize a new work-chronicler profile with guided setup')
  .option('--profile <name>', 'Profile name (skips profile name prompt)')
  .action(async (options: { profile?: string }) => {
    try {
      console.log(chalk.cyan('\nWelcome to work-chronicler!\n'));

      if (isWorkspaceMode()) {
        console.log(chalk.dim("Let's set up a new profile.\n"));
      } else {
        console.log(chalk.dim("Let's set up your first profile.\n"));
      }

      // Step 1: Profile name
      const profileName = options.profile ?? (await promptProfileName());

      if (profileExists(profileName)) {
        console.error(chalk.red(`\nProfile '${profileName}' already exists.`));
        console.error(
          "Use 'work-chronicler profile delete' to remove it first.",
        );
        process.exit(1);
      }

      // Step 2: Data sources
      const dataSources = await promptDataSources();

      // Step 3: Time range
      const { since, timeRange } = await promptTimeRange();

      // Step 4: GitHub configuration (if selected)
      let github: WizardGitHubConfig | undefined;

      if (dataSources.includes('github')) {
        github = await collectGitHubConfig();
      }

      // Step 5: JIRA configuration (if selected)
      let jira: WizardJiraConfig | undefined;

      if (dataSources.includes('jira')) {
        jira = await collectJiraConfig();
      }

      // Step 6: Token setup
      const tokens = await collectTokens(dataSources);

      // Step 7: Create profile
      const result: WizardResult = {
        profileName,
        dataSources,
        timeRange,
        since,
        github,
        jira,
        tokens,
        fetchNow: false,
      };

      const config = wizardResultToConfig(result);
      createProfile(profileName, config);

      // Save tokens if provided
      if (tokens.githubToken || tokens.jiraToken) {
        saveProfileEnv(profileName, tokens);
      }

      // Set as active profile
      initializeWorkspaceWithProfile(profileName);

      console.log(
        chalk.green(`\nProfile '${profileName}' created successfully!`),
      );

      // Step 8: Fetch now?
      const fetchNow = await promptFetchNow();

      if (fetchNow) {
        console.log(chalk.cyan('\nStarting data fetch...\n'));
        // TODO: Integrate with fetch:all command
        console.log(chalk.yellow('Fetch integration not yet implemented.'));
        console.log(
          chalk.dim('Run `work-chronicler fetch:all` to fetch your data.'),
        );
      }

      // Show next steps
      showNextSteps(profileName, tokens);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes('User force closed')
      ) {
        console.log(chalk.yellow('\n\nSetup cancelled.'));
        process.exit(0);
      }
      console.error(
        chalk.red('\nError:'),
        error instanceof Error ? error.message : 'Unknown error',
      );
      process.exit(1);
    }
  });

/**
 * Collect GitHub configuration
 */
async function collectGitHubConfig(): Promise<WizardGitHubConfig> {
  const username = await promptGitHubUsername();
  const orgNames = await promptGitHubOrgs();

  const orgs: WizardGitHubOrg[] = [];

  for (const orgName of orgNames) {
    const method = await promptRepoDiscoveryMethod(orgName);

    let repos: string[];

    switch (method) {
      case 'manual':
        repos = await promptManualRepos(orgName);
        break;

      case 'auto':
        // Will be implemented with token collection
        console.log(
          chalk.yellow(
            '\nAuto-discovery requires a GitHub token. We will collect it later.',
          ),
        );
        console.log(
          chalk.dim('For now, please enter repos manually or select "all".\n'),
        );
        repos = await promptManualRepos(orgName);
        break;

      case 'all': {
        const confirmed = await promptConfirmAllRepos(orgName);
        if (confirmed) {
          repos = ['*'];
        } else {
          repos = await promptManualRepos(orgName);
        }
        break;
      }
    }

    orgs.push({ name: orgName, repos });
  }

  return { username, orgs };
}

/**
 * Collect JIRA configuration
 */
async function collectJiraConfig(): Promise<WizardJiraConfig> {
  console.log(chalk.cyan('\nJIRA Instance Configuration\n'));

  const name = await promptJiraInstanceName();
  const url = await promptJiraUrl();
  const email = await promptJiraEmail();
  const projects = await promptJiraProjects();

  const instance: WizardJiraInstance = { name, url, email, projects };

  return { instances: [instance] };
}

/**
 * Collect tokens
 */
async function collectTokens(dataSources: DataSource[]): Promise<WizardTokens> {
  const tokens: WizardTokens = {};

  const ready = await promptTokensReady(dataSources);

  if (!ready) {
    console.log(
      chalk.dim('\nYou can add tokens later to your profile .env file.'),
    );
    return tokens;
  }

  if (dataSources.includes('github')) {
    tokens.githubToken = await promptGitHubToken();
  }

  if (dataSources.includes('jira')) {
    tokens.jiraToken = await promptJiraToken();
  }

  return tokens;
}

/**
 * Show next steps after profile creation
 */
function showNextSteps(profileName: string, tokens: WizardTokens): void {
  console.log(chalk.cyan('\nNext steps:\n'));

  if (!tokens.githubToken && !tokens.jiraToken) {
    console.log(
      `  1. Add your API tokens to: ~/.work-chronicler/profiles/${profileName}/.env`,
    );
    console.log('  2. Fetch your work history: work-chronicler fetch:all');
  } else {
    console.log('  1. Fetch your work history: work-chronicler fetch:all');
  }

  console.log('  2. Check what was fetched: work-chronicler status');
  console.log(
    '  3. Generate a summary: Use /summarize-work in your AI assistant',
  );
  console.log();
  console.log(
    chalk.dim('Switch profiles: work-chronicler profile switch <name>'),
  );
  console.log(chalk.dim('List profiles:   work-chronicler profile list'));
}
