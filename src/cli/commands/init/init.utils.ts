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

/**
 * GraphQL response types
 */
interface RepoNode {
  nameWithOwner: string;
  pullRequests: {
    nodes: Array<{
      author: { login: string } | null;
    }>;
  };
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface ReposResponse {
  organization?: {
    repositories: {
      pageInfo: PageInfo;
      nodes: RepoNode[];
      totalCount: number;
    };
  };
  user?: {
    repositories: {
      pageInfo: PageInfo;
      nodes: RepoNode[];
      totalCount: number;
    };
  };
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
): Promise<DiscoveryResult> {
  const startTime = Date.now();
  const foundRepos: Set<string> = new Set();
  let cursor: string | null = null;
  let totalReposChecked = 0;
  let totalRepos = 0;

  const spinner = ora(`Discovering repos in '${org}'...`).start();

  const graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: `token ${token}`,
    },
  });

  // Try organization first, fall back to user
  const isOrg = await checkIfOrganization(graphqlWithAuth, org);

  try {
    do {
      const query: string = isOrg
        ? buildOrgQuery(prCount, cursor)
        : buildUserQuery(prCount, cursor);

      const variables: { org?: string; login?: string; after: string | null } =
        isOrg ? { org, after: cursor } : { login: org, after: cursor };

      const response: ReposResponse = await graphqlWithAuth<ReposResponse>(
        query,
        variables,
      );

      const data = isOrg ? response.organization : response.user;
      if (!data) {
        throw new Error(
          `Could not find ${isOrg ? 'organization' : 'user'} '${org}'`,
        );
      }

      const repositories = data.repositories;
      totalRepos = repositories.totalCount;

      for (const repo of repositories.nodes) {
        totalReposChecked++;

        // Check if any PR in this repo was authored by the target user
        const hasUserPR = repo.pullRequests.nodes.some(
          (pr: { author: { login: string } | null }) =>
            pr.author?.login?.toLowerCase() === username.toLowerCase(),
        );

        if (hasUserPR) {
          const repoName = stripOrgPrefix(repo.nameWithOwner, org);
          foundRepos.add(repoName);
        }
      }

      // Update spinner
      const elapsed = formatElapsed(Date.now() - startTime);
      spinner.text = `Checked ${totalReposChecked}/${totalRepos} repos... (${elapsed})`;

      cursor = repositories.pageInfo.hasNextPage
        ? repositories.pageInfo.endCursor
        : null;

      // Rate limit protection
      if (cursor) {
        await sleep(100);
      }
    } while (cursor);

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
 * Build GraphQL query for organization repos
 */
function buildOrgQuery(prCount: number, cursor: string | null): string {
  const afterClause = cursor ? ', after: $after' : '';
  return `
    query($org: String!${cursor ? ', $after: String' : ''}) {
      organization(login: $org) {
        repositories(first: 100${afterClause}, orderBy: {field: NAME, direction: ASC}) {
          pageInfo { hasNextPage endCursor }
          totalCount
          nodes {
            nameWithOwner
            pullRequests(first: ${prCount}, orderBy: {field: CREATED_AT, direction: DESC}, states: [OPEN, CLOSED, MERGED]) {
              nodes {
                author { login }
              }
            }
          }
        }
      }
    }
  `;
}

/**
 * Build GraphQL query for user repos
 */
function buildUserQuery(prCount: number, cursor: string | null): string {
  const afterClause = cursor ? ', after: $after' : '';
  return `
    query($login: String!${cursor ? ', $after: String' : ''}) {
      user(login: $login) {
        repositories(first: 100${afterClause}, orderBy: {field: NAME, direction: ASC}) {
          pageInfo { hasNextPage endCursor }
          totalCount
          nodes {
            nameWithOwner
            pullRequests(first: ${prCount}, orderBy: {field: CREATED_AT, direction: DESC}, states: [OPEN, CLOSED, MERGED]) {
              nodes {
                author { login }
              }
            }
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
