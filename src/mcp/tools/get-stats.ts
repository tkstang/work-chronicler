import * as fs from 'node:fs/promises';

import { countDocuments, countMessages } from '@analyzer/stats';
import {
  DIRECTORIES,
  getAnalysisFilePath,
  isDocumentFile,
  isMessageFile,
  readAllImportedRecords,
  readAllPRs,
  readAllTickets,
} from '@core/index';
import { z } from 'zod';

import {
  defineTool,
  jsonResult,
  parseAndValidateDate,
  parseUntilDate,
  subsetGapNote,
  textResult,
} from './types';

export const getStatsTool = defineTool({
  name: 'get_stats',
  description:
    'Get summary statistics about work history, optionally filtered by date range. Imported messages and imported Google Docs (Docs the subject owns, dated by modified time) are counted in their own sections, never as PRs or tickets',
  inputSchema: {
    since: z.string().optional().describe('Start date (ISO format)'),
    until: z
      .string()
      .optional()
      .describe(
        'End date (ISO format; a date alone includes that whole UTC day)',
      ),
  },
  handler: async (input, { outputDir, fullOutputDir }) => {
    // A subset made before messages or Docs were imported counts none: say
    // why
    const gaps = [DIRECTORIES.MESSAGES, DIRECTORIES.DOCUMENTS].flatMap(
      (directory) =>
        subsetGapNote(outputDir, fullOutputDir ?? outputDir, directory) ?? [],
    );
    const gap = gaps.length > 0 ? gaps.join(' ') : undefined;

    // Without a date filter, return the generated stats.json, with its
    // messages and Docs counted afresh: those imported after the analysis
    // ran are counted, as the computed statistics count them
    if (!input.since && !input.until) {
      let text: string | undefined;
      try {
        const statsPath = getAnalysisFilePath(outputDir, 'stats');
        text = await fs.readFile(statsPath, 'utf-8');
      } catch {
        // Fall through to compute stats
      }
      if (text !== undefined) {
        let cached: unknown;
        try {
          cached = JSON.parse(text);
        } catch {
          // Not JSON: returned as it is
        }
        if (
          typeof cached !== 'object' ||
          cached === null ||
          Array.isArray(cached)
        ) {
          return textResult(text);
        }
        const imported = await readAllImportedRecords(outputDir);
        return jsonResult({
          ...cached,
          messages: countMessages(imported),
          documents: countDocuments(imported),
          ...(gap ? { note: gap } : {}),
        });
      }
    }

    let prs = await readAllPRs(outputDir);
    let tickets = await readAllTickets(outputDir);
    const imported = await readAllImportedRecords(outputDir);
    let messages = imported.filter(isMessageFile);
    // Dated by modified time (occurredAt): a Doc created before the range
    // but modified inside it is counted
    let documents = imported.filter(isDocumentFile);

    if (input.since) {
      const sinceDate = parseAndValidateDate(input.since, 'since');
      prs = prs.filter((pr) => new Date(pr.frontmatter.createdAt) >= sinceDate);
      tickets = tickets.filter(
        (t) => new Date(t.frontmatter.createdAt) >= sinceDate,
      );
      messages = messages.filter(
        (m) => new Date(m.frontmatter.occurredAt) >= sinceDate,
      );
      documents = documents.filter(
        (d) => new Date(d.frontmatter.occurredAt) >= sinceDate,
      );
    }

    if (input.until) {
      const untilDate = parseUntilDate(input.until, 'until');
      prs = prs.filter((pr) => new Date(pr.frontmatter.createdAt) <= untilDate);
      tickets = tickets.filter(
        (t) => new Date(t.frontmatter.createdAt) <= untilDate,
      );
      messages = messages.filter(
        (m) => new Date(m.frontmatter.occurredAt) <= untilDate,
      );
      documents = documents.filter(
        (d) => new Date(d.frontmatter.occurredAt) <= untilDate,
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

    const documentsBySource: Record<string, number> = {};
    for (const document of documents) {
      const source = document.frontmatter.source;
      documentsBySource[source] = (documentsBySource[source] ?? 0) + 1;
    }

    // Everything counted, messages and Docs included, ordered by time (the
    // sources write dates in different formats)
    const sortedDates = [
      ...prs.map((pr) => pr.frontmatter.createdAt),
      ...tickets.map((t) => t.frontmatter.createdAt),
      ...messages.map((m) => m.frontmatter.occurredAt),
      ...documents.map((d) => d.frontmatter.occurredAt),
    ]
      .filter((date) => date && !Number.isNaN(new Date(date).getTime()))
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

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
      // Docs the subject owns (not necessarily wrote), by modified time
      documents: {
        total: documents.length,
        bySource: documentsBySource,
      },
      dateRange: {
        earliest: sortedDates[0] ?? null,
        latest: sortedDates[sortedDates.length - 1] ?? null,
      },
      ...(gap ? { note: gap } : {}),
    });
  },
});
