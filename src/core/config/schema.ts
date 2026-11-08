import { GitHubNameSchema, OptionalGitHubNameSchema } from '@wc-types/github';
import { SlackConfigSchema } from '@wc-types/slack';
import { JiraProjectKeySchema } from '@wc-types/ticket';
import { z } from 'zod';

/**
 * Custom URL validator that ensures proper format (catches https:/example.com typos)
 */
const httpsUrl = z
  .string()
  .refine((url) => url.startsWith('https://'), {
    error: 'URL must start with https://',
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
      error: 'Must be a valid HTTPS URL (e.g., https://example.atlassian.net)',
    },
  );

/**
 * GitHub organization configuration
 */
export const GitHubOrgConfigSchema = z.object({
  name: GitHubNameSchema,
  repos: z.array(z.string()).default(['*']),
});

/**
 * GitHub configuration
 */
export const GitHubConfigSchema = z
  .object({
    // May be empty for JIRA-only profiles (no orgs)
    username: OptionalGitHubNameSchema,
    token: z.string().optional(),
    orgs: z.array(GitHubOrgConfigSchema).default([]),
  })
  .superRefine((github, ctx) => {
    if (github.orgs.length > 0 && !github.username) {
      ctx.addIssue({
        code: 'custom',
        path: ['username'],
        message: 'GitHub username is required when orgs are configured',
      });
    }
  });

/**
 * JIRA instance configuration
 */
export const JiraInstanceConfigSchema = z.object({
  name: z.string(),
  url: httpsUrl,
  email: z.email().optional(),
  token: z.string().optional(),
  projects: z.array(JiraProjectKeySchema).default([]),
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
 * Analysis configuration with impact thresholds
 */
export const AnalysisConfigSchema = z.object({
  thresholds: z
    .object({
      minor: ImpactThresholdSchema.default({ maxLines: 20, maxFiles: 3 }),
      major: ImpactThresholdSchema.default({ minLines: 200, minFiles: 8 }),
      flagship: ImpactThresholdSchema.default({ minLines: 500, minFiles: 15 }),
    })
    // prefault (not default): Zod 4 returns a default as-is, while prefault
    // parses it so the per-tier defaults above still apply.
    .prefault({}),
});

/**
 * Root configuration schema
 */
export const ConfigSchema = z.object({
  github: GitHubConfigSchema,
  jira: JiraConfigSchema.optional(),
  output: OutputConfigSchema.default({ directory: './work-log' }),
  fetch: FetchConfigSchema,
  analysis: AnalysisConfigSchema.prefault({}),
  /** Slack messages an import skill may collect for this IC (opt-in) */
  slack: SlackConfigSchema.optional(),
});

export type GitHubOrgConfig = z.infer<typeof GitHubOrgConfigSchema>;
export type GitHubConfig = z.infer<typeof GitHubConfigSchema>;
export type JiraInstanceConfig = z.infer<typeof JiraInstanceConfigSchema>;
export type JiraConfig = z.infer<typeof JiraConfigSchema>;
export type OutputConfig = z.infer<typeof OutputConfigSchema>;
export type FetchConfig = z.infer<typeof FetchConfigSchema>;
export type AnalysisConfig = z.infer<typeof AnalysisConfigSchema>;
export type Config = z.infer<typeof ConfigSchema>;
