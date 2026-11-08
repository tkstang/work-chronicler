import type { PullRequestFile } from '@wc-types/pr';
import type { JiraTicketFile } from '@wc-types/ticket';
import { describe, expect, it } from 'vitest';

import {
  buildMentionIndex,
  getPullRequestUrlRepository,
  hasResolvedMention,
  normalizePullRequestUrl,
  resolveMentions,
} from './mentions';

describe('normalizePullRequestUrl', () => {
  it.each([
    [
      'https://github.com/acme/api/pull/7',
      'https://github.com/acme/api/pull/7',
    ],
    [
      'https://github.com/Acme/API/pull/7',
      'https://github.com/acme/api/pull/7',
    ],
    [
      'http://www.GitHub.com/acme/api/pull/7/',
      'https://github.com/acme/api/pull/7',
    ],
    [
      'https://github.com/acme/api/pull/7/files',
      'https://github.com/acme/api/pull/7',
    ],
    [
      'https://github.com/acme/api/pull/7/commits/abc123',
      'https://github.com/acme/api/pull/7',
    ],
    [
      'https://github.com/acme/api/pull/7#discussion_r1',
      'https://github.com/acme/api/pull/7',
    ],
    [
      'https://github.com/acme/api/pull/7?w=1',
      'https://github.com/acme/api/pull/7',
    ],
    [
      'https://github.com/acme/api/pull/007',
      'https://github.com/acme/api/pull/7',
    ],
    [
      'https://api.github.com/repos/Acme/api/pulls/7',
      'https://github.com/acme/api/pull/7',
    ],
    [
      '  https://github.com/acme/api/pull/7  ',
      'https://github.com/acme/api/pull/7',
    ],
    [
      'https://ghe.example.com/acme/api/pull/7',
      'https://ghe.example.com/acme/api/pull/7',
    ],
  ])('normalizes %s', (input, expected) => {
    expect(normalizePullRequestUrl(input)).toBe(expected);
  });

  it.each([
    'https://github.com/acme/api/issues/7',
    'https://github.com/acme/api/pull/',
    'https://github.com/acme/api/pull/0',
    'https://github.com/acme/api/pull/7abc',
    'https://github.com/acme/pull/7',
    'https://user@github.com/acme/api/pull/7',
    'ftp://github.com/acme/api/pull/7',
    'acme/api#7',
  ])('rejects %s', (input) => {
    expect(normalizePullRequestUrl(input)).toBeNull();
  });

  it('reads the org and repository from a PR URL', () => {
    expect(
      getPullRequestUrlRepository('https://github.com/Acme/Web/pull/3/files'),
    ).toEqual({ org: 'acme', repository: 'web' });
    expect(getPullRequestUrlRepository('https://example.com/x')).toBeNull();
  });
});

function prFile(url: string, title = 'PR'): PullRequestFile {
  return {
    frontmatter: {
      title,
      prNumber: Number(url.split('/').pop()),
      repository: 'api',
      org: 'acme',
      author: 'me',
      state: 'merged',
      createdAt: '2025-01-01T00:00:00Z',
      mergedAt: null,
      closedAt: null,
      url,
      additions: 1,
      deletions: 1,
      changedFiles: 1,
      jiraTickets: [],
      labels: [],
    },
    body: '',
    filePath: `/x/${url}`,
  };
}

function ticketFile(key: string, org = 'acme-jira'): JiraTicketFile {
  return {
    frontmatter: {
      key,
      summary: `Ticket ${key}`,
      project: key.split('-')[0] ?? '',
      org,
      issueType: 'Story',
      status: 'Done',
      storyPoints: null,
      url: `https://acme.atlassian.net/browse/${key}`,
      createdAt: '2025-01-01T00:00:00Z',
      resolvedAt: null,
      linkedPRs: [],
    },
    body: '',
    filePath: `/x/${key}`,
  };
}

describe('resolveMentions', () => {
  // The PR's stored URL uses GitHub's capitalization; mentions do not
  const index = buildMentionIndex(
    [prFile('https://github.com/Acme/Api/pull/7', 'Billing export')],
    [ticketFile('BILL-1')],
  );

  it('resolves PR URLs written differently and ticket keys, and keeps the rest unresolved', () => {
    const resolved = resolveMentions(
      {
        mentions: {
          pullRequests: [
            'https://github.com/acme/api/pull/7/files',
            'https://github.com/ACME/api/pull/7',
            'https://github.com/acme/api/pull/8',
            'https://example.com/not-a-pr',
          ],
          tickets: ['BILL-1', 'BILL-2'],
        },
      },
      index,
    );

    expect(
      resolved.pullRequests.map((m) => [
        m.url,
        m.normalizedUrl,
        m.resolved?.frontmatter.title ?? null,
      ]),
    ).toEqual([
      [
        'https://github.com/acme/api/pull/7/files',
        'https://github.com/acme/api/pull/7',
        'Billing export',
      ],
      [
        'https://github.com/acme/api/pull/8',
        'https://github.com/acme/api/pull/8',
        null,
      ],
      ['https://example.com/not-a-pr', null, null],
    ]);
    expect(
      resolved.tickets.map((m) => [m.key, m.resolved?.frontmatter.key ?? null]),
    ).toEqual([
      ['BILL-1', 'BILL-1'],
      ['BILL-2', null],
    ]);
  });

  it('leaves a key that two JIRA instances hold unresolved', () => {
    const twoInstances = buildMentionIndex(
      [],
      [
        ticketFile('BILL-1', 'acme-jira'),
        ticketFile('BILL-1', 'partner-jira'),
        ticketFile('OPS-2', 'acme-jira'),
      ],
    );
    const record = { mentions: { pullRequests: [], tickets: ['bill-1'] } };

    expect(resolveMentions(record, twoInstances).tickets).toEqual([
      { key: 'BILL-1', resolved: null },
    ]);
    expect(hasResolvedMention(record, twoInstances)).toBe(false);
    // A key in one instance still resolves, even when read twice
    const once = buildMentionIndex(
      [],
      [ticketFile('OPS-2'), ticketFile('OPS-2')],
    );
    expect(
      resolveMentions(
        { mentions: { pullRequests: [], tickets: ['OPS-2'] } },
        once,
      ).tickets[0]?.resolved?.frontmatter.key,
    ).toBe('OPS-2');
  });

  it('tells a record with only unresolved mentions from one with a resolved one', () => {
    expect(
      hasResolvedMention(
        { mentions: { pullRequests: [], tickets: ['OPS-9'] } },
        index,
      ),
    ).toBe(false);
    expect(
      hasResolvedMention(
        {
          mentions: {
            pullRequests: ['https://github.com/acme/api/pull/7'],
            tickets: [],
          },
        },
        index,
      ),
    ).toBe(true);
  });
});
