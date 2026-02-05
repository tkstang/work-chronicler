/**
 * GitHub fetch types
 *
 * Types specific to the GitHub fetching logic.
 * Core types like PullRequest remain in @core/types.
 */

/** Result of fetching PRs from a single repository */
export interface GitHubFetchResult {
  org: string;
  repo: string;
  prsWritten: number;
  prsSkipped: number;
  prsCached: number;
}

/** Cache information for incremental fetching */
export interface GitHubCacheInfo {
  cachedPRs: Set<string>;
  oldestCachedDate: Date | null;
  newestCachedDate: Date | null;
}

/** Options for fetching GitHub PRs */
export interface FetchGitHubOptions {
  config: import('@core/index').Config;
  outputDir: string;
  verbose?: boolean;
  useCache?: boolean;
}
