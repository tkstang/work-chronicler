import { z } from 'zod';

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
