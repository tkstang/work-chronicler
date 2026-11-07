import { readAllPRs } from '@core/index';

import { defineTool, jsonResult } from './types';

interface RepoStats {
  org: string;
  repo: string;
  prCount: number;
  additions: number;
  deletions: number;
  earliestPR: string | null;
  latestPR: string | null;
  impactBreakdown: Record<string, number>;
}

export const listReposTool = defineTool({
  name: 'list_repos',
  description: 'List all repositories with data and their statistics',
  inputSchema: {},
  handler: async (_input, { outputDir }) => {
    const allPRs = await readAllPRs(outputDir);
    const repoStats: Record<string, RepoStats> = {};

    for (const pr of allPRs) {
      const repoKey = pr.frontmatter.repository;
      repoStats[repoKey] ??= {
        org: pr.frontmatter.org,
        repo: repoKey.split('/')[1] || repoKey,
        prCount: 0,
        additions: 0,
        deletions: 0,
        earliestPR: null,
        latestPR: null,
        impactBreakdown: {},
      };

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
      stats.impactBreakdown[impact] = (stats.impactBreakdown[impact] || 0) + 1;
    }

    const repos = Object.values(repoStats).sort(
      (a, b) => b.prCount - a.prCount,
    );

    return jsonResult({ repos, totalRepos: repos.length });
  },
});
