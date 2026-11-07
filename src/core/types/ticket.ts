import { z } from 'zod';

/**
 * A JIRA project key from config, trimmed at parse time. Case is kept: the key
 * names the ticket storage directory (`jira/<org>/<key>/`), so changing it
 * would write a second copy of existing tickets. Code that matches against
 * ticket keys (the linker) compares case-insensitively at that site.
 */
export const JiraProjectKeySchema = z.string().trim();

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
