import { graphql } from '@octokit/graphql';
import ora from 'ora';

/**
 * PR lookback options for discovery
 */
export type PRLookbackDepth = 50 | 100 | 200;

/**
 * Result of repo discovery
 */
export interface DiscoveryResult {
  repos: string[];
  totalReposChecked: number;
  elapsedMs: number;
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

/**
 * Strip org prefix from repo name
 *
 * @example
 * stripOrgPrefix('voxmedia/duet', 'voxmedia') // 'duet'
 * stripOrgPrefix('duet', 'voxmedia') // 'duet'
 */
export function stripOrgPrefix(nameWithOwner: string, org: string): string {
  const prefix = `${org}/`;
  return nameWithOwner.startsWith(prefix)
    ? nameWithOwner.slice(prefix.length)
    : nameWithOwner;
}

/**
 * Discover repos where a user has PRs in an organization.
 *
 * Uses GitHub GraphQL API to efficiently search for repos.
 * Shows progress spinner during discovery.
 *
 * @param token - GitHub personal access token
 * @param org - Organization or username to search
 * @param username - GitHub username to find PRs for
 * @param prCount - Number of recent PRs to check per repo
 */
export async function discoverRepos(
  token: string,
  org: string,
  username: string,
  prCount: PRLookbackDepth,
  since: string,
  until: string | null,
): Promise<DiscoveryResult> {
  const startTime = Date.now();
  const foundRepos: Set<string> = new Set();
  let totalReposChecked = 0;

  const spinner = ora(`Discovering repos in '${org}'...`).start();

  const graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: `token ${token}`,
    },
  });

  // Try organization first, fall back to user
  const isOrg = await checkIfOrganization(graphqlWithAuth, org);

  try {
    const sinceDate = new Date(`${since}T00:00:00Z`);
    const untilDate = until ? new Date(`${until}T23:59:59Z`) : null;

    spinner.text = `Listing repos updated since ${since}...`;
    const reposInRange = await listReposUpdatedInRange({
      graphqlWithAuth,
      org,
      isOrg,
      sinceDate,
      untilDate,
    });

    if (reposInRange.length === 0) {
      const elapsedMs = Date.now() - startTime;
      spinner.succeed(
        `Found 0 repos updated since ${since} (${formatElapsed(elapsedMs)})`,
      );
      return { repos: [], totalReposChecked: 0, elapsedMs };
    }

    spinner.text = `Checking PRs in ${reposInRange.length} recently-updated repos...`;
    for (const repo of reposInRange) {
      totalReposChecked++;
      const hasUserPR = await repoHasUserPRInRange({
        graphqlWithAuth,
        owner: repo.owner,
        repo: repo.name,
        username,
        prCount,
        sinceDate,
        untilDate,
      });

      if (hasUserPR) {
        foundRepos.add(repo.name);
      }

      const elapsed = formatElapsed(Date.now() - startTime);
      spinner.text = `Checked ${totalReposChecked}/${reposInRange.length} repos... (${elapsed})`;

      // Light throttling to reduce secondary rate limits
      await sleep(60);
    }

    const elapsedMs = Date.now() - startTime;
    spinner.succeed(
      `Found ${foundRepos.size} repos in ${formatElapsed(elapsedMs)}`,
    );

    return {
      repos: Array.from(foundRepos).sort(),
      totalReposChecked,
      elapsedMs,
    };
  } catch (error) {
    spinner.fail('Discovery failed');
    throw error;
  }
}

interface RepoRef {
  owner: string;
  name: string;
  updatedAt: string;
}

