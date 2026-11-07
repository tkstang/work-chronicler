import {
  createProfile,
  getProfileEnvPath,
  getWorkLogDir,
  initializeWorkspaceWithProfile,
  saveProfileEnv,
} from '@core/index';
import chalk from 'chalk';

import {
  getMissingTokensForFetch,
  runInitialFetch,
  withRuntimeTokens,
} from './init.fetch';
import type { DataSource } from './init.prompts';
import {
  promptConfirmAllRepos,
  promptConfirmDiscoveredRepos,
  promptDataSources,
  promptEditRepos,
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
  promptPRLookbackDepth,
  promptRepoDiscoveryMethod,
  promptTimeRange,
  promptTokensReady,
  resolveNewProfileName,
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
import { discoverRepos, type PRLookbackDepth } from './init.utils';

/**
 * Run the IC (individual contributor) profile setup wizard
 *
 * @param cliProfileName - Profile name from `--profile` (skips the name prompt)
 */
export async function runIcInit(cliProfileName?: string): Promise<void> {
  // Step 1: Profile name (validate with Zod if provided via CLI flag)
  const profileName = await resolveNewProfileName(cliProfileName);

  // Step 2: Data sources
  const dataSources = await promptDataSources();

  // Step 3: Time range
  const { since, until, timeRange } = await promptTimeRange();

  // Step 4: GitHub configuration (if selected)
  let github: WizardGitHubConfig | undefined;
  const initialTokens: WizardTokens = {};

  if (dataSources.includes('github')) {
    const { config, githubToken } = await collectGitHubConfig({
      since,
      until,
    });
    github = config;
    if (githubToken) {
      initialTokens.githubToken = githubToken;
    }
  }

  // Step 5: JIRA configuration (if selected)
  let jira: WizardJiraConfig | undefined;

  if (dataSources.includes('jira')) {
    const jiraConfig = await collectJiraConfig();
    jira = jiraConfig;
    initialTokens.jiraEmail = jiraConfig.instances[0]?.email;
  }

  // Step 6: Token setup
  const tokens = await collectTokens(dataSources, initialTokens);

  // Step 7: Create profile
  const result: WizardResult = {
    profileName,
    dataSources,
    timeRange,
    since,
    until,
    github,
    jira,
    tokens,
    fetchNow: false,
  };

  const config = wizardResultToConfig(result);
  createProfile(profileName, config);

  // Save tokens if provided (written to profile .env file)
  if (tokens.githubToken || tokens.jiraToken) {
    saveProfileEnv(profileName, tokens);
  }

  // Set as active profile
  initializeWorkspaceWithProfile(profileName);

  console.log(chalk.green(`\nProfile '${profileName}' created successfully!`));

  // Step 8: Fetch now?
  const fetchNow = await promptFetchNow();

  if (fetchNow) {
    console.log(chalk.cyan('\nStarting data fetch...\n'));
    const configForFetch = withRuntimeTokens(config, tokens);
    const missing = getMissingTokensForFetch(dataSources, configForFetch);
    if (missing.length > 0) {
      const envPath = getProfileEnvPath(profileName);
      console.log(
        chalk.yellow(
          `Missing required token(s): ${missing.join(', ')}. Skipping fetch.`,
        ),
      );
      console.log(chalk.dim(`Add tokens to: ${envPath}`));
      console.log(chalk.dim('Then run: work-chronicler fetch:all\n'));
    } else {
      const outputDir = getWorkLogDir(profileName);
      await runInitialFetch(configForFetch, outputDir);
    }
  }

  // Show next steps
  showNextSteps(profileName, tokens);
}

/**
 * Collect GitHub configuration
 */
async function collectGitHubConfig(options: {
  since: string;
  until: string | null;
}): Promise<{
  config: WizardGitHubConfig;
  githubToken?: string;
}> {
  const username = await promptGitHubUsername();
  const orgNames = await promptGitHubOrgs();

  const orgs: WizardGitHubOrg[] = [];
  let githubToken: string | undefined;
  let prLookbackDepth: PRLookbackDepth | undefined;

  for (const orgName of orgNames) {
    const method = await promptRepoDiscoveryMethod(orgName);

    let repos: string[];

    switch (method) {
      case 'manual':
        repos = await promptManualRepos(orgName);
        break;

      case 'auto':
        if (!prLookbackDepth) {
          prLookbackDepth = await promptPRLookbackDepth();
        }

        repos = await autoDiscoverReposForOrg({
          org: orgName,
          username,
          prLookbackDepth,
          since: options.since,
          until: options.until,
          getToken: async () => {
            // Prefer existing env token; otherwise prompt once and reuse.
            if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
            if (githubToken) return githubToken;
            githubToken = await promptGitHubToken();
            return githubToken;
          },
        });
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

  return { config: { username, orgs }, githubToken };
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
function collectTokens(dataSources: DataSource[]): Promise<WizardTokens>;
function collectTokens(
  dataSources: DataSource[],
  initialTokens: WizardTokens,
): Promise<WizardTokens>;
async function collectTokens(
  dataSources: DataSource[],
  initialTokens: WizardTokens = {},
): Promise<WizardTokens> {
  const tokens: WizardTokens = { ...initialTokens };

  const missingSources: DataSource[] = [];
  if (
    dataSources.includes('github') &&
    !process.env.GITHUB_TOKEN &&
    !tokens.githubToken
  ) {
    missingSources.push('github');
  }
  if (
    dataSources.includes('jira') &&
    !process.env.JIRA_TOKEN &&
    !tokens.jiraToken
  ) {
    missingSources.push('jira');
  }

  if (missingSources.length === 0) {
    return tokens;
  }

  const ready = await promptTokensReady(missingSources);

  if (!ready) {
    console.log(
      chalk.dim('\nYou can add tokens later to your profile .env file.'),
    );
    return tokens;
  }

  if (missingSources.includes('github')) {
    tokens.githubToken = await promptGitHubToken();
  }

  if (missingSources.includes('jira')) {
    tokens.jiraToken = await promptJiraToken();
  }

  return tokens;
}

/**
 * Auto-discover repos for one org, falling back to manual entry
 */
async function autoDiscoverReposForOrg(options: {
  org: string;
  username: string;
  prLookbackDepth: PRLookbackDepth;
  since: string;
  until: string | null;
  getToken: () => Promise<string>;
}): Promise<string[]> {
  const token = await options.getToken();

  try {
    const result = await discoverRepos(
      token,
      options.org,
      options.username,
      options.prLookbackDepth,
      options.since,
      options.until,
    );

    if (result.repos.length === 0) {
      console.log(
        chalk.yellow(
          `\nNo repos found with PRs by '${options.username}' in '${options.org}'.`,
        ),
      );
      console.log(chalk.dim('Falling back to manual repo entry.\n'));
      return await promptManualRepos(options.org);
    }

    const choice = await promptConfirmDiscoveredRepos(result.repos);
    if (choice === 'yes') {
      return result.repos;
    }

    if (choice === 'edit') {
      const edited = await promptEditRepos(result.repos);
      if (edited.length === 0) {
        console.log(
          chalk.yellow('\nNo repos selected. Falling back to manual entry.\n'),
        );
        return await promptManualRepos(options.org);
      }
      return edited;
    }

    // choice === 'no'
    return await promptManualRepos(options.org);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      chalk.red(`\nAuto-discovery failed for '${options.org}': ${message}`),
    );
    console.log(chalk.dim('Falling back to manual repo entry.\n'));
    return await promptManualRepos(options.org);
  }
}

/**
 * Show next steps after profile creation
 */
function showNextSteps(profileName: string, tokens: WizardTokens): void {
  console.log(chalk.cyan('\nNext steps:\n'));

  let step = 1;

  if (!tokens.githubToken && !tokens.jiraToken) {
    const envPath = getProfileEnvPath(profileName);
    console.log(`  ${step}. Add your API tokens to: ${envPath}`);
    step++;
  }

  console.log(
    `  ${step}. Fetch your work history:       work-chronicler fetch all`,
  );
  console.log(
    `  ${step + 1}. Review what was fetched:       work-chronicler status`,
  );
  console.log(
    `  ${step + 2}. Filter for relevant work:       work-chronicler filter`,
  );
  console.log(
    `  ${step + 3}. Run analysis on filtered data:  work-chronicler analyze --all`,
  );
  console.log(
    `  ${step + 4}. Install AI skills:              work-chronicler skills install`,
  );
  console.log(
    `  ${step + 5}. Use a skill in your AI editor:   /work-chronicler-summarize-work`,
  );
  console.log();
  console.log(
    chalk.dim(
      'Skills are slash commands for AI coding assistants (Claude Code, Cursor, etc.).',
    ),
  );
  console.log(
    chalk.dim('Switch profiles: work-chronicler profile switch <name>'),
  );
  console.log(chalk.dim('List profiles:   work-chronicler profile list'));
}
