import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Config } from '@config/schema';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// GitHub serves a renamed repo under its old name too, reporting the current
// name on each PR. Here `old-app` was renamed to `new-app`.
const pr = {
  number: 7,
  title: 'Add login',
  body: 'Adds login.',
  state: 'closed',
  created_at: '2025-03-01T00:00:00Z',
  merged_at: '2025-03-02T00:00:00Z',
  closed_at: '2025-03-02T00:00:00Z',
  html_url: 'https://github.com/voxmedia/new-app/pull/7',
  user: { login: 'octocat' },
  labels: [],
  base: { repo: { name: 'new-app' } },
};

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    pulls = {
      list: async ({ repo }: { repo: string }) => ({
        data: repo === 'old-app' || repo === 'new-app' ? [pr] : [],
      }),
      get: async () => ({
        data: { additions: 10, deletions: 2, changed_files: 3 },
      }),
    };
  },
}));

const { fetchGitHubPRs } = await import('./github.utils');

function configFor(repos: string[]): Config {
  return {
    github: {
      username: 'octocat',
      token: 'test-token',
      orgs: [{ name: 'voxmedia', repos }],
    },
    output: { directory: './work-log' },
    fetch: { since: '2025-01-01', until: '2025-06-01' },
    analysis: { thresholds: { minor: {}, major: {}, flagship: {} } },
  };
}

describe('fetchGitHubPRs with a renamed repo', () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), 'wc-fetch-rename-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('stores a PR once, under the current name, when both names are configured', async () => {
    const results = await fetchGitHubPRs({
      config: configFor(['old-app', 'new-app']),
      outputDir,
    });

    const prDir = join(outputDir, 'pull-requests', 'voxmedia');
    expect(existsSync(join(prDir, 'old-app'))).toBe(false);
    expect(readdirSync(join(prDir, 'new-app'))).toHaveLength(1);
    expect(results.reduce((sum, r) => sum + r.prsWritten, 0)).toBe(1);
  });
});
