import { z } from 'zod';

import { PRImpactSchema } from './pr';

/**
 * A PR entry in the timeline
 */
export const TimelinePRSchema = z.object({
  url: z.string(),
  title: z.string(),
  repository: z.string(),
  org: z.string(),
  prNumber: z.number(),
  state: z.enum(['open', 'closed', 'merged']),
  impact: PRImpactSchema.optional(),
  additions: z.number(),
  deletions: z.number(),
  jiraTickets: z.array(z.string()),
  date: z.string(), // ISO date (YYYY-MM-DD)
});
export type TimelinePR = z.infer<typeof TimelinePRSchema>;

/**
 * A ticket entry in the timeline
 */
export const TimelineTicketSchema = z.object({
  key: z.string(),
  summary: z.string(),
  project: z.string(),
  issueType: z.string(),
  status: z.string(),
  linkedPRs: z.array(z.string()),
  date: z.string(), // ISO date (YYYY-MM-DD)
});
export type TimelineTicket = z.infer<typeof TimelineTicketSchema>;

/**
 * An imported Google Doc in the timeline, dated by its modified time. The
 * subject owns it; owning is not writing, so it is not authored work.
 */
export const TimelineDocumentSchema = z.object({
  source: z.string(),
  title: z.string(),
  url: z.string().nullable(),
  createdAt: z.string(),
  modifiedAt: z.string(),
  date: z.string(), // ISO date (YYYY-MM-DD) of the modified time
});
export type TimelineDocument = z.infer<typeof TimelineDocumentSchema>;

/**
 * A single week in the timeline
 */
export const TimelineWeekSchema = z.object({
  weekStart: z.string(), // ISO date of Monday
  weekEnd: z.string(), // ISO date of Sunday
  weekNumber: z.number(), // Week number in year (1-53)
  year: z.number(),
  prs: z.array(TimelinePRSchema),
  tickets: z.array(TimelineTicketSchema),
  /** Imported Docs (absent from timelines written before 0.7.0) */
  documents: z.array(TimelineDocumentSchema).default([]),
  stats: z.object({
    prCount: z.number(),
    ticketCount: z.number(),
    documentCount: z.number().default(0),
    additions: z.number(),
    deletions: z.number(),
    byImpact: z.object({
      flagship: z.number(),
      major: z.number(),
      standard: z.number(),
      minor: z.number(),
    }),
  }),
});
export type TimelineWeek = z.infer<typeof TimelineWeekSchema>;

/**
 * A single month in the timeline
 */
export const TimelineMonthSchema = z.object({
  month: z.string(), // YYYY-MM format
  monthName: z.string(), // e.g., "January 2025"
  weeks: z.array(TimelineWeekSchema),
  stats: z.object({
    prCount: z.number(),
    ticketCount: z.number(),
    documentCount: z.number().default(0),
    additions: z.number(),
    deletions: z.number(),
    byImpact: z.object({
      flagship: z.number(),
      major: z.number(),
      standard: z.number(),
      minor: z.number(),
    }),
  }),
});
export type TimelineMonth = z.infer<typeof TimelineMonthSchema>;

/**
 * Full timeline analysis output
 */
export const TimelineAnalysisSchema = z.object({
  generatedAt: z.string(),
  dateRange: z.object({
    since: z.string(),
    until: z.string(),
  }),
  months: z.array(TimelineMonthSchema),
  summary: z.object({
    totalWeeks: z.number(),
    totalMonths: z.number(),
    busiestWeek: z
      .object({
        weekStart: z.string(),
        prCount: z.number(),
      })
      .optional(),
    busiestMonth: z
      .object({
        month: z.string(),
        prCount: z.number(),
      })
      .optional(),
  }),
});
export type TimelineAnalysis = z.infer<typeof TimelineAnalysisSchema>;
