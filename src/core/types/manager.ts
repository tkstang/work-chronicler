import { z } from 'zod';

/**
 * Manager mode types and schemas
 */

/**
 * Report configuration schema
 */
export const ReportConfigSchema = z.object({
  /** Display name (e.g., "Alice Smith") */
  name: z.string(),
  /** GitHub username */
  github: z.string(),
  /** Email for commit/Jira attribution */
  email: z.string().email(),
  /** Repos to fetch (no org prefix) */
  repos: z.array(z.string()).default([]),
  /** Jira projects to fetch */
  jiraProjects: z.array(z.string()).default([]),
});
export type ReportConfig = z.infer<typeof ReportConfigSchema>;

/**
 * Manager profile configuration schema
 */
export const ManagerConfigSchema = z.object({
  mode: z.literal('manager'),
  github: z.object({
    token: z.string().optional(), // Token stored in .env, not config
    org: z.string(), // Single org (Phase 4 constraint)
  }),
  jira: z
    .object({
      host: z.string(),
      email: z.string().email(),
      token: z.string().optional(), // Token stored in .env, not config
    })
    .optional(),
  reports: z.array(ReportConfigSchema).default([]),
});
export type ManagerConfig = z.infer<typeof ManagerConfigSchema>;

/**
 * Report metadata for display
 */
export interface ReportMetadata {
  /** Kebab-case directory name */
  id: string;
  /** Display name */
  name: string;
  /** GitHub username */
  github: string;
  /** Email address */
  email: string;
  /** Number of repos configured */
  repoCount: number;
  /** Number of Jira projects configured */
  jiraProjectCount: number;
  /** Last fetch timestamp (ISO 8601) */
  lastFetchTime?: string;
}
