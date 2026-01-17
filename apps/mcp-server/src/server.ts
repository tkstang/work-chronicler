import * as fs from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  type Config,
  findConfigPath,
  getAnalysisFilePath,
  getOutputDirectory,
  loadConfig,
  type ProjectGrouping,
  readAllPRs,
  readAllTickets,
  type TimelineMonth,
  type TimelineWeek,
} from '@work-chronicler/core';
import { z } from 'zod';

export interface MCPServerContext {
  config: Config;
  outputDir: string;
  server: McpServer;
}

/**
 * Create and configure the MCP server with all tools
 */
export async function createServer(): Promise<MCPServerContext> {
  const configPath = findConfigPath();
  const config = await loadConfig();
  const outputDir = getOutputDirectory(config, configPath ?? undefined);

  const server = new McpServer({
    name: 'work-chronicler',
    version: '0.1.0',
  });

  // Register all tools
  registerSearchPRsTool(server, outputDir);
  registerSearchTicketsTool(server, outputDir);
  registerGetLinkedWorkTool(server, outputDir);
  registerListReposTool(server, outputDir);
  registerGetStatsTool(server, outputDir);
  registerGetProjectsTool(server, outputDir);
  registerGetTimelineTool(server, outputDir);

  return {
    config,
    outputDir,
    server,
  };
}

/**
 * Start the MCP server using stdio transport
 */
export async function startServer(ctx: MCPServerContext): Promise<void> {
  const transport = new StdioServerTransport();
  await ctx.server.connect(transport);
}

// =============================================================================
// Tool Implementations
// =============================================================================

function registerSearchPRsTool(server: McpServer, outputDir: string) {
  server.tool(
    'search_prs',
    'Search pull requests by date range, repository, keywords, or impact level',
    {
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
    async (input) => {
      const allPRs = await readAllPRs(outputDir);
      let filtered = allPRs;

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
        filtered = filtered.filter(
          (pr) => pr.frontmatter.state === input.state,
        );
      }

      if (input.since) {
        const sinceDate = new Date(input.since);
        filtered = filtered.filter(
          (pr) => new Date(pr.frontmatter.createdAt) >= sinceDate,
        );
      }

      if (input.until) {
        const untilDate = new Date(input.until);
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

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ results, total, returned: results.length }),
          },
        ],
      };
    },
  );
}

function registerSearchTicketsTool(server: McpServer, outputDir: string) {
  server.tool(
    'search_tickets',
    'Search JIRA tickets by project, status, or keywords',
    {
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
    async (input) => {
      const allTickets = await readAllTickets(outputDir);
      let filtered = allTickets;

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
        const sinceDate = new Date(input.since);
        filtered = filtered.filter(
          (t) => new Date(t.frontmatter.createdAt) >= sinceDate,
        );
      }

      if (input.until) {
        const untilDate = new Date(input.until);
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

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ results, total, returned: results.length }),
          },
        ],
      };
    },
  );
}

function registerGetLinkedWorkTool(server: McpServer, outputDir: string) {
  server.tool(
    'get_linked_work',
    'Get a PR with its linked JIRA tickets, or a ticket with its linked PRs',
    {
      prUrl: z.string().optional().describe('GitHub PR URL to look up'),
      ticketKey: z.string().optional().describe('JIRA ticket key to look up'),
    },
    async (input) => {
      if (!input.prUrl && !input.ticketKey) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Either prUrl or ticketKey must be provided',
              }),
            },
          ],
        };
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
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: 'PR not found' }),
              },
            ],
          };
        }

        const linkedTickets = allTickets.filter((t) =>
          pr.frontmatter.jiraTickets?.includes(t.frontmatter.key),
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                pr: {
                  ...pr.frontmatter,
                  body: pr.body,
                },
                linkedTickets: linkedTickets.map((t) => ({
                  ...t.frontmatter,
                  body: t.body,
                })),
              }),
            },
          ],
        };
      }

      if (input.ticketKey) {
        const ticket = allTickets.find(
          (t) =>
            t.frontmatter.key.toLowerCase() === input.ticketKey?.toLowerCase(),
        );

        if (!ticket) {
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ error: 'Ticket not found' }),
              },
            ],
          };
        }

        const linkedPRs = allPRs.filter((p) =>
          p.frontmatter.jiraTickets?.includes(ticket.frontmatter.key),
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                ticket: {
                  ...ticket.frontmatter,
                  body: ticket.body,
                },
                linkedPRs: linkedPRs.map((p) => ({
                  ...p.frontmatter,
                  body: p.body,
                })),
              }),
            },
          ],
        };
      }

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({}) }],
      };
    },
  );
}

