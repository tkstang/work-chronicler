import { type JiraTicketFile, readAllTickets } from '@core/index';

export interface SearchTicketsInput {
  query?: string;
  org?: string;
  project?: string;
  status?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export interface SearchTicketsOutput {
  tickets: JiraTicketFile[];
  total: number;
}

/**
 * Search JIRA tickets by various criteria
 */
export async function searchTickets(
  outputDir: string,
  input: SearchTicketsInput,
): Promise<SearchTicketsOutput> {
  const allTickets = await readAllTickets(outputDir);

  let filtered = allTickets;

  // Filter by org
  if (input.org) {
    filtered = filtered.filter((t) => t.frontmatter.org === input.org);
  }

  // Filter by project
  if (input.project) {
    filtered = filtered.filter((t) => t.frontmatter.project === input.project);
  }

  // Filter by status
  if (input.status) {
    const status = input.status;
    filtered = filtered.filter((t) =>
      t.frontmatter.status.toLowerCase().includes(status.toLowerCase()),
    );
  }

  // Filter by date range
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

  // Filter by query (search in summary and body)
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

  // Apply limit
  const total = filtered.length;
  if (input.limit && input.limit > 0) {
    filtered = filtered.slice(0, input.limit);
  }

  return {
    tickets: filtered,
    total,
  };
}
