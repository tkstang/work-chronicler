import type { ManagerConfig } from '@wc-types/manager';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { promptForReport } from './reports.prompts';

const answers = vi.hoisted(() => new Map<string, unknown>());

vi.mock('@inquirer/prompts', () => {
  const answer = async (options: { message: string }) => {
    if (!answers.has(options.message)) {
      throw new Error(`Unexpected prompt: ${options.message}`);
    }
    return answers.get(options.message);
  };
  return { input: answer, select: answer };
});

// GitHub is the external system. Repos come back newest-updated first and
// each repo's PRs newest-created first, as the GraphQL API orders them.
const github = vi.hoisted(() => ({
  repos: [] as Array<{ name: string; updatedAt: string }>,
  prs: {} as Record<string, Array<{ createdAt: string; author: string }>>,
}));

vi.mock('@octokit/graphql', () => ({
  graphql: {
    defaults:
      () => async (query: string, variables: Record<string, string>) => {
        if (query.includes('organization(login: $login) { id }')) {
          return { organization: { id: 'org-1' } };
        }
        if (variables.repo) {
          return {
            repository: {
              pullRequests: {
                nodes: (github.prs[variables.repo] ?? []).map((pr) => ({
                  createdAt: pr.createdAt,
                  author: { login: pr.author },
                })),
              },
            },
          };
        }
        return {
          organization: {
            repositories: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: github.repos.map((repo) => ({
                nameWithOwner: `acme/${repo.name}`,
                updatedAt: repo.updatedAt,
              })),
              totalCount: github.repos.length,
            },
          },
        };
      },
  },
}));

const config: ManagerConfig = {
  mode: 'manager',
  github: { org: 'acme' },
  fetch: { since: '2026-01-01', until: null },
  reports: [],
};

function answerReport(reposChoice: string): void {
  answers.set('Name:', 'Alice Smith');
  answers.set('GitHub username:', 'alice');
  answers.set('Email:', 'alice@acme.io');
  answers.set('Repos:', reposChoice);
  answers.set('Jira projects (comma-separated, or leave blank):', '');
}

describe('promptForReport', () => {
  beforeEach(() => {
    answers.clear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  it('normalizes the GitHub name and splits comma-separated repos and projects', async () => {
    answers.set('Name:', 'Alice Smith');
    answers.set('GitHub username:', ' @alice ');
    answers.set('Email:', 'alice@acme.io');
    answers.set('Repos:', 'manual');
    answers.set('Repos (comma-separated):', ' api, web ,, ');
    answers.set(
      'Jira projects (comma-separated, or leave blank):',
      'PROJ, OPS',
    );

    await expect(promptForReport(config)).resolves.toEqual({
      name: 'Alice Smith',
      github: 'alice',
      email: 'alice@acme.io',
      repos: ['api', 'web'],
      jiraProjects: ['PROJ', 'OPS'],
    });
  });

  it("auto-discovers only repos with the report's PRs inside the profile's fetch range", async () => {
    vi.stubEnv('GITHUB_TOKEN', 'test-token');
    github.repos = [
      { name: 'fresh', updatedAt: '2026-03-01T00:00:00Z' },
      { name: 'mixed', updatedAt: '2026-02-01T00:00:00Z' },
      { name: 'stale', updatedAt: '2025-06-01T00:00:00Z' },
    ];
    github.prs = {
      fresh: [{ createdAt: '2026-02-20T00:00:00Z', author: 'alice' }],
      // Recent activity in the repo, but Alice's only PR predates `since`.
      mixed: [
        { createdAt: '2026-01-15T00:00:00Z', author: 'bob' },
        { createdAt: '2025-05-01T00:00:00Z', author: 'alice' },
      ],
      stale: [{ createdAt: '2025-05-20T00:00:00Z', author: 'alice' }],
    };
    answerReport('discover');

    try {
      const report = await promptForReport(config);
      expect(report.repos).toEqual(['fresh']);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  // A repo's updatedAt reflects its latest activity, which can fall after
  // `until` even when the report's PRs inside the range are older.
  it('keeps a repo updated after `until` when the report has a PR inside the range', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'test-token');
    github.repos = [
      { name: 'active', updatedAt: '2026-03-01T00:00:00Z' },
      { name: 'later-only', updatedAt: '2026-03-02T00:00:00Z' },
    ];
    github.prs = {
      active: [{ createdAt: '2026-02-20T00:00:00Z', author: 'alice' }],
      'later-only': [{ createdAt: '2026-03-02T00:00:00Z', author: 'alice' }],
    };
    answerReport('discover');

    try {
      const report = await promptForReport({
        ...config,
        fetch: { since: '2026-01-01', until: '2026-02-28' },
      });
      expect(report.repos).toEqual(['active']);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