function registerListReposTool(server: McpServer, outputDir: string) {
  server.tool(
    'list_repos',
    'List all repositories with data and their statistics',
    {},
    async () => {
      const allPRs = await readAllPRs(outputDir);

      const repoStats: Record<
        string,
        {
          org: string;
          repo: string;
          prCount: number;
          additions: number;
          deletions: number;
          earliestPR: string | null;
          latestPR: string | null;
          impactBreakdown: Record<string, number>;
        }
      > = {};

      for (const pr of allPRs) {
        const repoKey = pr.frontmatter.repository;
        if (!repoStats[repoKey]) {
          repoStats[repoKey] = {
            org: pr.frontmatter.org,
            repo: repoKey.split('/')[1] || repoKey,
            prCount: 0,
            additions: 0,
            deletions: 0,
            earliestPR: null,
            latestPR: null,
            impactBreakdown: {},
          };
        }

        const stats = repoStats[repoKey];
        stats.prCount++;
        stats.additions += pr.frontmatter.additions;
        stats.deletions += pr.frontmatter.deletions;

        const createdAt = pr.frontmatter.createdAt;
        if (!stats.earliestPR || createdAt < stats.earliestPR) {
          stats.earliestPR = createdAt;
        }
        if (!stats.latestPR || createdAt > stats.latestPR) {
          stats.latestPR = createdAt;
        }

        const impact = pr.frontmatter.impact || 'standard';
        stats.impactBreakdown[impact] =
          (stats.impactBreakdown[impact] || 0) + 1;
      }

      const repos = Object.values(repoStats).sort(
        (a, b) => b.prCount - a.prCount,
      );

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ repos, totalRepos: repos.length }),
          },
        ],
      };
    },
  );
}

function registerGetStatsTool(server: McpServer, outputDir: string) {
  server.tool(
    'get_stats',
    'Get summary statistics about work history, optionally filtered by date range',
    {
      since: z.string().optional().describe('Start date (ISO format)'),
      until: z.string().optional().describe('End date (ISO format)'),
    },
    async (input) => {
      // First try to load from stats.json if no date filter
      if (!input.since && !input.until) {
        try {
          const statsPath = getAnalysisFilePath(outputDir, 'stats.json');
          const statsContent = await fs.readFile(statsPath, 'utf-8');
          return {
            content: [
              {
                type: 'text' as const,
                text: statsContent,
              },
            ],
          };
        } catch {
          // Fall through to compute stats
        }
      }

      // Compute stats from data
      let prs = await readAllPRs(outputDir);
      let tickets = await readAllTickets(outputDir);

      // Apply date filters
      if (input.since) {
        const sinceDate = new Date(input.since);
        prs = prs.filter(
          (pr) => new Date(pr.frontmatter.createdAt) >= sinceDate,
        );
        tickets = tickets.filter(
          (t) => new Date(t.frontmatter.createdAt) >= sinceDate,
        );
      }

      if (input.until) {
        const untilDate = new Date(input.until);
        prs = prs.filter(
          (pr) => new Date(pr.frontmatter.createdAt) <= untilDate,
        );
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

      // Date range
      const allDates = [
        ...prs.map((pr) => pr.frontmatter.createdAt),
        ...tickets.map((t) => t.frontmatter.createdAt),
      ].filter(Boolean);
      const sortedDates = allDates.sort();

      // Linked work count
      const prsWithTickets = prs.filter(
        (pr) => pr.frontmatter.jiraTickets?.length,
      ).length;

      const stats = {
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
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(stats),
          },
        ],
      };
    },
  );
}

