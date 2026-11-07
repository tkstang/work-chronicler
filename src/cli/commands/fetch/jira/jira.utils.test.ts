import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { type Config, readAllTickets } from '@core/index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RateLimitError } from '../github/github.utils';
import { fetchJiraTickets, MAX_PAGES } from './jira.utils';

// JIRA is the external system: each POST to /search/jql returns the next
// canned response. A missed page silently drops tickets from the work log.
type Page = {
  keys: string[];
  nextPageToken?: string;
  isLast?: boolean;
};

let outputDir: string;
let logs: string[];
let requests: Array<{ project: string; nextPageToken?: string }>;

function issue(key: string) {
  return {
    key,
    fields: {
      summary: `Summary ${key}`,
      issuetype: { name: 'Story' },
      status: { name: 'Done' },
      created: '2025-02-01T10:00:00.000+0000',
      resolutiondate: null,
    },
  };
}

function serve(
  pagesByProject: Record<string, Array<Page | Response>>,
  maxCalls = 20,
): void {
  const cursor: Record<string, number> = {};
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      if (requests.length >= maxCalls) {
        throw new Error('test guard: too many JIRA requests');
      }
      const request = JSON.parse(String(init.body)) as {
        jql: string;
        nextPageToken?: string;
      };
      const project = /project = "([^"]+)"/.exec(request.jql)?.[1] ?? '';
      requests.push({ project, nextPageToken: request.nextPageToken });

      const pages = pagesByProject[project] ?? [];
      const index = cursor[project] ?? 0;
      cursor[project] = index + 1;
      const page = pages[Math.min(index, pages.length - 1)];
      if (!page) return Response.json({ issues: [], isLast: true });
      if (page instanceof Response) return page;
      return Response.json({
        issues: page.keys.map(issue),
        nextPageToken: page.nextPageToken,
        isLast: page.isLast,
      });
    }),
  );
}

function config(projects: string[]): Config {
  return {
    github: { username: '', orgs: [] },
    jira: {
      instances: [
        {
          name: 'acme',
          url: 'https://acme.atlassian.net',
          email: 'dev@example.com',
          token: 'test-token',
          projects,
        },
      ],
    },
    output: { directory: './work-log' },
    fetch: { since: '2025-01-01', until: '2025-06-01' },
    analysis: { thresholds: { minor: {}, major: {}, flagship: {} } },
  };
}

async function storedKeys(): Promise<string[]> {
  const tickets = await readAllTickets(outputDir);
  return tickets.map((t) => t.frontmatter.key).sort();
}

