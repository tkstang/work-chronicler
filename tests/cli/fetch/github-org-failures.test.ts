import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '../../../src/core/config/schema';

// GitHub is the external system here: each repo maps to a canned response.
const repoResponses = new Map<string, 'not-found' | 'empty'>();

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    pulls = {
      list: async ({ repo }: { repo: string }) => {
        if (repoResponses.get(repo) === 'empty') return { data: [] };
        throw Object.assign(new Error('Not Found'), { status: 404 });
      },
    };
  },
}));

const { fetchGitHubPRs } = await import(
  '../../../src/cli/commands/fetch/github/github.utils'
);

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

describe('fetchGitHubPRs org failure reporting', () => {
  let outputDir: string;
  let logs: string[];

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), 'wc-fetch-'));
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    repoResponses.clear();
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(outputDir, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it('warns about the org and fails the run when every repo errors', async () => {
    await fetchGitHubPRs({ config: configFor(['a', 'b']), outputDir });

    const warning = logs.find((line) => line.includes('failed to fetch'));
    expect(warning).toContain('voxmedia');
    expect(warning).toContain('token');
    expect(process.exitCode).toBe(1);
  });

  it('does not warn when only some repos error', async () => {
    repoResponses.set('b', 'empty');

    await fetchGitHubPRs({ config: configFor(['a', 'b']), outputDir });

    expect(logs.some((line) => line.includes('failed to fetch'))).toBe(false);
    expect(process.exitCode).toBeUndefined();
  });
});
