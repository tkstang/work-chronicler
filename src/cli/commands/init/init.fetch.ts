import { fetchGitHubPRs } from '@commands/fetch/github/github.utils';
import { fetchJiraTickets } from '@commands/fetch/jira/jira.utils';
import type { Config } from '@core/index';
import { linkPRsToTickets } from '@linker/index';
import chalk from 'chalk';

import type { DataSource } from './init.prompts';
import type { WizardTokens } from './init.types';

/**
 * List the tokens a fetch still needs for the selected data sources
 */
export function getMissingTokensForFetch(
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

/**
 * Overlay tokens entered during the wizard onto the saved config
 */
export function withRuntimeTokens(
  config: Config,
  tokens: WizardTokens,
): Config {
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

/**
 * Fetch, link and summarize work history right after setup
 */
export async function runInitialFetch(
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
