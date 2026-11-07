import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Config } from '@config/schema';

// GitHub is the external system here: each repo maps to a canned response.
const repoResponses = new Map<
  string,
  'not-found' | 'empty' | 'rate-limited' | 'server-error'
>();

const notFound = () => Object.assign(new Error('Not Found'), { status: 404 });
let listingError: () => Error = notFound;
const pullsListedFor: string[] = [];

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    users = {
      getByUsername: async () => {
        throw notFound();
      },
    };
    repos = {
      listForOrg: async () => {
        throw listingError();
      },
    };
    pulls = {
      list: async ({ repo }: { repo: string }) => {
        pullsListedFor.push(repo);
        const response = repoResponses.get(repo);
        if (response === 'empty') return { data: [] };
        if (response === 'rate-limited') {
          throw Object.assign(new Error('Too Many Requests'), { status: 429 });
        }
        if (response === 'server-error') {
          throw Object.assign(new Error('Bad Gateway'), { status: 502 });
        }
        throw notFound();
      },
    };
  },
}));

const { fetchGitHubPRs } = await import(
  './github.utils'
);

function configFor(
  repos: string[],
  extraOrgs: Config['github']['orgs'] = [],
): Config {
  return {
    github: {
      username: 'octocat',
      token: 'test-token',
      orgs: [{ name: 'voxmedia', repos }, ...extraOrgs],
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
    pullsListedFor.length = 0;
    listingError = notFound;
    process.exitCode = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(outputDir, { recursive: true, force: true });
    process.exitCode = undefined;
  });

  it('warns about the org and fails the run when every repo errors', async () => {
    await fetchGitHubPRs({ config: configFor(['a', 'b']), outputDir });

    const warning = logs.find((line) => line.includes('All 2 repositories'));
    expect(warning).toContain('voxmedia');
    expect(warning).toContain('token');
    expect(process.exitCode).toBe(1);
  });

  it('warns and keeps going when an org cannot even be listed', async () => {
    repoResponses.set('web', 'empty');

    await fetchGitHubPRs({
      config: configFor(['*'], [{ name: 'acme', repos: ['web'] }]),
      outputDir,
    });

    const warning = logs.find((line) => line.includes('Could not list'));
    expect(warning).toContain('voxmedia');
    expect(logs.some((line) => line.includes('acme'))).toBe(true);
    expect(process.exitCode).toBe(1);
  });

  it('aborts instead of moving on when listing is rate limited (429)', async () => {
    listingError = () =>
      Object.assign(new Error('Too Many Requests'), { status: 429 });

    await expect(
      fetchGitHubPRs({
        config: configFor(['*'], [{ name: 'acme', repos: ['web'] }]),
        outputDir,
      }),
    ).rejects.toThrow(/rate limit/);
    expect(pullsListedFor).toEqual([]);
  });

  it('aborts the run when a repo request is rate limited', async () => {
    repoResponses.set('a', 'rate-limited');

    await expect(
      fetchGitHubPRs({ config: configFor(['a', 'b']), outputDir }),
    ).rejects.toThrow(/rate limit/);
    expect(pullsListedFor).toEqual(['a']);
  });

  it('points at the repo errors, not the token, when failures are not access errors', async () => {
    repoResponses.set('a', 'server-error');
    repoResponses.set('b', 'server-error');

    await fetchGitHubPRs({ config: configFor(['a', 'b']), outputDir });

    const warning = logs.find((line) => line.includes('All 2 repositories'));
    expect(warning).toContain('See the repository errors above');
    expect(warning).not.toContain('token');
    expect(process.exitCode).toBe(1);
  });

  it('does not warn when only some repos error', async () => {
    repoResponses.set('b', 'empty');

    await fetchGitHubPRs({ config: configFor(['a', 'b']), outputDir });

    expect(logs.some((line) => line.includes('token can access'))).toBe(false);
    expect(process.exitCode).toBeUndefined();
  });
});
