import { z } from 'zod';

/**
 * PR impact levels for filtering and summarization
 * - flagship: Large initiatives, platform changes, multi-PR efforts (500+ lines or 15+ files)
 * - major: Significant features, larger refactors (200-499 lines or 8-14 files)
 * - standard: Regular feature work, bug fixes, moderate changes (20-199 lines)
 * - minor: Small fixes, typos, dependency bumps, docs (<20 lines)
 */
export const PRImpactSchema = z.enum([
  'flagship',
  'major',
  'standard',
  'minor',
]);
export type PRImpact = z.infer<typeof PRImpactSchema>;

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
  impact: PRImpactSchema.optional(),
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
