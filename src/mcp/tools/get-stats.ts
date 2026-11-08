import * as fs from 'node:fs/promises';

import {
  DIRECTORIES,
  getAnalysisFilePath,
  readAllImportedRecords,
  readAllPRs,
  readAllTickets,
} from '@core/index';
import { z } from 'zod';

import {
  defineTool,
  jsonResult,
  parseAndValidateDate,
  subsetGapNote,
  textResult,
} from './types';

export const getStatsTool = defineTool({
  name: 'get_stats',
  description:
    'Get summary statistics about work history, optionally filtered by date range. Imported messages are counted in their own section, never as PRs or tickets',
  inputSchema: {
    since: z.string().optional().describe('Start date (ISO format)'),
    until: z.string().optional().describe('End date (ISO format)'),
  },
  handler: async (input, { outputDir, fullOutputDir }) => {
    // A subset made before messages were imported counts none: say why
    const gap = subsetGapNote(
      outputDir,
      fullOutputDir ?? outputDir,
      DIRECTORIES.MESSAGES,
    );

    // Without a date filter, return the generated stats.json verbatim
    if (!input.since && !input.until) {
      let text: string | undefined;
      try {
        const statsPath = getAnalysisFilePath(outputDir, 'stats');
        text = await fs.readFile(statsPath, 'utf-8');
      } catch {
        // Fall through to compute stats
      }
      if (text !== undefined) {
        return gap
          ? jsonResult({ ...JSON.parse(text), note: gap })
          : textResult(text);
      }
    }

    let prs = await readAllPRs(outputDir);
    let tickets = await readAllTickets(outputDir);
    let messages = (await readAllImportedRecords(outputDir)).filter(
      (record) => record.frontmatter.type === 'message',
    );

    if (input.since) {
      const sinceDate = parseAndValidateDate(input.since, 'since');
      prs = prs.filter((pr) => new Date(pr.frontmatter.createdAt) >= sinceDate);
      tickets = tickets.filter(
        (t) => new Date(t.frontmatter.createdAt) >= sinceDate,
      );
      messages = messages.filter(
        (m) => new Date(m.frontmatter.occurredAt) >= sinceDate,
      );
    }

    if (input.until) {
      const untilDate = parseAndValidateDate(input.until, 'until');
      prs = prs.filter((pr) => new Date(pr.frontmatter.createdAt) <= untilDate);
      tickets = tickets.filter(
        (t) => new Date(t.frontmatter.createdAt) <= untilDate,
      );
      messages = messages.filter(
        (m) => new Date(m.frontmatter.occurredAt) <= untilDate,
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

    const messagesBySource: Record<string, number> = {};
    for (const message of messages) {
      const source = message.frontmatter.source;
      messagesBySource[source] = (messagesBySource[source] ?? 0) + 1;
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
      // Supplementary evidence, counted apart and never added to PRs
      messages: {
        total: messages.length,
        bySource: messagesBySource,
      },
      dateRange: {
        earliest: sortedDates[0] ?? null,
        latest: sortedDates[sortedDates.length - 1] ?? null,
      },
      ...(gap ? { note: gap } : {}),
    });
  },
});
