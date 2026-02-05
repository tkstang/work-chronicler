import { type Config, ConfigSchema } from '@core/index';
import type { DataSource, TimeRange } from './init.prompts';

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
  until: string | null;
  github?: WizardGitHubConfig;
  jira?: WizardJiraConfig;
  tokens: WizardTokens;
  fetchNow: boolean;
}

/**
 * Convert wizard result to Config.
 * Uses ConfigSchema.parse() to apply Zod defaults for analysis thresholds etc.
 */
export function wizardResultToConfig(result: WizardResult): Config {
  const rawConfig = {
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
      until: result.until ?? null,
    },
    // Let Zod apply analysis defaults
    jira:
      result.jira && result.jira.instances.length > 0
        ? {
            instances: result.jira.instances.map((instance) => ({
              name: instance.name,
              url: instance.url,
              email: instance.email,
              projects: instance.projects,
            })),
          }
        : undefined,
  };

  // Parse through Zod to apply all defaults
  return ConfigSchema.parse(rawConfig);
}
