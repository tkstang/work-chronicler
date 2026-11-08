import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import {
  docIdentity,
  documentFrontmatter,
  makeWorld,
  messageFrontmatter,
  SECRET,
  stage,
  SYNTH_DOCS_SOURCES,
  SYNTH_GOOGLE_ACCOUNT,
  SYNTH_RANGE,
} from '@core/import/import.test-support';
import { getImportedRecordFilePath } from '@storage/paths';
import { MAX_DOCUMENT_EXCERPT_BYTES } from '@wc-types/google-docs';
import type { ImportSubject } from '@wc-types/imported-record';
import { afterAll, describe, expect, it } from 'vitest';

import {
  type ImportRangeInput,
  type ImportSourceSettings,
  runImport,
} from './index';

// Google Docs ownership, range and excerpt rules, enforced on every record
// `validate` and `import` read. Each refusal must reject the batch without
// echoing the record's content. The synthetic Doc (owned by
// SYNTH_GOOGLE_ACCOUNT, created 2025-11-01, modified 2026-03-02T10:00Z)
// matches SYNTH_DOCS_SOURCES and SYNTH_RANGE (2026-01-01 to 2026-06-30).

const bases: string[] = [];
afterAll(() => {
  for (const base of bases) rmSync(base, { recursive: true, force: true });
});

const ALICE: ImportSubject = { kind: 'report', reportId: 'alice-smith' };
const BODY = `Synthetic Doc text. ${SECRET}`;

function run(
  records: Record<string, unknown>[],
  options: {
    sources?: ImportSourceSettings;
    target?: ImportSubject;
    range?: ImportRangeInput | null;
    mode?: 'validate' | 'import';
    body?: string;
    world?: ReturnType<typeof makeWorld>;
  } = {},
) {
  const w = options.world ?? makeWorld();
  if (!options.world) bases.push(w.base);
  const target = options.target ?? { kind: 'ic' };
  records.forEach((record, i) =>
    stage(
      w.staging,
      `${i}.md`,
      { ...record, subject: target },
      options.body ?? BODY,
    ),
  );
  return {
    world: w,
    result: runImport({
      mode: options.mode ?? 'validate',
      stagingDir: w.staging,
      workLogRoot: w.workLog,
      target,
      sources: options.sources ?? SYNTH_DOCS_SOURCES,
      ...(options.range === null
        ? {}
        : { range: options.range ?? SYNTH_RANGE }),
    }),
  };
}

function check(
  overrides: Record<string, unknown>,
  options: Parameters<typeof run>[1] = {},
) {
  return run([documentFrontmatter(1, overrides)], options).result;
}

function problems(result: ReturnType<typeof runImport>) {
  expect(result.ok).toBe(false);
  expect(JSON.stringify(result)).not.toContain(SECRET);
  return result.issues.map((i) => [i.code, i.field]);
}

const doc = (details: Record<string, unknown>) => ({
  document: {
    ...(documentFrontmatter(1).document as Record<string, unknown>),
    ...details,
  },
});

describe('Google Docs records: accepted', () => {
  it('accepts a Doc the configured account owns, created before the range and modified in it', () => {
    const result = check({});
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.range).toEqual({
      since: '2026-01-01T00:00:00.000Z',
      until: '2026-06-30T23:59:59.999Z',
      overridden: false,
    });
  });

  it('accepts a report Doc when the report has Google Docs settings', () => {
    expect(check({}, { target: ALICE }).ok).toBe(true);
  });

  it('accepts owners listed in another letter case, and the Docs link', () => {
    const result = check({
      url: `https://docs.google.com/document/d/${docIdentity(1).sourceId}/edit?usp=drivesdk`,
      ...doc({ owners: ['Synthetic.Owner@Example.com'] }),
    });
    expect(result.issues).toEqual([]);
  });

  it('accepts an excerpt of exactly the cap, counted in UTF-8 bytes', () => {
    // "é" is two bytes: the cap is bytes, not characters
    const body = 'é'.repeat(MAX_DOCUMENT_EXCERPT_BYTES / 2);
    const result = check(doc({ truncated: true }), { body });
    expect(result.issues).toEqual([]);
  });

  it('stores Docs under documents/google-docs/, and a repeat leaves them unchanged', () => {
    const first = run([documentFrontmatter(1), documentFrontmatter(2)], {
      mode: 'import',
    });
    expect(first.result.ok).toBe(true);
    const path = getImportedRecordFilePath(first.world.workLog, docIdentity(1));
    expect(
      path.startsWith(join(first.world.workLog, 'documents', 'google-docs')),
    ).toBe(true);
    const stored = readFileSync(path, 'utf-8');

    const again = runImport({
      mode: 'import',
      stagingDir: first.world.staging,
      workLogRoot: first.world.workLog,
      target: { kind: 'ic' },
      sources: SYNTH_DOCS_SOURCES,
      range: SYNTH_RANGE,
    });
    expect(again.summary).toEqual({
      records: 2,
      created: 0,
      updated: 0,
      unchanged: 2,
    });
    expect(readFileSync(path, 'utf-8')).toBe(stored);
  });
});

