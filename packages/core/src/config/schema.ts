import { z } from 'zod';

/**
 * Custom URL validator that ensures proper format (catches https:/example.com typos)
 */
const httpsUrl = z
  .string()
  .refine((url) => url.startsWith('https://'), {
    message: 'URL must start with https://',
  })
  .refine(
    (url) => {
      try {
        const parsed = new URL(url);
        return parsed.host.includes('.');
      } catch {
        return false;
      }
    },
    {
      message:
        'Must be a valid HTTPS URL (e.g., https://example.atlassian.net)',
    },
  );

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
  url: httpsUrl,
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
 * Impact threshold configuration for a single tier
 */
const ImpactThresholdSchema = z.object({
  minLines: z.number().optional(),
  maxLines: z.number().optional(),
  minFiles: z.number().optional(),
  maxFiles: z.number().optional(),
});

/**
 * Project detection configuration
 */
export const ProjectsConfigSchema = z.object({
  /** Time window in days for temporal clustering (default: 14) */
  timeWindowDays: z.number().default(14),
  /** Minimum PRs to form a temporal cluster (default: 2) */
  minClusterSize: z.number().default(2),
  /** Whether to include unlinked PRs in temporal clusters (default: true) */
  includeUnlinkedPRs: z.boolean().default(true),
});

/**
 * Analysis configuration with impact thresholds
 */
export const AnalysisConfigSchema = z.object({
  thresholds: z
    .object({
      minor: ImpactThresholdSchema.default({ maxLines: 20, maxFiles: 3 }),
      major: ImpactThresholdSchema.default({ minLines: 200, minFiles: 8 }),
      flagship: ImpactThresholdSchema.default({ minLines: 500, minFiles: 15 }),
    })
    .default({}),
  projects: ProjectsConfigSchema.default({}),
});

/**
 * Root configuration schema
 */
export const ConfigSchema = z.object({
  github: GitHubConfigSchema,
  jira: JiraConfigSchema.optional(),
  output: OutputConfigSchema.default({ directory: './work-log' }),
  fetch: FetchConfigSchema,
  analysis: AnalysisConfigSchema.default({}),
});

export type GitHubOrgConfig = z.infer<typeof GitHubOrgConfigSchema>;
export type GitHubConfig = z.infer<typeof GitHubConfigSchema>;
export type JiraInstanceConfig = z.infer<typeof JiraInstanceConfigSchema>;
export type JiraConfig = z.infer<typeof JiraConfigSchema>;
export type OutputConfig = z.infer<typeof OutputConfigSchema>;
export type FetchConfig = z.infer<typeof FetchConfigSchema>;
export type ProjectsConfig = z.infer<typeof ProjectsConfigSchema>;
export type AnalysisConfig = z.infer<typeof AnalysisConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
