import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Config } from '@core/index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runInitialFetch } from './init.fetch';

let outputDir: string;
let logs: string[];

// JIRA-only config, so the GitHub fetch is skipped without a network call.
const config: Config = {
  github: { username: '', orgs: [] },
  jira: {
    instances: [
      {
        name: 'acme',
        url: 'https://acme.atlassian.net',
        email: 'dev@example.com',
        token: 'test-token',
        projects: ['PAY'],
      },
    ],
  },
  output: { directory: './work-log' },
  fetch: { since: '2025-01-01', until: '2025-06-01' },
  analysis: { thresholds: { minor: {}, major: {}, flagship: {} } },
};

beforeEach(() => {
  outputDir = mkdtempSync(join(tmpdir(), 'wc-init-fetch-'));
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.join(' '));
  });
  process.exitCode = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  rmSync(outputDir, { recursive: true, force: true });
  process.exitCode = undefined;
});

describe('runInitialFetch', () => {
  // The first fetch after setup must not claim success when a JIRA project
  // failed, or the user trusts an incomplete work log.
  it('reports a failed JIRA project in the summary instead of Done', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Unauthorized', { status: 401 })),
    );

    await runInitialFetch(config, outputDir);

    const summary = logs.slice(logs.findIndex((l) => l.includes('Summary')));
    expect(summary.some((l) => l.includes('Completed with errors'))).toBe(true);
    expect(
      summary.some((l) => l.includes('acme/PAY') && l.includes('401')),
    ).toBe(true);
    expect(summary.some((l) => l.includes('Done!'))).toBe(false);
    expect(process.exitCode).toBe(1);
  });
});
