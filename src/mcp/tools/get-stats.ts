import * as fs from 'node:fs/promises';

import { getAnalysisFilePath, readAllPRs, readAllTickets } from '@core/index';
import { z } from 'zod';

import {
  defineTool,
  jsonResult,
  parseAndValidateDate,
  textResult,
} from './types';

export const getStatsTool = defineTool({
  name: 'get_stats',
  description:
    'Get summary statistics about work history, optionally filtered by date range',
  inputSchema: {
    since: z.string().optional().describe('Start date (ISO format)'),
    until: z.string().optional().describe('End date (ISO format)'),
  },
  handler: async (input, { outputDir }) => {
    // Without a date filter, return the generated stats.json verbatim
    if (!input.since && !input.until) {
      try {
        const statsPath = getAnalysisFilePath(outputDir, 'stats');
        return textResult(await fs.readFile(statsPath, 'utf-8'));
      } catch {
        // Fall through to compute stats
      }
    }

    let prs = await readAllPRs(outputDir);
    let tickets = await readAllTickets(outputDir);

    if (input.since) {
      const sinceDate = parseAndValidateDate(input.since, 'since');
      prs = prs.filter((pr) => new Date(pr.frontmatter.createdAt) >= sinceDate);
      tickets = tickets.filter(
        (t) => new Date(t.frontmatter.createdAt) >= sinceDate,
      );
    }

    if (input.until) {
      const untilDate = parseAndValidateDate(input.until, 'until');
      prs = prs.filter((pr) => new Date(pr.frontmatter.createdAt) <= untilDate);
      tickets = tickets.filter(
        (t) => new Date(t.frontmatter.createdAt) <= untilDate,
      );
    }

    // PR stats
    const prsByOrg: Record<string, number> = {};
    const prsByRepo: Record<string, number> = {};
    const prsByState: Record<string, number> = {};
    const prsByImpact: Record<string, number> = {};
    let totalAdditions = 0;
    let totalDeletions = 0;

    for (const pr of prs) {
      prsByOrg[pr.frontmatter.org] = (prsByOrg[pr.frontmatter.org] ?? 0) + 1;
      prsByRepo[pr.frontmatter.repository] =
        (prsByRepo[pr.frontmatter.repository] ?? 0) + 1;
      prsByState[pr.frontmatter.state] =
        (prsByState[pr.frontmatter.state] ?? 0) + 1;
      const impact = pr.frontmatter.impact || 'standard';
      prsByImpact[impact] = (prsByImpact[impact] ?? 0) + 1;
      totalAdditions += pr.frontmatter.additions;
      totalDeletions += pr.frontmatter.deletions;
    }

    // Ticket stats
    const ticketsByOrg: Record<string, number> = {};
    const ticketsByProject: Record<string, number> = {};
    const ticketsByStatus: Record<string, number> = {};
    let totalStoryPoints = 0;

    for (const ticket of tickets) {
      ticketsByOrg[ticket.frontmatter.org] =
        (ticketsByOrg[ticket.frontmatter.org] ?? 0) + 1;
      ticketsByProject[ticket.frontmatter.project] =
        (ticketsByProject[ticket.frontmatter.project] ?? 0) + 1;
      ticketsByStatus[ticket.frontmatter.status] =
        (ticketsByStatus[ticket.frontmatter.status] ?? 0) + 1;
      totalStoryPoints += ticket.frontmatter.storyPoints ?? 0;
    }

    const sortedDates = [
      ...prs.map((pr) => pr.frontmatter.createdAt),
      ...tickets.map((t) => t.frontmatter.createdAt),
    ]
      .filter(Boolean)
      .sort();

    const prsWithTickets = prs.filter(
      (pr) => pr.frontmatter.jiraTickets?.length,
    ).length;

    return jsonResult({
      prs: {
        total: prs.length,
        byOrg: prsByOrg,
        byRepo: prsByRepo,
        byState: prsByState,
        byImpact: prsByImpact,
        linkedToTickets: prsWithTickets,
        totalAdditions,
        totalDeletions,
      },
      tickets: {
        total: tickets.length,
        byOrg: ticketsByOrg,
        byProject: ticketsByProject,
        byStatus: ticketsByStatus,
        totalStoryPoints,
      },
      dateRange: {
        earliest: sortedDates[0] ?? null,
        latest: sortedDates[sortedDates.length - 1] ?? null,
      },
    });
  },
});