function registerGetProjectsTool(server: McpServer, outputDir: string) {
  server.tool(
    'get_projects',
    'Get detected project groupings that cluster related PRs and tickets',
    {
      confidence: z
        .enum(['high', 'medium', 'low'])
        .optional()
        .describe('Filter by confidence level'),
      limit: z.number().optional().describe('Maximum number of projects'),
    },
    async (input) => {
      try {
        const projectsPath = getAnalysisFilePath(outputDir, 'projects.json');
        const projectsContent = await fs.readFile(projectsPath, 'utf-8');
        const projectsData = JSON.parse(projectsContent);

        let projects: ProjectGrouping[] = projectsData.projects || [];

        if (input.confidence) {
          projects = projects.filter((p) => p.confidence === input.confidence);
        }

        if (input.limit && input.limit > 0) {
          projects = projects.slice(0, input.limit);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                projects,
                total: projectsData.projects?.length || 0,
                returned: projects.length,
                summary: projectsData.summary,
              }),
            },
          ],
        };
      } catch {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error:
                  'projects.json not found. Run `work-chronicler analyze --projects` first.',
              }),
            },
          ],
        };
      }
    },
  );
}

function registerGetTimelineTool(server: McpServer, outputDir: string) {
  server.tool(
    'get_timeline',
    'Get chronological timeline of work grouped by week or month',
    {
      granularity: z
        .enum(['week', 'month'])
        .optional()
        .describe('Time grouping (default: week)'),
      since: z.string().optional().describe('Start date (ISO format)'),
      until: z.string().optional().describe('End date (ISO format)'),
      limit: z.number().optional().describe('Maximum number of periods'),
    },
    async (input) => {
      try {
        const timelinePath = getAnalysisFilePath(outputDir, 'timeline.json');
        const timelineContent = await fs.readFile(timelinePath, 'utf-8');
        const timelineData = JSON.parse(timelineContent) as {
          months: TimelineMonth[];
          summary: {
            totalWeeks: number;
            totalMonths: number;
            busiestWeek?: { weekStart: string; prCount: number };
            busiestMonth?: { month: string; prCount: number };
          };
        };

        const granularity = input.granularity || 'week';

        // Extract weeks from months if needed
        let periods: (TimelineWeek | TimelineMonth)[];
        let totalCount: number;

        if (granularity === 'week') {
          // Flatten weeks from all months
          const allWeeks: TimelineWeek[] = timelineData.months.flatMap(
            (m) => m.weeks,
          );
          periods = allWeeks;
          totalCount = timelineData.summary.totalWeeks;
        } else {
          periods = timelineData.months;
          totalCount = timelineData.summary.totalMonths;
        }

        // Filter by date range
        if (input.since || input.until) {
          periods = periods.filter((p) => {
            // TimelineWeek has weekStart, TimelineMonth has month (YYYY-MM format)
            const periodStart =
              'weekStart' in p ? p.weekStart : `${p.month}-01`;
            if (input.since && periodStart < input.since) return false;
            if (input.until && periodStart > input.until) return false;
            return true;
          });
        }

        if (input.limit && input.limit > 0) {
          periods = periods.slice(0, input.limit);
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                granularity,
                periods,
                total: totalCount,
                returned: periods.length,
                summary: timelineData.summary,
              }),
            },
          ],
        };
      } catch {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error:
                  'timeline.json not found. Run `work-chronicler analyze --timeline` first.',
              }),
            },
          ],
        };
      }
    },
  );
}
