import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import {
  messageFrontmatter,
  recordFile,
  snapshot,
} from '@core/import/import.test-support';
import {
  parseImportedRecordFile,
  serializeImportedRecord,
} from '@core/import/record-file';
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
import {
  getImportedRecordFilePath,
  getImportedRecordIdentity,
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
      'Uses ISO-8601 dates, SHA-256 and SHA3-256 digests, MD5-1, GPT-4 summaries, RFC-3339, CVE-2024-1234 and TLS-1.',
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

    await linkPRsToTickets({ config: config([' PAY ', 'ops']), outputDir });

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
    expect(result).toEqual({
      prsUpdated: 2,
      ticketsUpdated: 2,
      linksFound: 3,
      mentions: { records: 0, resolved: 0, unresolved: 0 },
    });
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

    expect(second).toEqual({
      prsUpdated: 0,
      ticketsUpdated: 0,
      linksFound: 0,
      mentions: { records: 0, resolved: 0, unresolved: 0 },
    });
    expect(paths.map((path) => readFileSync(path, 'utf-8'))).toEqual(before);
    expect(paths.map((path) => statSync(path).mtime.getTime())).toEqual(
      paths.map(() => past.getTime()),
    );
    expect(await prTickets()).toEqual({ 1: ['PAY-42'], 2: [] });
  });
});

/** A message stored where `import` would store it */
function writeMessage(
  n: number,
  mentions: { tickets?: string[]; pullRequests?: string[] },
): void {
  const parsed = parseImportedRecordFile(
    Buffer.from(
      recordFile(
        messageFrontmatter(n, {
          mentions: {
            tickets: mentions.tickets ?? [],
            pullRequests: mentions.pullRequests ?? [],
          },
        }),
        `Message ${n}`,
      ),
    ),
  );
  if (!parsed.ok) throw new Error('fixture must be valid');
  const path = getImportedRecordFilePath(
    outputDir,
    getImportedRecordIdentity(parsed.record),
  );
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeImportedRecord(parsed.record, parsed.body));
}

describe('linkPRsToTickets mentions in imported records', () => {
  it('resolves PR URLs in any form and ticket keys, keeps the rest unresolved, and changes no record', async () => {
    writePR(1, 'PAY-42: refunds', '');
    writeTicket('PAY-42');
    writeMessage(1, {
      pullRequests: [
        // GitHub capitalization, a tab and a fragment: all PR 1
        'https://github.com/Acme/App/pull/1/files#diff-1',
        // Not in the work log
        'https://github.com/acme/app/pull/99',
      ],
      tickets: ['PAY-42', 'OPS-7'],
    });
    writeMessage(2, { pullRequests: ['https://example.com/acme/app/1'] });
    const before = snapshot(join(outputDir, 'messages'));

    const result = await linkPRsToTickets({
      config: config(['PAY']),
      outputDir,
    });

    expect(result.mentions).toEqual({
      records: 2,
      resolved: 2,
      unresolved: 3,
    });
    expect(snapshot(join(outputDir, 'messages'))).toEqual(before);
    // Mentions are not links
    expect(await ticketPRs()).toEqual({
      'PAY-42': ['https://github.com/acme/app/pull/1'],
    });
  });

  it('resolves ticket mentions when there are no PRs', async () => {
    writeTicket('PAY-42');
    writeMessage(1, { tickets: ['pay-42'] });

    const result = await linkPRsToTickets({
      config: config(['PAY']),
      outputDir,
    });

    expect(result.mentions).toEqual({
      records: 1,
      resolved: 1,
      unresolved: 0,
    });
  });

  it('does not link a PR again under another capitalization', async () => {
    writePR(1, 'PAY-42: refunds', '');
    const ticketPath = writeTicket('PAY-42');
    const [ticket] = await readAllTickets(outputDir);
    if (!ticket) throw new Error('ticket missing');
    writeMarkdownFile(
      ticketPath,
      {
        ...ticket.frontmatter,
        linkedPRs: ['https://github.com/ACME/app/pull/1/'],
      },
      '',
    );

    const result = await linkPRsToTickets({
      config: config(['PAY']),
      outputDir,
    });

    expect(result.ticketsUpdated).toBe(0);
    expect(await ticketPRs()).toEqual({
      'PAY-42': ['https://github.com/ACME/app/pull/1/'],
    });
  });
});
