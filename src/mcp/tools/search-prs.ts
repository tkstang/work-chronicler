import { type PullRequestFile, readAllPRs } from '@core/index';

export interface SearchPRsInput {
  query?: string;
  org?: string;
  repo?: string;
  since?: string;
  until?: string;
  limit?: number;
}

export interface SearchPRsOutput {
  prs: PullRequestFile[];
  total: number;
}

/**
 * Search PRs by various criteria
 */
export async function searchPRs(
  outputDir: string,
  input: SearchPRsInput,
): Promise<SearchPRsOutput> {
  const allPRs = await readAllPRs(outputDir);

  let filtered = allPRs;

  // Filter by org
  if (input.org) {
    filtered = filtered.filter((pr) => pr.frontmatter.org === input.org);
  }

  // Filter by repo
  if (input.repo) {
    const repo = input.repo;
    filtered = filtered.filter((pr) =>
      pr.frontmatter.repository.includes(repo),
    );
  }

  // Filter by date range
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

  // Filter by query (search in title and body)
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

  // Apply limit
  const total = filtered.length;
  if (input.limit && input.limit > 0) {
    filtered = filtered.slice(0, input.limit);
  }

  return {
    prs: filtered,
    total,
  };
}
