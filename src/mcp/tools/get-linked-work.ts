import { readAllPRs, readAllTickets } from '@core/index';
import { z } from 'zod';

import { defineTool, jsonResult } from './types';

/** The number in a PR URL's `/pull/<number>` segment, or null. */
function pullNumberOf(url: string): number | null {
  const match = /\/pull\/(\d+)\/?$/.exec(url);
  return match?.[1] ? Number(match[1]) : null;
}

export const getLinkedWorkTool = defineTool({
  name: 'get_linked_work',
  description:
    'Get a PR with its linked JIRA tickets, or a ticket with its linked PRs',
  inputSchema: {
    prUrl: z
      .string()
      .optional()
      .describe('GitHub PR URL to look up, or a bare PR number'),
    ticketKey: z.string().optional().describe('JIRA ticket key to look up'),
  },
  handler: async (input, { outputDir }) => {
    if (!input.prUrl && !input.ticketKey) {
      return jsonResult({
        error: 'Either prUrl or ticketKey must be provided',
      });
    }

    const allPRs = await readAllPRs(outputDir);
    const allTickets = await readAllTickets(outputDir);

    if (input.prUrl) {
      const prUrl = input.prUrl.trim();
      // An exact URL wins. Bare digits fall back to the PR number, compared
      // against the URL's whole `/pull/<number>` segment so "23" never
      // matches PR 123.
      let matches = allPRs.filter((p) => p.frontmatter.url === prUrl);
      if (matches.length === 0 && /^\d+$/.test(prUrl)) {
        const prNumber = Number(prUrl);
        matches = allPRs.filter(
          (p) => pullNumberOf(p.frontmatter.url) === prNumber,
        );
      }

      const [pr] = matches;
      if (!pr) {
        return jsonResult({ error: 'PR not found' });
      }
      if (matches.length > 1) {
        return jsonResult({
          error: `PR number ${prUrl} matches several PRs; pass the full URL`,
          matches: matches.map((p) => p.frontmatter.url),
        });
      }

      const linkedTickets = allTickets.filter((t) =>
        pr.frontmatter.jiraTickets?.includes(t.frontmatter.key),
      );

      return jsonResult({
        pr: {
          ...pr.frontmatter,
          body: pr.body,
        },
        linkedTickets: linkedTickets.map((t) => ({
          ...t.frontmatter,
          body: t.body,
        })),
      });
    }

    if (input.ticketKey) {
      const ticketKey = input.ticketKey.toLowerCase();
      const ticket = allTickets.find(
        (t) => t.frontmatter.key.toLowerCase() === ticketKey,
      );

      if (!ticket) {
        return jsonResult({ error: 'Ticket not found' });
      }

      const linkedPRs = allPRs.filter((p) =>
        p.frontmatter.jiraTickets?.includes(ticket.frontmatter.key),
      );

      return jsonResult({
        ticket: {
          ...ticket.frontmatter,
          body: ticket.body,
        },
        linkedPRs: linkedPRs.map((p) => ({
          ...p.frontmatter,
          body: p.body,
        })),
      });
    }

    return jsonResult({});
  },
});
