import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  messageFrontmatter,
  recordFile,
  SECRET,
  storeRecord,
} from '@core/import/import.test-support';
import type { PullRequest } from '@wc-types/pr';
import type { PRReviewRecord } from '@wc-types/pr-review';
import type { JiraTicket } from '@wc-types/ticket';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getPRFilePath, getPRReviewFilePath, getTicketFilePath } from './paths';
import {
  readAllImportedRecords,
  readAllPRReviews,
  readAllPRs,
  readAllTickets,
  readPR,
  readPRReview,
  readTicket,
  scanImportedRecords,
} from './reader';
import { writeMarkdownFile } from './writer';

// The work log is the user's only durable record of their work, so a write
// followed by a read must give back exactly what was fetched.
let outputDir: string;

beforeEach(() => {
  outputDir = mkdtempSync(join(tmpdir(), 'wc-storage-'));
});

afterEach(() => {
  rmSync(outputDir, { recursive: true, force: true });
});

const trickyTitles = [
  'feat: "quoted" title with: colons, #hash and \\backslash',
  "it's a 'single-quoted' – en dash, emoji 🚀 and ünïcödé",
  '- leading dash [brackets] {braces} & *stars* | pipe > gt',
  'yes',
  'null',
  '123',
  '2025-01-01',
  '---',
];

const body = [
  '## Summary',
  '',
  'Line with trailing spaces for a hard break  ',
  'Text with --- inside and a front-matter-like line:',
  '',
  '---',
  'title: not frontmatter',
  '---',
  '',
  '```ts',
  'const x = { a: 1 };',
  '```',
].join('\n');

function pr(title: string, overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    title,
    prNumber: 42,
    repository: 'app',
    org: 'acme',
    author: 'alice',
    state: 'merged',
    createdAt: '2025-03-03T10:00:00Z',
    mergedAt: '2025-03-04T10:00:00Z',
    closedAt: null,
    url: 'https://github.com/acme/app/pull/42',
    additions: 120,
    deletions: 30,
    changedFiles: 6,
    jiraTickets: ['PAY-1', 'PAY-2'],
    labels: ['feature', 'needs review'],
    impact: 'major',
    ...overrides,
  };
}

function ticket(summary: string): JiraTicket {
  return {
    key: 'PAY-1',
    summary,
    project: 'PAY',
    org: 'acme',
    issueType: 'Story',
    status: 'In Progress',
    storyPoints: 2.5,
    url: 'https://acme.atlassian.net/browse/PAY-1',
    createdAt: '2025-03-01T10:00:00.000+0000',
    resolvedAt: null,
    linkedPRs: ['https://github.com/acme/app/pull/42'],
  };
}

describe('PR storage round trip', () => {
  it.each(trickyTitles)(
    'keeps frontmatter and body for title %j',
    async (title) => {
      const frontmatter = pr(title);
      const path = getPRFilePath(
        outputDir,
        'acme',
        'app',
        new Date(frontmatter.createdAt),
        42,
      );

      writeMarkdownFile(path, frontmatter, body);

      expect(await readPR(path)).toEqual({ frontmatter, body, filePath: path });
    },
  );

  it('keeps empty arrays, null dates and an empty body', async () => {
    const frontmatter = pr('Empty fields', {
      mergedAt: null,
      jiraTickets: [],
      labels: [],
      state: 'open',
    });
    const path = getPRFilePath(
      outputDir,
      'acme',
      'app',
      new Date(frontmatter.createdAt),
      42,
    );

    writeMarkdownFile(path, frontmatter, '');

    const [read] = await readAllPRs(outputDir);
    expect(read).toEqual({ frontmatter, body: '', filePath: path });
  });

  // `trim()`-style cleanup would drop the leading whitespace these bodies
  // start with and change how the markdown renders.
  it.each([
    ['an indented code block', '    npm install work-chronicler\n\nRun it.'],
    ['blank lines', '\n  \n    npm install work-chronicler\n\nRun it.'],
  ])('keeps a body that starts with %s', async (_, indented) => {
    const frontmatter = pr('Indented body');
    const path = getPRFilePath(
      outputDir,
      'acme',
      'app',
      new Date(frontmatter.createdAt),
      42,
    );

    writeMarkdownFile(path, frontmatter, indented);

    expect((await readPR(path))?.body).toBe(indented);
  });
});

describe('ticket storage round trip', () => {
  it.each(trickyTitles)(
    'keeps frontmatter and body for summary %j',
    async (summary) => {
      const frontmatter = ticket(summary);
      const path = getTicketFilePath(outputDir, 'acme', 'PAY', 'PAY-1');

      writeMarkdownFile(path, frontmatter, body);

      expect(await readTicket(path)).toEqual({
        frontmatter,
        body,
        filePath: path,
      });
    },
  );

  it('keeps null story points and an empty linked-PR list', async () => {
    const frontmatter = {
      ...ticket('No points'),
      storyPoints: null,
      linkedPRs: [],
    };
    const path = getTicketFilePath(outputDir, 'acme', 'PAY', 'PAY-1');

    writeMarkdownFile(path, frontmatter, '');

    const [read] = await readAllTickets(outputDir);
    expect(read).toEqual({ frontmatter, body: '', filePath: path });
  });
});

