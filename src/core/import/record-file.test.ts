import { getImportedRecordSegments } from '@storage/paths';
import { getImportedRecordIdentity } from '@wc-types/imported-record';
import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';

import {
  parseImportedRecordFile,
  serializeImportedRecord,
} from './record-file';

// Synthetic values only. SECRET is planted in record content so tests can
// assert that no issue ever echoes it.
const SECRET = 'zebra-quartz-secret';

function frontmatter(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    type: 'message',
    source: 'slack',
    sourceAccount: 'T0SYNTH01',
    sourceId: 'C0SYNTH01/1700000000.000100',
    url: 'https://example.slack.com/archives/C0SYNTH01/p1700000000000100',
    occurredAt: '2026-03-02T10:00:00Z',
    updatedAt: null,
    capturedAt: '2026-03-05T09:00:00Z',
    subject: { kind: 'ic' },
    attribution: { status: 'verified', authorId: 'U0SYNTH01' },
    mentions: {
      tickets: ['PROJ-12'],
      pullRequests: ['https://github.com/acme/app/pull/7'],
    },
    message: {
      container: { id: 'C0SYNTH01', name: 'synthetic-channel' },
      thread: null,
      replyCount: 2,
      replyParticipantCount: 1,
    },
    ...overrides,
  };
}

function file(data: unknown, body = `Shipped the rollout. ${SECRET}`): Buffer {
  return Buffer.from(`---\n${stringify(data)}---\n\n${body}\n`);
}

function issuesOf(bytes: Uint8Array) {
  const parsed = parseImportedRecordFile(bytes, 'record.md');
  if (parsed.ok) throw new Error('expected the record to be rejected');
  return parsed.issues;
}

describe('parseImportedRecordFile', () => {
  it('accepts a valid message record and keeps the body verbatim', () => {
    const parsed = parseImportedRecordFile(
      file(frontmatter(), 'line 1\n\n  line 3'),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.body).toBe('line 1\n\n  line 3');
    expect(parsed.record.sourceId).toBe('C0SYNTH01/1700000000.000100');
  });

  it('round-trips through the stored form byte for byte', () => {
    const parsed = parseImportedRecordFile(file(frontmatter()));
    if (!parsed.ok) throw new Error('fixture must be valid');
    const stored = serializeImportedRecord(parsed.record, parsed.body);
    const reparsed = parseImportedRecordFile(stored);
    if (!reparsed.ok) throw new Error('stored form must parse');
    expect(reparsed.record).toEqual(parsed.record);
    expect(reparsed.body).toBe(parsed.body);
    expect(serializeImportedRecord(reparsed.record, reparsed.body)).toEqual(
      stored,
    );
  });

  it('rejects malformed YAML by code and position without echoing it', () => {
    const bytes = Buffer.from(
      `---\nsecret: "${SECRET}"\nbad: [\n---\n\nbody\n`,
    );
    const issues = issuesOf(bytes);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: 'YAML_INVALID',
      file: 'record.md',
    });
    expect(issues[0]?.line).toBeGreaterThan(1);
    expect(JSON.stringify(issues)).not.toContain(SECRET);
  });

  it.each([
    ['duplicate keys', `type: message\ntype: message\n`],
    ['aliases', `a: &x "${SECRET}"\nb: *x\n`],
    ['explicit tags', `a: !!binary aGk=\n`],
    ['unknown tags', `a: !custom "${SECRET}"\n`],
    ['several documents', `a: 1\n...\nb: 2\n`],
  ])('rejects %s', (_label, yaml) => {
    const issues = issuesOf(Buffer.from(`---\n${yaml}---\nbody\n`));
    expect(issues.map((i) => i.code)).toEqual(['YAML_INVALID']);
    expect(JSON.stringify(issues)).not.toContain(SECRET);
  });

  it('rejects a file without frontmatter delimiters', () => {
    expect(issuesOf(Buffer.from(`# ${SECRET}\n`))[0]?.code).toBe(
      'FRONTMATTER_MISSING',
    );
    expect(issuesOf(Buffer.from(`---\ntype: message\n`))[0]?.code).toBe(
      'FRONTMATTER_MISSING',
    );
  });

  it('rejects bytes that are not UTF-8', () => {
    const bytes = Buffer.concat([file(frontmatter()), Buffer.from([0xff])]);
    expect(issuesOf(bytes)[0]?.code).toBe('INVALID_ENCODING');
  });

  it('reports schema violations by field without echoing values', () => {
    const issues = issuesOf(
      file({
        ...frontmatter({
          source: SECRET,
          occurredAt: SECRET,
          attribution: { status: 'verified', authorId: null },
          subject: { kind: 'report', reportId: `../${SECRET}` },
          url: `ftp://example.com/${SECRET}`,
        }),
        participants: ['someone'],
      }),
    );
    expect(issues.every((i) => i.code === 'SCHEMA_INVALID')).toBe(true);
    expect(issues.map((i) => i.field).sort()).toEqual([
      '(frontmatter)',
      'attribution.authorId',
      'occurredAt',
      'source',
      'subject.reportId',
      'url',
    ]);
    // The unknown key is named so the skill can fix it
    expect(issues.find((i) => i.field === '(frontmatter)')?.message).toContain(
      'participants',
    );
    expect(JSON.stringify(issues)).not.toContain(SECRET);
  });

  it('does not print an unknown key that is not a plain name', () => {
    const issues = issuesOf(
      file({ ...frontmatter(), [`${SECRET} said hi`]: 1 }),
    );
    expect(JSON.stringify(issues)).not.toContain(SECRET);
  });

  it('rejects an edit or capture that precedes the event', () => {
    const issues = issuesOf(
      file(
        frontmatter({
          updatedAt: '2026-03-01T00:00:00Z',
          capturedAt: '2026-03-01T00:00:00Z',
        }),
      ),
    );
    expect(issues.map((i) => i.field).sort()).toEqual([
      'capturedAt',
      'updatedAt',
    ]);
  });

  it('accepts an honest unverified attribution without an author', () => {
    const parsed = parseImportedRecordFile(
      file(frontmatter({ attribution: { status: 'unverified' } })),
    );
    expect(parsed.ok).toBe(true);
  });
});

describe('getImportedRecordSegments', () => {
  const identity = (sourceId: string, sourceAccount = 'T0SYNTH01') =>
    ({ type: 'message', source: 'slack', sourceAccount, sourceId }) as const;

  it('stores a record under its type and source with a hashed file name', () => {
    const parsed = parseImportedRecordFile(file(frontmatter()));
    if (!parsed.ok) throw new Error('fixture must be valid');
    const segments = getImportedRecordSegments(
      getImportedRecordIdentity(parsed.record),
    );
    expect(segments.slice(0, 2)).toEqual(['messages', 'slack']);
    expect(segments[2]).toMatch(/^[0-9a-f]{32}\.md$/);
  });

  it.each([
    '../../outside',
    '/etc/passwd',
    '..\\..\\outside',
    'C0SYNTH01/../../x',
  ])('never uses source ID text in the path (%s)', (sourceId) => {
    const segments = getImportedRecordSegments(identity(sourceId));
    expect(segments).toHaveLength(3);
    expect(segments[2]).toMatch(/^[0-9a-f]{32}\.md$/);
  });

  it('gives identities that differ only by case different files', () => {
    const upper = getImportedRecordSegments(identity('C0SYNTH01/1.1', 'TABC'));
    const lower = getImportedRecordSegments(identity('C0SYNTH01/1.1', 'Tabc'));
    expect(upper[2]?.toLowerCase()).not.toBe(lower[2]?.toLowerCase());
  });
});