describe('Google Docs records: opt-in and ownership', () => {
  it.each([
    ['an IC', { kind: 'ic' } as ImportSubject, /this profile/],
    ['a report', ALICE, /this report/],
  ])(
    'refuses every Doc when Google Docs is not set up for %s',
    (_l, target, text) => {
      const result = check(
        {},
        { target, sources: { slack: null, googleDocs: null } },
      );
      expect(problems(result)).toEqual([['SOURCE_RULE', 'source']]);
      expect(result.issues[0]?.message).toMatch(text);
    },
  );

  it('refuses a Doc another account owns', () => {
    expect(
      problems(check(doc({ owners: ['someone.else@example.com'] }))),
    ).toEqual([['SOURCE_RULE', 'document.owners']]);
  });

  it('refuses a Doc with a second owner besides the configured account', () => {
    expect(
      problems(
        check(doc({ owners: [SYNTH_GOOGLE_ACCOUNT, 'other@example.com'] })),
      ),
    ).toEqual([['SOURCE_RULE', 'document.owners']]);
  });

  it.each([
    ['null', { owners: null }],
    ['left out', { owners: undefined }],
  ])('refuses a Doc whose owner evidence is %s', (_l, details) => {
    const result = check(doc(details));
    expect(problems(result)).toEqual([['SOURCE_RULE', 'document.owners']]);
    expect(result.issues[0]?.message).toMatch(/owner evidence is missing/);
  });

  it('refuses an ownerless Doc and a shared-drive Doc', () => {
    expect(problems(check(doc({ owners: [] })))).toEqual([
      ['SOURCE_RULE', 'document.owners'],
    ]);
    expect(
      problems(check(doc({ owners: [], driveId: '0ASynthDrive01' }))),
    ).toEqual([
      ['SOURCE_RULE', 'document.driveId'],
      ['SOURCE_RULE', 'document.owners'],
    ]);
  });

  it('refuses a record whose sourceAccount is not the configured account', () => {
    expect(problems(check({ sourceAccount: 'other@example.com' }))).toEqual([
      ['SOURCE_RULE', 'sourceAccount'],
    ]);
  });

  it('refuses verified attribution: owning a Doc is not writing it', () => {
    expect(
      problems(
        check({ attribution: { status: 'verified', authorId: 'someone' } }),
      ),
    ).toEqual([
      ['SOURCE_RULE', 'attribution.status'],
      ['SOURCE_RULE', 'attribution.authorId'],
    ]);
  });

  it('refuses a Drive file that is not a Google Doc', () => {
    expect(
      problems(
        check(doc({ mimeType: 'application/vnd.google-apps.spreadsheet' })),
      ),
    ).toEqual([['SOURCE_RULE', 'document.mimeType']]);
  });

  it('refuses an excerpt longer than the cap', () => {
    const body = 'a'.repeat(MAX_DOCUMENT_EXCERPT_BYTES) + SECRET;
    expect(problems(check(doc({ truncated: true }), { body }))).toEqual([
      ['SOURCE_RULE', 'body'],
    ]);
  });
});

