import { readAllPRs, readAllTickets } from '@core/index';

export interface WorkStats {
  prs: {
    total: number;
    byOrg: Record<string, number>;
    byRepo: Record<string, number>;
    byState: Record<string, number>;
    totalAdditions: number;
    totalDeletions: number;
  };
  tickets: {
    total: number;
    byOrg: Record<string, number>;
    byProject: Record<string, number>;
    byStatus: Record<string, number>;
    totalStoryPoints: number;
  };
  dateRange: {
    earliest: string | null;
    latest: string | null;
  };
}

/**
 * Get summary statistics about work history
 */
export async function getStats(outputDir: string): Promise<WorkStats> {
  const prs = await readAllPRs(outputDir);
  const tickets = await readAllTickets(outputDir);

  // PR stats
  const prsByOrg: Record<string, number> = {};
  const prsByRepo: Record<string, number> = {};
  const prsByState: Record<string, number> = {};
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const pr of prs) {
    prsByOrg[pr.frontmatter.org] = (prsByOrg[pr.frontmatter.org] ?? 0) + 1;
    prsByRepo[pr.frontmatter.repository] =
      (prsByRepo[pr.frontmatter.repository] ?? 0) + 1;
    prsByState[pr.frontmatter.state] =
      (prsByState[pr.frontmatter.state] ?? 0) + 1;
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

  return {
    prs: {
      total: prs.length,
      byOrg: prsByOrg,
      byRepo: prsByRepo,
      byState: prsByState,
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
}