async function listReposUpdatedInRange(options: {
  graphqlWithAuth: typeof graphql;
  org: string;
  isOrg: boolean;
  sinceDate: Date;
  untilDate: Date | null;
}): Promise<RepoRef[]> {
  const repos: RepoRef[] = [];
  let cursor: string | null = null;

  while (true) {
    const query = options.isOrg
      ? buildOrgRepoListQuery(cursor)
      : buildUserRepoListQuery(cursor);
    const variables: { org?: string; login?: string; after?: string } =
      options.isOrg
        ? { org: options.org, ...(cursor && { after: cursor }) }
        : { login: options.org, ...(cursor && { after: cursor }) };

    const response: {
      organization?: {
        repositories: {
          pageInfo: PageInfo;
          nodes: Array<{ nameWithOwner: string; updatedAt: string }>;
          totalCount: number;
        };
      };
      user?: {
        repositories: {
          pageInfo: PageInfo;
          nodes: Array<{ nameWithOwner: string; updatedAt: string }>;
          totalCount: number;
        };
      };
    } = await options.graphqlWithAuth(query, variables);

    const data = options.isOrg ? response.organization : response.user;
    if (!data) {
      throw new Error(
        `Could not find ${options.isOrg ? 'organization' : 'user'} '${options.org}'`,
      );
    }

    const page = data.repositories;
    if (!page.nodes.length) break;

    for (const node of page.nodes) {
      const updatedAt = new Date(node.updatedAt);

      // Repos are returned in UPDATED_AT DESC order; once we go older than since we can stop.
      if (updatedAt < options.sinceDate) {
        return repos;
      }

      if (options.untilDate && updatedAt > options.untilDate) {
        continue;
      }

      const [owner, name] = node.nameWithOwner.split('/');
      if (!owner || !name) continue;

      repos.push({ owner, name, updatedAt: node.updatedAt });
    }

    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    if (!cursor) break;
    await sleep(50);
  }

  return repos;
}

async function repoHasUserPRInRange(options: {
  graphqlWithAuth: typeof graphql;
  owner: string;
  repo: string;
  username: string;
  prCount: PRLookbackDepth;
  sinceDate: Date;
  untilDate: Date | null;
}): Promise<boolean> {
  const query = `
    query($owner: String!, $repo: String!) {
      repository(owner: $owner, name: $repo) {
        pullRequests(first: ${options.prCount}, orderBy: {field: CREATED_AT, direction: DESC}, states: [OPEN, CLOSED, MERGED]) {
          nodes {
            createdAt
            author { login }
          }
        }
      }
    }
  `;

  const response: {
    repository: {
      pullRequests: {
        nodes: Array<{ createdAt: string; author: { login: string } | null }>;
      };
    } | null;
  } = await options.graphqlWithAuth(query, {
    owner: options.owner,
    repo: options.repo,
  });

  if (!response.repository) return false;

  for (const pr of response.repository.pullRequests.nodes) {
    const author = pr.author?.login;
    if (!author || author.toLowerCase() !== options.username.toLowerCase()) {
      continue;
    }

    const createdAt = new Date(pr.createdAt);
    if (createdAt < options.sinceDate) {
      continue;
    }
    if (options.untilDate && createdAt > options.untilDate) {
      continue;
    }

    return true;
  }

  return false;
}

/**
 * Check if a login is an organization or user
 */
async function checkIfOrganization(
  graphqlWithAuth: typeof graphql,
  login: string,
): Promise<boolean> {
  try {
    const response = await graphqlWithAuth<{
      organization: { id: string } | null;
    }>(`query($login: String!) { organization(login: $login) { id } }`, {
      login,
    });
    return response.organization !== null;
  } catch {
    return false;
  }
}

/**
 * Build GraphQL query for listing org repos (updatedAt DESC)
 */
function buildOrgRepoListQuery(cursor: string | null): string {
  const afterClause = cursor ? ', after: $after' : '';
  return `
    query($org: String!${cursor ? ', $after: String' : ''}) {
      organization(login: $org) {
        repositories(first: 100${afterClause}, orderBy: {field: UPDATED_AT, direction: DESC}) {
          pageInfo { hasNextPage endCursor }
          totalCount
          nodes {
            nameWithOwner
            updatedAt
          }
        }
      }
    }
  `;
}

/**
 * Build GraphQL query for listing user repos (updatedAt DESC)
 */
function buildUserRepoListQuery(cursor: string | null): string {
  const afterClause = cursor ? ', after: $after' : '';
  return `
    query($login: String!${cursor ? ', $after: String' : ''}) {
      user(login: $login) {
        repositories(first: 100${afterClause}, orderBy: {field: UPDATED_AT, direction: DESC}) {
          pageInfo { hasNextPage endCursor }
          totalCount
          nodes {
            nameWithOwner
            updatedAt
          }
        }
      }
    }
  `;
}

/**
 * Format elapsed time as human-readable string
 */
function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
