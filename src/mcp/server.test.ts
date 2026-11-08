import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  getPRFilePath,
  getPRReviewFilePath,
  type PRReviewRecord,
  type PullRequest,
  writeMarkdownFile,
} from '@core/index';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createServer } from './server';

const packageJson = createRequire(import.meta.url)('../../package.json') as {
  version: string;
};

// Reviewed snapshot of the tools/list result from before the tools were split
// into modules, plus search_pr_reviews and search_messages (added after the
// split) and the coverage wording added with imported records. MCP clients
// depend on these names, descriptions and schemas.
const goldenTools = JSON.parse(
  readFileSync(join(import.meta.dirname, 'tools-list.golden.json'), 'utf-8'),
);

function writePR(outputDir: string, prNumber: number, title: string) {
  const frontmatter: PullRequest = {
    title,
    prNumber,
    repository: 'acme/api',
    org: 'acme',
    author: 'me',
    state: 'merged',
    createdAt: '2025-01-15T10:00:00Z',
    mergedAt: '2025-01-16T10:00:00Z',
    closedAt: null,
    url: `https://github.com/acme/api/pull/${prNumber}`,
    additions: 1,
    deletions: 1,
    changedFiles: 1,
    jiraTickets: [],
    labels: [],
  };
  writeMarkdownFile(
    getPRFilePath(outputDir, 'acme', 'api', new Date(), prNumber),
    frontmatter,
    'body',
  );
}

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wc-mcp-server-'));
  const configPath = join(root, 'work-chronicler.yaml');
  writeFileSync(
    configPath,
    [
      'github:',
      '  username: me',
      'output:',
      '  directory: ./work-log',
      'fetch:',
      '  since: "2025-01-01"',
      '',
    ].join('\n'),
  );
  vi.stubEnv('HOME', join(root, 'home'));
  vi.stubEnv('WORK_CHRONICLER_HOME', join(root, 'wc-home'));
  vi.stubEnv('WORK_CHRONICLER_CONFIG', configPath);
  vi.stubEnv('WORK_CHRONICLER_DIR', '');
  vi.stubEnv('WORK_CHRONICLER_PROFILE', '');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe('MCP server over a transport', () => {
  it('lists every tool and serves the filtered work log when present', async () => {
    const workLog = join(root, 'work-log');
    writePR(workLog, 1, 'Full log only');
    writePR(join(workLog, 'filtered'), 2, 'Filtered subset');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const ctx = await createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '0.0.0' });
    await ctx.server.connect(serverTransport);
    await client.connect(clientTransport);

    try {
      expect(client.getServerVersion()?.version).toBe(packageJson.version);
      const { tools } = await client.listTools();
      expect(tools).toEqual(goldenTools);

      const result = await client.callTool({
        name: 'search_prs',
        arguments: {},
      });
      const [content] = result.content as { type: string; text: string }[];
      const titles = JSON.parse(content?.text ?? '').results.map(
        (r: { title: string }) => r.title,
      );
      expect(titles).toEqual(['Filtered subset']);
    } finally {
      await client.close();
    }
  });

  it('never reads reviews from behind a selected subset, and leaves out other reviewers', async () => {
    const workLog = join(root, 'work-log');
    writePR(join(workLog, 'filtered'), 2, 'Filtered subset');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const ctx = await createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '0.0.0' });
    await ctx.server.connect(serverTransport);
    await client.connect(clientTransport);
    const searchReviews = async () => {
      const result = await client.callTool({
        name: 'search_pr_reviews',
        arguments: {},
      });
      const [content] = result.content as { type: string; text: string }[];
      return JSON.parse(content?.text ?? '');
    };

    try {
      const nothingFetched = await searchReviews();
      expect(nothingFetched.total).toBe(0);
      expect(nothingFetched.note).toContain('fetch github --reviews');

      const record: PRReviewRecord = {
        type: 'pr-review',
        reviewer: 'me',
        pr: {
          url: 'https://github.com/acme/api/pull/9',
          org: 'acme',
          repository: 'api',
          prNumber: 9,
          title: 'Their PR',
          author: 'alice',
          state: 'open',
        },
        prUpdatedAt: '2025-02-01T00:00:00Z',
        reviews: [
          {
            reviewId: 1,
            state: 'APPROVED',
            submittedAt: '2025-02-01T00:00:00Z',
            url: 'https://github.com/acme/api/pull/9#pullrequestreview-1',
            body: '',
          },
        ],
        comments: [],
      };
      writeMarkdownFile(
        getPRReviewFilePath(workLog, 'acme', 'api', 9),
        record,
        '',
      );

      // The subset predates the review fetch: no results, and a note,
      // rather than the full work log behind the user's selection
      const stale = await searchReviews();
      expect(stale.total).toBe(0);
      expect(stale.note).toContain('Re-run `work-chronicler filter`');
      expect(stale.note).toContain('not taken from the full work log');

      // A subset written after reviews existed is used as is, even empty
      mkdirSync(join(workLog, 'filtered', 'pr-reviews'));
      const current = await searchReviews();
      expect(current.total).toBe(0);
      expect(current.note).toBeUndefined();

      // Another person's record in the subset is not the configured user's
      // work
      const filtered = join(workLog, 'filtered');
      writeMarkdownFile(
        getPRReviewFilePath(filtered, 'acme', 'api', 9),
        record,
        '',
      );
      writeMarkdownFile(
        getPRReviewFilePath(filtered, 'acme', 'api', 10),
        { ...record, reviewer: 'alice', pr: { ...record.pr, prNumber: 10 } },
        '',
      );
      const mixed = await searchReviews();
      expect(mixed.total).toBe(1);
      expect(mixed.note).toContain(
        'Left out 1 review record(s) written for another GitHub user (alice), not me',
      );
    } finally {
      await client.close();
    }
  });
});
