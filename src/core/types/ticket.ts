import { z } from 'zod';

/**
 * A JIRA project key from config, trimmed and upper-cased at parse time.
 * JIRA project keys are upper case (they prefix ticket keys like `PROJ-123`),
 * so fetch, storage paths and the linker all see the same key.
 */
export const JiraProjectKeySchema = z.string().trim().toUpperCase();

/**
 * Schema for a JIRA ticket stored in the work-log
 */
export const JiraTicketSchema = z.object({
  key: z.string(),
  summary: z.string(),
  project: z.string(),
  org: z.string(),
  issueType: z.string(),
  status: z.string(),
  storyPoints: z.number().nullable(),
  url: z.string(), // Not validated as URL since config may have typos
  createdAt: z.string(), // Not strict datetime since JIRA uses various formats
  resolvedAt: z.string().nullable(),
  linkedPRs: z.array(z.string()).default([]),
});

export type JiraTicket = z.infer<typeof JiraTicketSchema>;

/**
 * Ticket file with frontmatter and body content
 */
export interface JiraTicketFile {
  frontmatter: JiraTicket;
  body: string;
  filePath: string;
}
