import type { Config } from '@core/index';
import {
  createProfile,
  getProfileEnvPath,
  getWorkLogDir,
  initializeWorkspaceWithProfile,
  isWorkspaceMode,
  ProfileNameSchema,
  profileExists,
  saveProfileEnv,
} from '@core/index';
import { fetchGitHubPRs } from '@fetchers/github';
import { fetchJiraTickets } from '@fetchers/jira';
import { linkPRsToTickets } from '@linker/index';
import chalk from 'chalk';
import { Command } from 'commander';
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
import { discoverRepos, type PRLookbackDepth } from './init.utils';

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

      // Step 1: Profile name (validate with Zod if provided via CLI flag)
      let profileName: string;
      if (options.profile) {
        const result = ProfileNameSchema.safeParse(options.profile);
        if (!result.success) {
          console.error(
            chalk.red(
              result.error.errors[0]?.message ?? 'Invalid profile name',
            ),
          );
          process.exit(1);
        }
        profileName = result.data;
      } else {
        profileName = await promptProfileName();
      }

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

      console.log(
        chalk.green(`\nProfile '${profileName}' created successfully!`),
      );

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

function getMissingTokensForFetch(
  dataSources: DataSource[],
  config: Config,
): string[] {
  const missing: string[] = [];

  if (dataSources.includes('github')) {
    const hasGitHubToken = Boolean(
      config.github?.token || process.env.GITHUB_TOKEN,
    );
    if (!hasGitHubToken) missing.push('GITHUB_TOKEN');
  }

  if (dataSources.includes('jira') && config.jira?.instances.length) {
    const hasJiraToken = Boolean(
      config.jira.instances.some((i) => i.token) || process.env.JIRA_TOKEN,
    );
    if (!hasJiraToken) missing.push('JIRA_TOKEN');
  }

  return missing;
}

function withRuntimeTokens(config: Config, tokens: WizardTokens): Config {
  const next: Config = {
    ...config,
    github: {
      ...config.github,
      token: tokens.githubToken ?? config.github.token,
    },
  };

  if (config.jira?.instances.length) {
    next.jira = {
      instances: config.jira.instances.map((instance) => ({
        ...instance,
        token: tokens.jiraToken ?? instance.token,
        email: tokens.jiraEmail ?? instance.email,
      })),
    };
  }

  return next;
}

async function runInitialFetch(
  config: Parameters<typeof fetchGitHubPRs>[0]['config'],
  outputDir: string,
): Promise<void> {
  console.log(chalk.bold('📥 Fetching Work History\n'));
  console.log(`${chalk.gray('Output directory:')} ${outputDir}\n`);

  const errors: string[] = [];

  // GitHub
  let totalPRs = 0;
  try {
    const githubResults = await fetchGitHubPRs({
      config,
      outputDir,
      verbose: false,
      useCache: false,
    });
    totalPRs = githubResults.reduce((sum, r) => sum + r.prsWritten, 0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`GitHub fetch failed: ${message}`);
  }

  // JIRA
  let totalTickets = 0;
  if (config.jira?.instances.length) {
    try {
      const jiraResults = await fetchJiraTickets({
        config,
        outputDir,
        verbose: false,
        useCache: false,
      });
      totalTickets = jiraResults.reduce((sum, r) => sum + r.ticketsWritten, 0);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`JIRA fetch failed: ${message}`);
    }
  }

  // Link
  let linksCreated = 0;
  if (totalPRs > 0) {
    try {
      const linkResult = await linkPRsToTickets({
        config,
        outputDir,
        verbose: false,
      });
      linksCreated = linkResult.linksFound;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Linking failed: ${message}`);
    }
  }

  const separator = '═'.repeat(40);
  console.log(chalk.bold(`\n${separator}`));
  console.log(chalk.bold('📊 Summary'));
  console.log(separator);
  console.log(`  ${chalk.cyan('PRs fetched:')}      ${chalk.green(totalPRs)}`);
  console.log(
    `  ${chalk.cyan('Tickets fetched:')} ${chalk.green(totalTickets)}`,
  );
  console.log(
    `  ${chalk.cyan('Links created:')}   ${chalk.green(linksCreated)}`,
  );
  console.log(`${separator}\n`);
  if (errors.length > 0) {
    console.log(chalk.yellow('Completed with errors:\n'));
    for (const err of errors) {
      console.log(chalk.yellow(`- ${err}`));
    }
    console.log(chalk.dim('\nYou can re-run: work-chronicler fetch:all\n'));
  } else {
    console.log(`${chalk.green('✓')} Done!`);
  }
}

/**
 * Show next steps after profile creation
 */
function showNextSteps(profileName: string, tokens: WizardTokens): void {
  console.log(chalk.cyan('\nNext steps:\n'));

  if (!tokens.githubToken && !tokens.jiraToken) {
    const envPath = getProfileEnvPath(profileName);
    console.log(`  1. Add your API tokens to: ${envPath}`);
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
