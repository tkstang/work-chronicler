import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  type Config,
  ConfigSchema,
  getPRFilePath,
  getTicketFilePath,
  type JiraTicket,
  type PullRequest,
  readAllPRs,
  readAllTickets,
  writeMarkdownFile,
} from '@core/index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { linkPRsToTickets } from './index';

let outputDir: string;

beforeEach(() => {
  outputDir = mkdtempSync(join(tmpdir(), 'wc-linker-'));
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(outputDir, { recursive: true, force: true });
});

function config(projects?: string[]): Config {
  return ConfigSchema.parse({
    github: { username: '' },
    fetch: { since: '2025-01-01' },
    ...(projects
      ? {
          jira: {
            instances: [
              { name: 'acme', url: 'https://acme.atlassian.net', projects },
            ],
          },
        }
      : {}),
  });
}

function writePR(prNumber: number, title: string, body: string): string {
  const frontmatter: PullRequest = {
    title,
    prNumber,
    repository: 'app',
    org: 'acme',
    author: 'alice',
    state: 'merged',
    createdAt: '2025-03-03T10:00:00Z',
    mergedAt: '2025-03-04T10:00:00Z',
    closedAt: '2025-03-04T10:00:00Z',
    url: `https://github.com/acme/app/pull/${prNumber}`,
    additions: 10,
    deletions: 2,
    changedFiles: 1,
    jiraTickets: [],
    labels: [],
  };
  const path = getPRFilePath(
    outputDir,
    'acme',
    'app',
    new Date(frontmatter.createdAt),
    prNumber,
  );
  writeMarkdownFile(path, frontmatter, body);
  return path;
}

function writeTicket(key: string): string {
  const project = key.split('-')[0] ?? key;
  const frontmatter: JiraTicket = {
    key,
    summary: `Ticket ${key}`,
    project,
    org: 'acme',
    issueType: 'Story',
    status: 'Done',
    storyPoints: null,
    url: `https://acme.atlassian.net/browse/${key}`,
    createdAt: '2025-03-01T10:00:00.000+0000',
    resolvedAt: null,
    linkedPRs: [],
  };
  const path = getTicketFilePath(outputDir, 'acme', project, key);
  writeMarkdownFile(path, frontmatter, '');
  return path;
}

async function prTickets(): Promise<Record<number, string[]>> {
  const prs = await readAllPRs(outputDir);
  return Object.fromEntries(
    prs.map((pr) => [pr.frontmatter.prNumber, pr.frontmatter.jiraTickets]),
  );
}

async function ticketPRs(): Promise<Record<string, string[]>> {
  const tickets = await readAllTickets(outputDir);
  return Object.fromEntries(
    tickets.map((t) => [t.frontmatter.key, t.frontmatter.linkedPRs]),
  );
}

describe('linkPRsToTickets ticket-key matching', () => {
  // A false link puts unrelated work on someone's review, so standards and
  // version strings in PR text must never become ticket references.
  it('ignores standards and version strings when no JIRA projects are configured', async () => {
    writePR(
      1,
      'PAY-42: store amounts as UTF-8',
      'Uses ISO-8601 dates, SHA-256 digests, GPT-4 summaries, RFC-3339, CVE-2024-1234 and TLS-1.',
    );

    await linkPRsToTickets({ config: config(), outputDir });

    expect(await prTickets()).toEqual({ 1: ['PAY-42'] });
  });

  it('links a fetched ticket whose key looks like a standard when no projects are configured', async () => {
    writePR(1, 'TLS-1: rotate certificates', 'Follows ISO-8601 and TLS-2.');
    writeTicket('TLS-1');

    await linkPRsToTickets({ config: config(), outputDir });

    expect(await prTickets()).toEqual({ 1: ['TLS-1'] });
    expect(await ticketPRs()).toEqual({
      'TLS-1': ['https://github.com/acme/app/pull/1'],
    });
  });

  it('only links keys from configured projects when projects are set', async () => {
    writePR(1, 'PAY-42 and OPS-7', 'Also mentions SHA-256 and LEGACY-9.');

    await linkPRsToTickets({ config: config(['PAY', 'ops']), outputDir });

    expect(await prTickets()).toEqual({ 1: ['PAY-42', 'OPS-7'] });
  });

  it('allows a configured project whose key looks like a standard', async () => {
    writePR(1, 'SHA-12: rotate secrets', '');

    await linkPRsToTickets({ config: config(['SHA']), outputDir });

    expect(await prTickets()).toEqual({ 1: ['SHA-12'] });
  });
});

describe('linkPRsToTickets links', () => {
  it('records each link on both the PR and the ticket', async () => {
    writePR(1, 'PAY-42: refunds', 'Follow-up for PAY-43.');
    writePR(2, 'Refund emails', 'Part of PAY-42.');
    writeTicket('PAY-42');
    writeTicket('PAY-43');

    const result = await linkPRsToTickets({
      config: config(['PAY']),
      outputDir,
    });

    expect(await prTickets()).toEqual({
      1: ['PAY-42', 'PAY-43'],
      2: ['PAY-42'],
    });
    expect(await ticketPRs()).toEqual({
      'PAY-42': [
        'https://github.com/acme/app/pull/1',
        'https://github.com/acme/app/pull/2',
      ],
      'PAY-43': ['https://github.com/acme/app/pull/1'],
    });
    expect(result).toEqual({ prsUpdated: 2, ticketsUpdated: 2, linksFound: 3 });
  });

  it('is idempotent: a second run adds nothing and rewrites no files', async () => {
    const paths = [
      writePR(1, 'PAY-42: refunds', 'See PAY-42 again.'),
      writePR(2, 'Unrelated cleanup', 'No ticket.'),
      writeTicket('PAY-42'),
    ];
    await linkPRsToTickets({ config: config(['PAY']), outputDir });

    const past = new Date('2020-01-01T00:00:00Z');
    const before = paths.map((path) => {
      utimesSync(path, past, past);
      return readFileSync(path, 'utf-8');
    });

    const second = await linkPRsToTickets({
      config: config(['PAY']),
      outputDir,
    });

    expect(second).toEqual({ prsUpdated: 0, ticketsUpdated: 0, linksFound: 0 });
    expect(paths.map((path) => readFileSync(path, 'utf-8'))).toEqual(before);
    expect(paths.map((path) => statSync(path).mtime.getTime())).toEqual(
      paths.map(() => past.getTime()),
    );
    expect(await prTickets()).toEqual({ 1: ['PAY-42'], 2: [] });
  });
});
