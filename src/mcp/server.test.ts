import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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

// Reviewed snapshot of the tools/list result from before the tools were split
// into modules, plus search_pr_reviews (added after the split). MCP clients
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

  it('reads reviews from the full work log, with a note, when the filtered subset predates them', async () => {
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

      const stale = await searchReviews();
      expect(stale.total).toBe(1);
      expect(stale.note).toContain('Re-run `work-chronicler filter`');

      // A subset written after reviews existed is used as is, even empty
      mkdirSync(join(workLog, 'filtered', 'pr-reviews'));
      const current = await searchReviews();
      expect(current.total).toBe(0);
      expect(current.note).toBeUndefined();
    } finally {
      await client.close();
    }
  });
});
