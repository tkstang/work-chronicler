import { readAllPRs, readAllTickets } from '@core/index';
import { z } from 'zod';

import { defineTool, jsonResult } from './types';

export const getLinkedWorkTool = defineTool({
  name: 'get_linked_work',
  description:
    'Get a PR with its linked JIRA tickets, or a ticket with its linked PRs',
  inputSchema: {
    prUrl: z.string().optional().describe('GitHub PR URL to look up'),
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
      const prUrl = input.prUrl;
      const pr = allPRs.find(
        (p) =>
          p.frontmatter.url === prUrl ||
          p.frontmatter.url.endsWith(prUrl.replace(/.*\/pull\//, '')),
      );

      if (!pr) {
        return jsonResult({ error: 'PR not found' });
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
