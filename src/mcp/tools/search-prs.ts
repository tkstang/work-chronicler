import { readAllPRs } from '@core/index';
import { z } from 'zod';

import { defineTool, jsonResult, parseAndValidateDate } from './types';

export const searchPrsTool = defineTool({
  name: 'search_prs',
  description:
    'Search pull requests by date range, repository, keywords, or impact level',
  inputSchema: {
    query: z.string().optional().describe('Search term for title and body'),
    org: z.string().optional().describe('Filter by organization name'),
    repo: z.string().optional().describe('Filter by repository name'),
    impact: z
      .enum(['flagship', 'major', 'standard', 'minor'])
      .optional()
      .describe('Filter by impact level'),
    state: z
      .enum(['merged', 'open', 'closed'])
      .optional()
      .describe('Filter by PR state'),
    since: z
      .string()
      .optional()
      .describe('Start date (ISO format, e.g., 2025-01-01)'),
    until: z
      .string()
      .optional()
      .describe('End date (ISO format, e.g., 2025-12-31)'),
    limit: z.number().optional().describe('Maximum number of results'),
  },
  handler: async (input, { outputDir }) => {
    let filtered = await readAllPRs(outputDir);

    if (input.org) {
      filtered = filtered.filter((pr) => pr.frontmatter.org === input.org);
    }

    if (input.repo) {
      const repo = input.repo;
      filtered = filtered.filter((pr) =>
        pr.frontmatter.repository.includes(repo),
      );
    }

    if (input.impact) {
      filtered = filtered.filter(
        (pr) => pr.frontmatter.impact === input.impact,
      );
    }

    if (input.state) {
      filtered = filtered.filter((pr) => pr.frontmatter.state === input.state);
    }

    if (input.since) {
      const sinceDate = parseAndValidateDate(input.since, 'since');
      filtered = filtered.filter(
        (pr) => new Date(pr.frontmatter.createdAt) >= sinceDate,
      );
    }

    if (input.until) {
      const untilDate = parseAndValidateDate(input.until, 'until');
      filtered = filtered.filter(
        (pr) => new Date(pr.frontmatter.createdAt) <= untilDate,
      );
    }

    if (input.query) {
      const queryLower = input.query.toLowerCase();
      filtered = filtered.filter(
        (pr) =>
          pr.frontmatter.title.toLowerCase().includes(queryLower) ||
          pr.body.toLowerCase().includes(queryLower),
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

    // Format results for LLM consumption
    const results = filtered.map((pr) => ({
      title: pr.frontmatter.title,
      url: pr.frontmatter.url,
      repository: pr.frontmatter.repository,
      state: pr.frontmatter.state,
      impact: pr.frontmatter.impact,
      createdAt: pr.frontmatter.createdAt,
      mergedAt: pr.frontmatter.mergedAt,
      additions: pr.frontmatter.additions,
      deletions: pr.frontmatter.deletions,
      jiraTickets: pr.frontmatter.jiraTickets,
      body: pr.body.slice(0, 500) + (pr.body.length > 500 ? '...' : ''),
    }));

    return jsonResult({ results, total, returned: results.length });
  },
});
