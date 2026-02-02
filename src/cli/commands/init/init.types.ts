import type { Config } from '@core/index';

/**
 * Data sources that can be configured
 */
export type DataSource = 'github' | 'jira';

/**
 * Time range presets for lookback period
 */
export type TimeRange = '6m' | '1y' | '2y' | 'custom';

/**
 * GitHub organization configuration from wizard
 */
export interface WizardGitHubOrg {
  name: string;
  repos: string[];
}

/**
 * GitHub configuration from wizard
 */
export interface WizardGitHubConfig {
  username: string;
  orgs: WizardGitHubOrg[];
}

/**
 * JIRA instance configuration from wizard
 */
export interface WizardJiraInstance {
  name: string;
  url: string;
  email: string;
  projects: string[];
}

/**
 * JIRA configuration from wizard
 */
export interface WizardJiraConfig {
  instances: WizardJiraInstance[];
}

/**
 * Token configuration from wizard
 */
export interface WizardTokens {
  githubToken?: string;
  jiraToken?: string;
  jiraEmail?: string;
}

/**
 * Complete wizard result
 */
export interface WizardResult {
  profileName: string;
  dataSources: DataSource[];
  timeRange: TimeRange;
  since: string;
  github?: WizardGitHubConfig;
  jira?: WizardJiraConfig;
  tokens: WizardTokens;
  fetchNow: boolean;
}

/**
 * Convert wizard result to Config
 */
export function wizardResultToConfig(result: WizardResult): Config {
  const config: Config = {
    github: result.github
      ? {
          username: result.github.username,
          orgs: result.github.orgs.map((org) => ({
            name: org.name,
            repos: org.repos,
          })),
        }
      : { username: '', orgs: [] },
    output: { directory: './work-log' },
    fetch: {
      since: result.since,
      until: null,
    },
    analysis: {
      thresholds: {
        minor: { maxLines: 20, maxFiles: 3 },
        major: { minLines: 200, minFiles: 8 },
        flagship: { minLines: 500, minFiles: 15 },
      },
    },
  };

  if (result.jira && result.jira.instances.length > 0) {
    config.jira = {
      instances: result.jira.instances.map((instance) => ({
        name: instance.name,
        url: instance.url,
        email: instance.email,
        projects: instance.projects,
      })),
    };
  }

  return config;
}
