import { z } from 'zod';

/**
 * GitHub organization configuration
 */
export const GitHubOrgConfigSchema = z.object({
  name: z.string(),
  repos: z.array(z.string()).default(['*']),
});

/**
 * GitHub configuration
 */
export const GitHubConfigSchema = z.object({
  username: z.string(),
  token: z.string().optional(),
  orgs: z.array(GitHubOrgConfigSchema).default([]),
});

/**
 * JIRA instance configuration
 */
export const JiraInstanceConfigSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  email: z.string().email().optional(),
  token: z.string().optional(),
  projects: z.array(z.string()).default([]),
});

/**
 * JIRA configuration
 */
export const JiraConfigSchema = z.object({
  instances: z.array(JiraInstanceConfigSchema).default([]),
});

/**
 * Output configuration
 */
export const OutputConfigSchema = z.object({
  directory: z.string().default('./work-log'),
});

/**
 * Fetch configuration
 */
export const FetchConfigSchema = z.object({
  since: z.string(),
  until: z.string().nullable().default(null),
});

/**
 * Root configuration schema
 */
export const ConfigSchema = z.object({
  github: GitHubConfigSchema,
  jira: JiraConfigSchema.optional(),
  output: OutputConfigSchema.default({ directory: './work-log' }),
  fetch: FetchConfigSchema,
});

export type GitHubOrgConfig = z.infer<typeof GitHubOrgConfigSchema>;
export type GitHubConfig = z.infer<typeof GitHubConfigSchema>;
export type JiraInstanceConfig = z.infer<typeof JiraInstanceConfigSchema>;
export type JiraConfig = z.infer<typeof JiraConfigSchema>;
export type OutputConfig = z.infer<typeof OutputConfigSchema>;
export type FetchConfig = z.infer<typeof FetchConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
