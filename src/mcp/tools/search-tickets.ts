import { readAllTickets } from '@core/index';
import { z } from 'zod';

import { defineTool, jsonResult, parseAndValidateDate } from './types';

export const searchTicketsTool = defineTool({
  name: 'search_tickets',
  description: 'Search JIRA tickets by project, status, or keywords',
  inputSchema: {
    query: z
      .string()
      .optional()
      .describe('Search term for key, summary, and body'),
    org: z.string().optional().describe('Filter by organization name'),
    project: z.string().optional().describe('Filter by JIRA project key'),
    status: z.string().optional().describe('Filter by ticket status'),
    since: z.string().optional().describe('Start date (ISO format)'),
    until: z.string().optional().describe('End date (ISO format)'),
    limit: z.number().optional().describe('Maximum number of results'),
  },
  handler: async (input, { outputDir }) => {
    let filtered = await readAllTickets(outputDir);

    if (input.org) {
      filtered = filtered.filter((t) => t.frontmatter.org === input.org);
    }

    if (input.project) {
      filtered = filtered.filter(
        (t) => t.frontmatter.project === input.project,
      );
    }

    if (input.status) {
      const status = input.status.toLowerCase();
      filtered = filtered.filter((t) =>
        t.frontmatter.status.toLowerCase().includes(status),
      );
    }

    if (input.since) {
      const sinceDate = parseAndValidateDate(input.since, 'since');
      filtered = filtered.filter(
        (t) => new Date(t.frontmatter.createdAt) >= sinceDate,
      );
    }

    if (input.until) {
      const untilDate = parseAndValidateDate(input.until, 'until');
      filtered = filtered.filter(
        (t) => new Date(t.frontmatter.createdAt) <= untilDate,
      );
    }

    if (input.query) {
      const queryLower = input.query.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.frontmatter.summary.toLowerCase().includes(queryLower) ||
          t.frontmatter.key.toLowerCase().includes(queryLower) ||
          t.body.toLowerCase().includes(queryLower),
      );
    }

    // Sort by date descending
    filtered.sort(
      (a, b) =>
        new Date(b.frontmatter.createdAt).getTime() -
        new Date(a.frontmatter.createdAt).getTime(),
    );

    const total = filtered.length;
    if (input.limit && input.limit > 0) {
      filtered = filtered.slice(0, input.limit);
    }

    const results = filtered.map((t) => ({
      key: t.frontmatter.key,
      summary: t.frontmatter.summary,
      url: t.frontmatter.url,
      project: t.frontmatter.project,
      status: t.frontmatter.status,
      issueType: t.frontmatter.issueType,
      createdAt: t.frontmatter.createdAt,
      storyPoints: t.frontmatter.storyPoints,
      linkedPRs: t.frontmatter.linkedPRs,
      body: t.body.slice(0, 500) + (t.body.length > 500 ? '...' : ''),
    }));

    return jsonResult({ results, total, returned: results.length });
  },
});