describe('Google Docs records: range', () => {
  it.each([
    ['before since', '2025-12-31T23:59:59Z'],
    ['after a date-only until', '2026-07-01T00:00:00Z'],
  ])('refuses a Doc modified %s', (_l, modified) => {
    expect(
      problems(
        check({
          occurredAt: modified,
          updatedAt: modified,
          capturedAt: '2026-07-02T00:00:00Z',
        }),
      ),
    ).toEqual([['SOURCE_RULE', 'occurredAt']]);
  });

  it('includes a Doc modified late on a date-only until day, and at the start of since', () => {
    for (const modified of [
      '2026-06-30T23:59:59.999Z',
      '2026-01-01T00:00:00Z',
    ]) {
      const result = check({
        occurredAt: modified,
        updatedAt: modified,
        capturedAt: '2026-07-02T00:00:00Z',
      });
      expect(result.issues).toEqual([]);
    }
  });

  it('has no end when the configured until is null', () => {
    const modified = '2030-01-01T00:00:00Z';
    const result = check(
      { occurredAt: modified, updatedAt: modified, capturedAt: modified },
      { range: { since: '2026-01-01', until: null } },
    );
    expect(result.issues).toEqual([]);
    expect(result.range?.until).toBeNull();
  });

  it('applies --since and --until in place of the configured range, and echoes it', () => {
    const modified = '2025-06-15T12:00:00Z';
    const record = {
      occurredAt: modified,
      updatedAt: modified,
      ...doc({ createdAt: '2025-05-01T08:00:00Z' }),
    };
    expect(problems(check(record))).toEqual([['SOURCE_RULE', 'occurredAt']]);

    const override = {
      ...SYNTH_RANGE,
      override: { since: '2025-06-01', until: '2025-06-15T12:00:00Z' },
    };
    for (const mode of ['validate', 'import'] as const) {
      const result = check(record, { range: override, mode });
      expect(result.issues).toEqual([]);
      expect(result.range).toEqual({
        since: '2025-06-01T00:00:00.000Z',
        until: '2025-06-15T12:00:00.000Z',
        overridden: true,
      });
    }
  });

  it.each([
    [
      'a non-calendar date',
      { since: '2026-02-30' },
      /--since is not a calendar date/,
    ],
    [
      'a timestamp without a zone',
      { until: '2026-03-01T10:00:00' },
      /--until must be a date/,
    ],
    ['words', { since: 'last tuesday' }, /--since must be a date/],
    [
      'an until before since',
      { since: '2026-05-01', until: '2026-04-01' },
      /--until is earlier than since/,
    ],
  ])(
    'refuses %s as an override, even for a Slack-only batch',
    (_l, override, text) => {
      const result = run([messageFrontmatter(1)], {
        range: { ...SYNTH_RANGE, override },
      }).result;
      expect(problems(result)).toEqual([['RANGE_INVALID', undefined]]);
      expect(result.issues[0]?.message).toMatch(text);
    },
  );

  it('refuses Docs, but not messages, when the configured range cannot be read', () => {
    const range = { since: 'January 2026', until: null };
    const docs = check({}, { range });
    expect(problems(docs)).toEqual([['RANGE_INVALID', undefined]]);
    expect(docs.issues[0]?.message).toMatch(/configured fetch.since/);

    const messages = run([messageFrontmatter(1)], { range }).result;
    expect(messages.ok).toBe(true);
    expect(messages.range).toBeNull();
  });

  it('refuses Docs when no range is given at all', () => {
    expect(problems(check({}, { range: null }))).toEqual([
      ['SOURCE_RULE', 'occurredAt'],
    ]);
  });
});

describe('Google Docs records: malformed', () => {
  it.each([
    [
      'a sourceId that is not a Drive file ID',
      { sourceId: 'not a drive id' },
      'sourceId',
    ],
    [
      'an upper-case sourceAccount',
      { sourceAccount: 'Synthetic.Owner@example.com' },
      'sourceAccount',
    ],
    [
      'a link to another Doc',
      { url: 'https://docs.google.com/document/d/1OtherDoc000001AbCdEf/edit' },
      'url',
    ],
    [
      'a link that carries more',
      {
        url: `https://docs.google.com/document/d/${docIdentity(1).sourceId}/edit#${SECRET}`,
      },
      'url',
    ],
    [
      'an updatedAt that is not the modified time',
      { updatedAt: '2026-03-03T10:00:00Z' },
      'updatedAt',
    ],
    [
      'a created time after the modified time',
      doc({ createdAt: '2026-03-03T10:00:00Z' }),
      'document.createdAt',
    ],
  ])('refuses %s', (_l, overrides, field) => {
    const result = check(overrides);
    expect(problems(result)).toContainEqual(['SOURCE_RULE', field]);
  });

  it('refuses a Doc without the truncation flag, or with unknown fields', () => {
    const { truncated: _, ...noFlag } = documentFrontmatter(1)
      .document as Record<string, unknown>;
    expect(problems(check({ document: noFlag }))).toEqual([
      ['SCHEMA_INVALID', 'document.truncated'],
    ]);
    expect(problems(check(doc({ summary: SECRET })))).toEqual([
      ['SCHEMA_INVALID', 'document'],
    ]);
  });

  it('refuses a document record from Slack, and a message from Google Docs', () => {
    expect(problems(check({ source: 'slack' }))).toEqual([
      ['SOURCE_RULE', 'type'],
    ]);
    const message = run([
      messageFrontmatter(1, { source: 'google-docs' }),
    ]).result;
    expect(problems(message)).toEqual([['SOURCE_RULE', 'type']]);
  });

  it('writes nothing when any Doc in the batch is refused', () => {
    const { world, result } = run(
      [
        documentFrontmatter(1),
        documentFrontmatter(2, doc({ owners: ['other@example.com'] })),
      ],
      { mode: 'import' },
    );
    expect(result.ok).toBe(false);
    expect(
      existsSync(getImportedRecordFilePath(world.workLog, docIdentity(1))),
    ).toBe(false);
  });
});