function reviewRecord(text: string): PRReviewRecord {
  return {
    type: 'pr-review',
    reviewer: 'me',
    pr: {
      url: 'https://github.com/acme/app/pull/42',
      org: 'acme',
      repository: 'app',
      prNumber: 42,
      title: text,
      author: 'alice',
      state: 'open',
    },
    prUpdatedAt: '2025-03-05T10:00:00Z',
    reviews: [
      {
        reviewId: 9001,
        state: 'CHANGES_REQUESTED',
        submittedAt: '2025-03-04T10:00:00Z',
        url: 'https://github.com/acme/app/pull/42#pullrequestreview-9001',
        body: `${text}\n\n${body}`,
      },
      {
        reviewId: 9002,
        state: 'APPROVED',
        submittedAt: '2025-03-05T09:00:00Z',
        url: 'https://github.com/acme/app/pull/42#pullrequestreview-9002',
        body: '',
      },
    ],
    comments: [
      {
        commentId: 9001,
        reviewId: 9001,
        inReplyToId: null,
        path: 'src/a b.ts',
        line: null,
        createdAt: '2025-03-04T10:00:00Z',
        updatedAt: '2025-03-04T11:00:00Z',
        url: 'https://github.com/acme/app/pull/42#discussion_r9001',
        body: text,
      },
    ],
  };
}

describe('review record storage', () => {
  it.each(trickyTitles)(
    'keeps reviews and comments with text %j',
    async (text) => {
      const frontmatter = reviewRecord(text);
      const path = getPRReviewFilePath(outputDir, 'acme', 'app', 42);

      writeMarkdownFile(path, frontmatter, body);

      expect(await readPRReview(path)).toEqual({
        frontmatter,
        body,
        filePath: path,
      });
    },
  );

  it('keeps review records out of the authored-PR reader', async () => {
    const authored = pr('Authored');
    writeMarkdownFile(
      getPRFilePath(outputDir, 'acme', 'app', new Date(authored.createdAt), 42),
      authored,
      '',
    );
    writeMarkdownFile(
      getPRReviewFilePath(outputDir, 'acme', 'app', 42),
      reviewRecord('Reviewed'),
      '',
    );

    expect((await readAllPRs(outputDir)).map((p) => p.frontmatter)).toEqual([
      authored,
    ]);
    expect(
      (await readAllPRReviews(outputDir)).map((r) => r.frontmatter.pr.title),
    ).toEqual(['Reviewed']);
  });
});

describe('imported record storage', () => {
  it('reads records where import stored them and ignores the import working files', async () => {
    const stored = storeRecord(outputDir, 1, 'My own words.');
    // An import in progress keeps a lock and staged copies in the root
    writeFileSync(join(outputDir, '.import-lock'), 'owner');
    mkdirSync(join(outputDir, '.import-transaction', 'staged'), {
      recursive: true,
    });
    writeFileSync(
      join(outputDir, '.import-transaction', 'staged', '0.md'),
      recordFile(messageFrontmatter(2)),
    );
    writeFileSync(join(outputDir, 'messages', 'slack', 'notes.txt'), 'x');

    const records = await readAllImportedRecords(outputDir);

    expect(records).toHaveLength(1);
    expect(records[0]?.filePath).toBe(stored);
    expect(records[0]?.body).toBe('My own words.');
    expect(records[0]?.frontmatter.sourceId).toBe(
      'C0SYNTH01/1700000000.000001',
    );
  });

  it('skips invalid, misplaced and linked files without quoting them', () => {
    storeRecord(outputDir, 1);
    const dir = join(outputDir, 'messages', 'slack');
    writeFileSync(
      join(dir, 'broken.md'),
      `---\nsecret: ${SECRET}\n---\n\n${SECRET}\n`,
    );
    // A valid record copied under another name
    const moved = storeRecord(outputDir, 3);
    renameSync(moved, join(dir, 'copy.md'));
    symlinkSync(join(dir, 'copy.md'), join(dir, 'link.md'));

    const { records, skipped } = scanImportedRecords(outputDir);

    expect(records.map((r) => r.frontmatter.sourceId)).toEqual([
      'C0SYNTH01/1700000000.000001',
    ]);
    expect(skipped.map((s) => [s.filePath.split('/').pop(), s.reason])).toEqual(
      [
        [
          'broken.md',
          'is not a valid imported record (SCHEMA_INVALID at type)',
        ],
        ['copy.md', 'is not stored where its identity puts it'],
        ['link.md', 'is not a regular file'],
      ],
    );
    expect(JSON.stringify(skipped)).not.toContain(SECRET);
  });

  it('returns nothing for a work log without imported records', async () => {
    expect(await readAllImportedRecords(outputDir)).toEqual([]);
    expect(await readAllImportedRecords(join(outputDir, 'missing'))).toEqual(
      [],
    );
  });
});
