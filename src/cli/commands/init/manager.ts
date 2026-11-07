import { writeFileSync } from 'node:fs';

import { promptForReport } from '@commands/reports/reports.prompts';
import {
  ensureProfileDirs,
  getProfileConfigPath,
  initializeWorkspaceWithProfile,
  saveProfileEnv,
} from '@core/index';
import { confirm, input, password } from '@inquirer/prompts';
import { getGitHubNameProblem, normalizeGitHubName } from '@wc-types/github';
import type { ManagerConfig } from '@wc-types/manager';
import { addReport } from '@workspace/report-manager';
import chalk from 'chalk';
import { stringify as stringifyYaml } from 'yaml';

import { promptTimeRange, resolveNewProfileName } from './init.prompts';

/**
 * Run the manager profile setup wizard
 *
 * @param cliProfileName - Profile name from `--profile` (skips the name prompt)
 */
export async function runManagerInit(cliProfileName?: string): Promise<void> {
  // Step 1: Profile name
  const profileName = await resolveNewProfileName(cliProfileName, 'manager');

  console.log(chalk.cyan('\nManager Mode Configuration\n'));

  // Step 2: Time range
  const { since, until } = await promptTimeRange();

  // Step 3: GitHub configuration
  const githubOrg = await input({
    message: 'GitHub organization:',
    validate: (value: string) =>
      getGitHubNameProblem(normalizeGitHubName(value)) ?? true,
  });

  const githubToken = await promptGitHubTokenForManager();

  // Step 4: Optional JIRA configuration
  const useJira = await confirm({
    message: 'Configure JIRA?',
    default: false,
  });

  let jiraConfig: ManagerConfig['jira'];
  const tokens: {
    githubToken?: string;
    jiraToken?: string;
    jiraEmail?: string;
  } = {
    githubToken,
  };

  if (useJira) {
    const jiraHost = await input({
      message: 'JIRA host (e.g., company.atlassian.net):',
      validate: (value: string) => {
        if (!value.trim()) {
          return 'JIRA host is required';
        }
        return true;
      },
    });

    const jiraEmail = await input({
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

    const jiraToken = await password({
      message: 'JIRA token:',
      validate: (value: string) => {
        if (!value.trim()) {
          return 'Token is required';
        }
        return true;
      },
    });

    jiraConfig = {
      host: jiraHost.trim(),
      email: jiraEmail.trim(),
    };

    tokens.jiraToken = jiraToken;
    tokens.jiraEmail = jiraEmail.trim();
  }

  // Step 5: Create manager config
  const config: ManagerConfig = {
    mode: 'manager',
    github: {
      org: normalizeGitHubName(githubOrg),
    },
    jira: jiraConfig,
    fetch: {
      since,
      until,
    },
    reports: [],
  };

  // Step 6: Create profile directories
  ensureProfileDirs(profileName);

  // Save manager config as YAML
  const configPath = getProfileConfigPath(profileName);
  const yamlContent = stringifyYaml(config, {
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  });
  writeFileSync(configPath, yamlContent, 'utf-8');

  // Save tokens to .env
  saveProfileEnv(profileName, tokens);

  // Set as active profile
  initializeWorkspaceWithProfile(profileName);

  console.log(
    chalk.green(`\nManager profile '${profileName}' created successfully!`),
  );

  // Step 7: Add reports?
  const addReportsNow = await confirm({
    message: 'Add reports now?',
    default: true,
  });

  if (addReportsNow) {
    let addMore = true;
    while (addMore) {
      const report = await promptForReport(config);
      await addReport(profileName, report);
      console.log(chalk.green(`✓ ${report.name} added`));

      addMore = await confirm({
        message: 'Add another report?',
        default: false,
      });
    }
  }

  // Show next steps
  console.log(chalk.cyan('\nNext steps:\n'));
  console.log('  1. List reports: work-chronicler reports list');
  console.log('  2. Add more reports: work-chronicler reports add');
  console.log(
    '  3. Fetch data for a report: work-chronicler reports fetch <report-id>',
  );
  console.log();
  console.log(
    chalk.dim('Switch profiles: work-chronicler profile switch <name>'),
  );
  console.log(chalk.dim('List profiles:   work-chronicler profile list'));
}

/**
 * Prompt for GitHub token (manager mode)
 */
async function promptGitHubTokenForManager(): Promise<string> {
  console.log(
    chalk.dim('\nCreate a token at: https://github.com/settings/tokens'),
  );
  console.log(
    chalk.dim('Required scopes: repo or public_repo, read:org for orgs\n'),
  );

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
