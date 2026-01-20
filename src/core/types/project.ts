import { z } from 'zod';

/**
 * Confidence level for project grouping detection
 */
export const ProjectConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type ProjectConfidence = z.infer<typeof ProjectConfidenceSchema>;

/**
 * Signal type that led to project grouping
 */
export const ProjectSignalSchema = z.enum([
  'tickets', // PRs share JIRA tickets
  'jiraProject', // PRs in same JIRA project
  'time', // PRs within time proximity
  'labels', // PRs share labels/patterns
]);
export type ProjectSignal = z.infer<typeof ProjectSignalSchema>;

/**
 * Signals that contributed to a project grouping
 */
export const ProjectSignalsSchema = z.object({
  sharedTickets: z.array(z.string()).default([]),
  jiraProject: z.string().optional(),
  timeRange: z
    .object({
      earliest: z.string(),
      latest: z.string(),
    })
    .optional(),
  sharedLabels: z.array(z.string()).default([]),
  commonKeywords: z.array(z.string()).default([]),
});
export type ProjectSignals = z.infer<typeof ProjectSignalsSchema>;

/**
 * A detected project grouping of related PRs and tickets
 */
export const ProjectGroupingSchema = z.object({
  projectId: z.string(),
  name: z.string(),
  description: z.string().optional(),
  prUrls: z.array(z.string()),
  ticketKeys: z.array(z.string()),
  signals: ProjectSignalsSchema,
  confidence: ProjectConfidenceSchema,
  dominantSignal: ProjectSignalSchema,
  stats: z.object({
    prCount: z.number(),
    ticketCount: z.number(),
    totalAdditions: z.number(),
    totalDeletions: z.number(),
    repos: z.array(z.string()),
  }),
});
export type ProjectGrouping = z.infer<typeof ProjectGroupingSchema>;

/**
 * Output of project detection analysis
 */
export const ProjectsAnalysisSchema = z.object({
  generatedAt: z.string(),
  dateRange: z.object({
    since: z.string(),
    until: z.string(),
  }),
  projects: z.array(ProjectGroupingSchema),
  summary: z.object({
    totalProjects: z.number(),
    byConfidence: z.object({
      high: z.number(),
      medium: z.number(),
      low: z.number(),
    }),
    bySignal: z.object({
      tickets: z.number(),
      jiraProject: z.number(),
      time: z.number(),
      labels: z.number(),
    }),
    unassignedPRs: z.number(),
  }),
});
export type ProjectsAnalysis = z.infer<typeof ProjectsAnalysisSchema>;
