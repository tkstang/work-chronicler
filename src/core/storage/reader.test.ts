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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPRFilePath, getPRReviewFilePath, getTicketFilePath } from './paths';
import {
  ImportInProgressError,
  nodeReaderFs,
  readAllImportedRecords,
  readAllPRReviews,
  readAllPRs,
  readAllTickets,
  readPR,
  readPRReview,
  readTicket,
  type ReaderFs,
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
    // Finished imports can leave a released lock and a finished transaction
    // with staged copies in the root (an import in progress: see below)
    mkdirSync(join(outputDir, '.import-lock.released-old'));
    writeFileSync(
      join(outputDir, '.import-lock.released-old', 'owner.json'),
      '',
    );
    mkdirSync(join(outputDir, '.import-transaction.done-old', 'staged'), {
      recursive: true,
    });
    writeFileSync(
      join(outputDir, '.import-transaction.done-old', 'staged', '0.md'),
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

/** Fail reads of paths matching `match` with a filesystem error */
function failingReads(
  op: 'readdir' | 'readFile',
  match: (path: string) => boolean,
  code = 'EACCES',
): ReaderFs {
  const fail = (path: string) => {
    if (match(path)) {
      throw Object.assign(new Error(`${code}: injected`), { code });
    }
  };
  return {
    ...nodeReaderFs,
    readdir: (path) => {
      if (op === 'readdir') fail(path);
      return nodeReaderFs.readdir(path);
    },
    readFile: (path) => {
      if (op === 'readFile') fail(path);
      return nodeReaderFs.readFile(path);
    },
  };
}

describe('read failures', () => {
  it('reports an unreadable directory or record file apart from invalid ones', () => {
    const stored = storeRecord(outputDir, 1);
    storeRecord(outputDir, 2);
    writeFileSync(join(outputDir, 'messages', 'slack', 'broken.md'), 'x');

    const dirFailure = scanImportedRecords(outputDir, {
      fs: failingReads('readdir', (p) => p.endsWith(join('messages', 'slack'))),
    });
    expect(dirFailure.records).toEqual([]);
    expect(dirFailure.skipped).toEqual([
      {
        filePath: join(outputDir, 'messages', 'slack'),
        reason: 'directory could not be read',
        unreadable: true,
      },
    ]);

    const fileFailure = scanImportedRecords(outputDir, {
      fs: failingReads('readFile', (p) => p === stored, 'EIO'),
    });
    expect(fileFailure.records).toHaveLength(1);
    expect(
      fileFailure.skipped
        .map((s) => [s.filePath.split('/').pop(), s.unreadable])
        .sort(),
    ).toEqual(
      [
        ['broken.md', false],
        [stored.split('/').pop(), true],
      ].sort(),
    );
  });

  it('throws on an unreadable PR file only when strict, and still skips invalid ones', async () => {
    const authored = pr('Authored');
    const path = getPRFilePath(
      outputDir,
      'acme',
      'app',
      new Date(authored.createdAt),
      42,
    );
    writeMarkdownFile(path, authored, '');
    writeFileSync(
      join(outputDir, 'pull-requests', 'acme', 'app', 'invalid.md'),
      '---\ntitle: 1\n---\n',
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fs = failingReads('readFile', (p) => p === path, 'EIO');

    expect(await readAllPRs(outputDir, { fs })).toEqual([]);
    await expect(readAllPRs(outputDir, { fs, strict: true })).rejects.toThrow(
      'EIO',
    );
    expect(await readAllPRs(outputDir, { strict: true })).toHaveLength(1);
    // A missing directory is not a failure
    await expect(readAllTickets(outputDir, { strict: true })).resolves.toEqual(
      [],
    );
    mkdirSync(join(outputDir, 'jira'));
    await expect(
      readAllTickets(outputDir, {
        strict: true,
        fs: failingReads('readdir', (p) => p.endsWith('jira')),
      }),
    ).rejects.toThrow('EACCES');
    warn.mockRestore();
  });
});

// Readers never observe part of an import's batch: while an import is
// running or was interrupted (`.import-transaction/` exists) imported records
// are not read, and a scan during which an import changed the record
// directories is read again (or refused if they keep changing).
describe('imported records and import transactions', () => {
  const transaction = () => join(outputDir, '.import-transaction');

  it('refuses while an import is running or was interrupted, without reading', async () => {
    storeRecord(outputDir, 1, 'My own words.');
    mkdirSync(transaction());
    const reads: string[] = [];
    const fs: ReaderFs = {
      ...nodeReaderFs,
      readFile: (path) => {
        reads.push(path);
        return nodeReaderFs.readFile(path);
      },
    };

    expect(() => scanImportedRecords(outputDir, { fs })).toThrow(
      ImportInProgressError,
    );
    await expect(readAllImportedRecords(outputDir)).rejects.toThrow(
      /An import is running in .*, or was interrupted.*work-chronicler import/,
    );
    expect(reads).toEqual([]);

    rmSync(transaction(), { recursive: true });
    expect(scanImportedRecords(outputDir).records).toHaveLength(1);
  });

  it('refuses a scan during which an import began', () => {
    storeRecord(outputDir, 1);
    storeRecord(outputDir, 2);
    let started = false;
    const fs: ReaderFs = {
      ...nodeReaderFs,
      readFile: (path) => {
        if (!started) {
          started = true;
          mkdirSync(transaction());
        }
        return nodeReaderFs.readFile(path);
      },
    };

    expect(() => scanImportedRecords(outputDir, { fs })).toThrow(
      ImportInProgressError,
    );
  });

  it('reads again when a whole batch was stored during the scan', () => {
    storeRecord(outputDir, 1, 'Before the batch.');
    let scans = 0;
    let stored = false;
    const fs: ReaderFs = {
      ...nodeReaderFs,
      readdir: (path) => {
        if (path.endsWith(join('messages', 'slack'))) scans++;
        return nodeReaderFs.readdir(path);
      },
      readFile: (path) => {
        const data = nodeReaderFs.readFile(path);
        if (!stored) {
          // A whole import (update and create) lands while the first scan
          // reads: the scan may hold a mix of before and after
          stored = true;
          storeRecord(outputDir, 1, 'After the batch.');
          storeRecord(outputDir, 2, 'Added by the batch.');
        }
        return data;
      },
    };

    const { records } = scanImportedRecords(outputDir, { fs });

    expect(scans).toBe(2);
    expect(records.map((r) => r.body).sort()).toEqual([
      'Added by the batch.',
      'After the batch.',
    ]);
  });

  it('refuses when the record directories keep changing', () => {
    storeRecord(outputDir, 1);
    let n = 10;
    const fs: ReaderFs = {
      ...nodeReaderFs,
      readFile: (path) => {
        const data = nodeReaderFs.readFile(path);
        storeRecord(outputDir, n++);
        return data;
      },
    };

    expect(() => scanImportedRecords(outputDir, { fs })).toThrow(
      /changed while they were being read/,
    );
  });
});
