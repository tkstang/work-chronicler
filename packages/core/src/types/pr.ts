import { z } from 'zod';

/**
 * Schema for a Pull Request stored in the work-log
 */
export const PullRequestSchema = z.object({
  title: z.string(),
  prNumber: z.number(),
  repository: z.string(),
  org: z.string(),
  author: z.string(),
  state: z.enum(['open', 'closed', 'merged']),
  createdAt: z.string().datetime(),
  mergedAt: z.string().datetime().nullable(),
  closedAt: z.string().datetime().nullable(),
  url: z.string().url(),
  additions: z.number(),
  deletions: z.number(),
  changedFiles: z.number(),
  jiraTickets: z.array(z.string()).default([]),
  labels: z.array(z.string()).default([]),
});

export type PullRequest = z.infer<typeof PullRequestSchema>;

/**
 * PR file with frontmatter and body content
 */
export interface PullRequestFile {
  frontmatter: PullRequest;
  body: string;
  filePath: string;
}