beforeEach(() => {
  outputDir = mkdtempSync(join(tmpdir(), 'wc-jira-'));
  logs = [];
  requests = [];
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

describe('fetchJiraTickets pagination', () => {
  it('follows page tokens until the last page and keeps every ticket', async () => {
    serve({
      PAY: [
        { keys: ['PAY-1', 'PAY-2'], nextPageToken: 't2', isLast: false },
        { keys: ['PAY-3'], nextPageToken: 't3', isLast: false },
        { keys: ['PAY-4'], isLast: true },
      ],
    });

    const results = await fetchJiraTickets({
      config: config(['PAY']),
      outputDir,
    });

    expect(requests).toEqual([
      { project: 'PAY', nextPageToken: undefined },
      { project: 'PAY', nextPageToken: 't2' },
      { project: 'PAY', nextPageToken: 't3' },
    ]);
    expect(await storedKeys()).toEqual(['PAY-1', 'PAY-2', 'PAY-3', 'PAY-4']);
    expect(results).toEqual([
      {
        instance: 'acme',
        project: 'PAY',
        ticketsWritten: 4,
        ticketsSkipped: 0,
        ticketsCached: 0,
      },
    ]);
    expect(process.exitCode).toBeUndefined();
  });

  it('stops when a page has no next token even if isLast is missing', async () => {
    serve({ PAY: [{ keys: ['PAY-1'] }, { keys: ['PAY-2'], isLast: true }] });

    await fetchJiraTickets({ config: config(['PAY']), outputDir });

    expect(requests).toHaveLength(1);
    expect(await storedKeys()).toEqual(['PAY-1']);
  });

  // Atlassian documents that a page can be empty while more pages follow.
  it('keeps paging past an empty page that is not the last', async () => {
    serve({
      PAY: [
        { keys: ['PAY-1'], nextPageToken: 't2', isLast: false },
        { keys: [], nextPageToken: 't3', isLast: false },
        { keys: ['PAY-3'], isLast: true },
      ],
    });

    await fetchJiraTickets({ config: config(['PAY']), outputDir });

    expect(requests.map((r) => r.nextPageToken)).toEqual([
      undefined,
      't2',
      't3',
    ]);
    expect(await storedKeys()).toEqual(['PAY-1', 'PAY-3']);
    expect(process.exitCode).toBeUndefined();
  });

  it('completes a fetch that ends exactly on the page cap', async () => {
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        n++;
        return Response.json({
          issues: [],
          nextPageToken: `t${n}`,
          isLast: n === MAX_PAGES,
        });
      }),
    );

    await fetchJiraTickets({ config: config(['PAY']), outputDir });

    expect(n).toBe(MAX_PAGES);
    expect(logs.some((line) => line.includes('JIRA pagination error'))).toBe(
      false,
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('fails the project when the server never reaches a last page', async () => {
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        n++;
        return Response.json({
          issues: [],
          nextPageToken: `t${n}`,
          isLast: false,
        });
      }),
    );

    const results = await fetchJiraTickets({
      config: config(['PAY']),
      outputDir,
    });

    expect(n).toBe(MAX_PAGES);
    expect(results).toEqual([]);
    expect(logs.some((line) => line.includes('JIRA pagination error'))).toBe(
      true,
    );
    expect(process.exitCode).toBe(1);
  });

  // A repeated token means the rest of the results are unreachable, so the
  // project must be reported as incomplete rather than as a success.
  it('fails the project instead of looping when the server repeats a page token', async () => {
    serve({
      PAY: [
        { keys: ['PAY-1'], nextPageToken: 't2', isLast: false },
        { keys: ['PAY-2'], nextPageToken: 't2', isLast: false },
      ],
      OPS: [{ keys: ['OPS-1'], isLast: true }],
    });

    const results = await fetchJiraTickets({
      config: config(['PAY', 'OPS']),
      outputDir,
    });

    expect(requests.filter((r) => r.project === 'PAY')).toHaveLength(2);
    const warning = logs.find(
      (line) => line.includes('PAY') && line.includes('page token'),
    );
    expect(warning).toContain('t2');
    expect(results.map((r) => r.project)).toEqual(['OPS']);
    expect(await storedKeys()).toEqual(['OPS-1', 'PAY-1', 'PAY-2']);
    expect(process.exitCode).toBe(1);
  });
});

describe('fetchJiraTickets errors', () => {
  it('reports a failing project, fails the run and still fetches the others', async () => {
    serve({
      PAY: [
        { keys: ['PAY-1'], nextPageToken: 't2', isLast: false },
        new Response('Unauthorized', { status: 401 }),
      ],
      OPS: [{ keys: ['OPS-1'], isLast: true }],
    });

    const results = await fetchJiraTickets({
      config: config(['PAY', 'OPS']),
      outputDir,
    });

    const failure = logs.find(
      (line) => line.includes('PAY') && line.includes('401'),
    );
    expect(failure).toContain('Unauthorized');
    expect(results.map((r) => r.project)).toEqual(['OPS']);
    expect(await storedKeys()).toEqual(['OPS-1', 'PAY-1']);
    expect(process.exitCode).toBe(1);
  });

  // Every project shares the same credentials, so after a 429 the next
  // request would only be rate limited again.
  it('aborts the whole fetch on a rate limit and says when to retry', async () => {
    serve({
      PAY: [
        { keys: ['PAY-1'], nextPageToken: 't2', isLast: false },
        new Response('Too Many Requests', {
          status: 429,
          headers: { 'Retry-After': '30' },
        }),
      ],
      OPS: [{ keys: ['OPS-1'], isLast: true }],
    });

    const fetching = fetchJiraTickets({
      config: config(['PAY', 'OPS']),
      outputDir,
    });

    await expect(fetching).rejects.toBeInstanceOf(RateLimitError);
    await expect(fetching).rejects.toThrow(/rate limit.*30 seconds/i);
    expect(requests.map((r) => r.project)).toEqual(['PAY', 'PAY']);
    expect(await storedKeys()).toEqual(['PAY-1']);
  });
});
