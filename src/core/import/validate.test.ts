import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { getImportedRecordFilePath } from '@storage/paths';
import { afterEach, describe, expect, it } from 'vitest';

import { createImportEnv } from './import-fs';
import {
  caseInsensitiveTmp,
  fsError,
  hookedFs,
  makeWorld,
  messageFrontmatter,
  recordFile,
  SECRET,
  snapshot,
  stage,
} from './import.test-support';
import { type ImportRunOptions, runImport } from './index';
import {
  parseImportedRecordFile,
  serializeImportedRecord,
} from './record-file';

// Threat-matrix coverage for the read-only half of import: staging reads,
// batch checks and destination planning. `validate` must reject every unsafe
// or ambiguous batch and must never write.

const worlds: string[] = [];
afterEach(() => {
  for (const base of worlds.splice(0)) {
    rmSync(base, { recursive: true, force: true });
  }
});

function world() {
  const w = makeWorld();
  worlds.push(w.base);
  return w;
}

function validate(
  options: Partial<ImportRunOptions> & {
    stagingDir: string;
    workLogRoot: string;
  },
) {
  return runImport({ mode: 'validate', target: { kind: 'ic' }, ...options });
}

const slackIdentity = (n: number) =>
  ({
    type: 'message',
    source: 'slack',
    sourceAccount: 'T0SYNTH01',
    sourceId: `C0SYNTH01/1700000000.${String(n).padStart(6, '0')}`,
  }) as const;

/** Store a record in the work log as an earlier import would have */
function storeRecord(workLog: string, n: number, body = 'Stored earlier.') {
  const parsed = parseImportedRecordFile(
    Buffer.from(recordFile(messageFrontmatter(n), body)),
  );
  if (!parsed.ok) throw new Error('fixture must be valid');
  const path = getImportedRecordFilePath(workLog, slackIdentity(n));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeImportedRecord(parsed.record, parsed.body));
  return path;
}

function codes(result: { issues: { code: string }[] }) {
  return result.issues.map((i) => i.code);
}

describe('validate: a valid batch', () => {
  it('plans a create per new record and writes nothing', () => {
    const w = world();
    stage(w.staging, 'a.md', messageFrontmatter(1));
    stage(w.staging, 'b.md', messageFrontmatter(2));
    const before = snapshot(w.base);

    const result = validate({ stagingDir: w.staging, workLogRoot: w.workLog });

    expect(result.ok).toBe(true);
    expect(result.summary).toEqual({
      records: 2,
      created: 2,
      updated: 0,
      unchanged: 0,
    });
    expect(snapshot(w.base)).toEqual(before);
  });

  it('plans unchanged for an identical stored record and update for a changed one', () => {
    const w = world();
    storeRecord(w.workLog, 1, 'Same body.');
    storeRecord(w.workLog, 2, 'Old body.');
    stage(w.staging, 'a.md', messageFrontmatter(1), 'Same body.');
    stage(w.staging, 'b.md', messageFrontmatter(2), 'New body.');

    const result = validate({ stagingDir: w.staging, workLogRoot: w.workLog });

    expect(result.ok).toBe(true);
    expect(result.records).toEqual([
      { file: 'a.md', action: 'unchanged' },
      { file: 'b.md', action: 'update' },
    ]);
  });

  it('accepts staging and work-log paths reached through symlinked ancestors', () => {
    // The caller names these paths (macOS temp paths go through /var ->
    // /private/var); only entries below them must be real.
    const w = world();
    stage(w.staging, 'a.md');
    symlinkSync(w.staging, join(w.base, 'staging-link'));
    symlinkSync(w.workLog, join(w.base, 'work-log-link'));

    const result = validate({
      stagingDir: join(w.base, 'staging-link'),
      workLogRoot: join(w.base, 'work-log-link'),
    });

    expect(result.ok).toBe(true);
  });

  it('accepts an empty batch', () => {
    const w = world();
    const result = validate({ stagingDir: w.staging, workLogRoot: w.workLog });
    expect(result.ok).toBe(true);
    expect(result.summary.records).toBe(0);
  });
});

describe('validate: staging directory threats', () => {
  it('rejects a symlinked staging file even when it points at a valid record', () => {
    const w = world();
    stage(w.outside, 'real.md');
    symlinkSync(join(w.outside, 'real.md'), join(w.staging, 'a.md'));

    const result = validate({ stagingDir: w.staging, workLogRoot: w.workLog });

    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({
      code: 'UNEXPECTED_ENTRY',
      file: 'a.md',
    });
  });

  it.each([
    [
      'a subdirectory',
      (dir: string) => mkdirSync(join(dir, 'nested.md')),
      'directory',
    ],
    [
      'a symlinked subdirectory',
      (dir: string, outside: string) =>
        symlinkSync(outside, join(dir, 'nested.md')),
      'symlink',
    ],
    [
      'a non-markdown file',
      (dir: string) => writeFileSync(join(dir, 'a.txt'), ''),
      '*.md',
    ],
    [
      'a hidden file',
      (dir: string) => writeFileSync(join(dir, '.a.md'), ''),
      '*.md',
    ],
  ])('rejects %s', (_label, make, reason) => {
    const w = world();
    stage(w.staging, 'ok.md');
    make(w.staging, w.outside);

    const result = validate({ stagingDir: w.staging, workLogRoot: w.workLog });

    expect(codes(result)).toEqual(['UNEXPECTED_ENTRY']);
    expect(result.issues[0]?.message).toContain(reason);
  });

  it.skipIf(process.platform === 'win32')(
    'reads a POSIX name with backslashes as one ordinary file',
    () => {
      const w = world();
      stage(w.staging, 'a\\..\\..\\outside\\escape.md');

      const result = validate({
        stagingDir: w.staging,
        workLogRoot: w.workLog,
      });

      expect(result.ok).toBe(true);
      expect(result.records).toEqual([
        { file: 'a\\..\\..\\outside\\escape.md', action: 'create' },
      ]);
    },
  );

  it('rejects a missing staging directory', () => {
    const w = world();
    const result = validate({
      stagingDir: join(w.base, 'missing'),
      workLogRoot: w.workLog,
    });
    expect(codes(result)).toEqual(['STAGING_NOT_FOUND']);
  });

  it('rejects a file over the size limit before parsing it', () => {
    const w = world();
    writeFileSync(join(w.staging, 'big.md'), Buffer.alloc(1024 * 1024 + 1));
    const result = validate({ stagingDir: w.staging, workLogRoot: w.workLog });
    expect(codes(result)).toEqual(['FILE_TOO_LARGE']);
  });

  it('rejects a batch over the record limit', () => {
    const w = world();
    for (let i = 0; i <= 10_000; i++) {
      writeFileSync(join(w.staging, `${i}.md`), '');
    }
    const result = validate({ stagingDir: w.staging, workLogRoot: w.workLog });
    expect(codes(result)).toEqual(['BATCH_TOO_LARGE']);
  });

  it('rejects a staging file replaced between listing and reading', () => {
    const w = world();
    stage(w.staging, 'a.md');
    const env = createImportEnv();
    env.fs = hookedFs(env.fs, (op, args) => {
      if (op === 'readFile' && args[0] === join(w.staging, 'a.md')) {
        // Write the replacement first so it cannot reuse the old inode
        stage(w.staging, 'replacement.tmp', messageFrontmatter(9));
        renameSync(join(w.staging, 'replacement.tmp'), join(w.staging, 'a.md'));
      }
    });

    const result = validate({
      stagingDir: w.staging,
      workLogRoot: w.workLog,
      env,
    });

    expect(codes(result)).toEqual(['FILE_CHANGED']);
  });

  it.each([
    ['listing the staging directory', 'readdir', 'STAGING_UNREADABLE'],
    ['reading a staged file', 'readFile', 'READ_FAILED'],
  ] as const)(
    'rejects the batch when %s fails (injected, so it also runs as root)',
    (_label, failingOp, code) => {
      const w = world();
      stage(w.staging, 'a.md');
      const env = createImportEnv();
      env.fs = hookedFs(env.fs, (op, args) => {
        if (op === failingOp && String(args[0]).startsWith(w.staging)) {
          throw fsError('EACCES');
        }
      });

      const result = validate({
        stagingDir: w.staging,
        workLogRoot: w.workLog,
        env,
      });

      expect(codes(result)).toEqual([code]);
      expect(result.issues[0]?.message).toContain('EACCES');
    },
  );

  it.skipIf(process.getuid?.() === 0 || process.platform === 'win32')(
    'rejects an unreadable staged file (real permissions)',
    () => {
      const w = world();
      stage(w.staging, 'a.md');
      chmodSync(join(w.staging, 'a.md'), 0o000);
      try {
        const result = validate({
          stagingDir: w.staging,
          workLogRoot: w.workLog,
        });
        expect(codes(result)).toEqual(['READ_FAILED']);
      } finally {
        chmodSync(join(w.staging, 'a.md'), 0o644);
      }
    },
  );
});

describe('validate: record and batch checks', () => {
  it('rejects the whole batch when one record is malformed, without echoing it', () => {
    const w = world();
    stage(w.staging, 'good.md', messageFrontmatter(1));
    writeFileSync(
      join(w.staging, 'bad.md'),
      `---\nx: "${SECRET}"\ny: [\n---\n`,
    );
    stage(w.staging, 'schema.md', messageFrontmatter(3, { source: SECRET }));

    const result = validate({ stagingDir: w.staging, workLogRoot: w.workLog });

    expect(result.ok).toBe(false);
    expect(result.issues.map((i) => [i.file, i.code])).toEqual([
      ['bad.md', 'YAML_INVALID'],
      ['schema.md', 'SCHEMA_INVALID'],
    ]);
    expect(JSON.stringify(result)).not.toContain(SECRET);
  });

  it('rejects two records with the same identity', () => {
    const w = world();
    stage(w.staging, 'a.md', messageFrontmatter(1));
    stage(w.staging, 'b.md', messageFrontmatter(1), 'Different body.');

    const result = validate({ stagingDir: w.staging, workLogRoot: w.workLog });

    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'DUPLICATE_IDENTITY', file: 'b.md' }),
    ]);
  });

  it('rejects a Slack identity in the wrong format', () => {
    const w = world();
    stage(
      w.staging,
      'a.md',
      messageFrontmatter(1, { sourceId: 'C0OTHER01/1700000000.000001' }),
    );
    const result = validate({ stagingDir: w.staging, workLogRoot: w.workLog });
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: 'SOURCE_RULE',
        field: 'message.container.id',
      }),
    ]);
  });

  it.each([
    [
      'a report record into an IC work log',
      { kind: 'ic' },
      { kind: 'report', reportId: 'alice-smith' },
    ],
    [
      'an IC record into a report work log',
      { kind: 'report', reportId: 'alice-smith' },
      { kind: 'ic' },
    ],
    [
      "another report's record",
      { kind: 'report', reportId: 'alice-smith' },
      { kind: 'report', reportId: 'bob-jones' },
    ],
  ] as const)('rejects %s', (_label, target, subject) => {
    const w = world();
    stage(w.staging, 'a.md', messageFrontmatter(1, { subject }));

    const result = validate({
      stagingDir: w.staging,
      workLogRoot: w.workLog,
      target,
    });

    expect(codes(result)).toEqual(['SUBJECT_MISMATCH']);
  });
});

describe('validate: destination threats', () => {
  it('rejects a work log that does not exist', () => {
    const w = world();
    stage(w.staging, 'a.md');
    const result = validate({
      stagingDir: w.staging,
      workLogRoot: join(w.base, 'missing'),
    });
    expect(codes(result)).toEqual(['WORK_LOG_NOT_FOUND']);
  });

  it.each([
    [
      'messages/',
      (w: ReturnType<typeof world>) =>
        symlinkSync(w.outside, join(w.workLog, 'messages')),
    ],
    [
      'messages/slack/',
      (w: ReturnType<typeof world>) => {
        mkdirSync(join(w.workLog, 'messages'));
        symlinkSync(w.outside, join(w.workLog, 'messages', 'slack'));
      },
    ],
  ])('rejects a symlinked ancestor (%s) below the work log', (_label, make) => {
    const w = world();
    stage(w.staging, 'a.md');
    make(w);

    const result = validate({ stagingDir: w.staging, workLogRoot: w.workLog });

    expect(codes(result)).toEqual(['UNSAFE_DESTINATION']);
  });

  it('rejects a destination that is a symlink, even to a matching record', () => {
    const w = world();
    const real = storeRecord(w.outside, 1);
    const dest = getImportedRecordFilePath(w.workLog, slackIdentity(1));
    mkdirSync(dirname(dest), { recursive: true });
    symlinkSync(real, dest);
    stage(w.staging, 'a.md', messageFrontmatter(1));

    const result = validate({ stagingDir: w.staging, workLogRoot: w.workLog });

    expect(result.issues).toEqual([
      expect.objectContaining({ code: 'UNSAFE_DESTINATION', file: 'a.md' }),
    ]);
  });

  it('rejects a destination that is a directory, and an ancestor that is a file', () => {
    const w = world();
    const dest = getImportedRecordFilePath(w.workLog, slackIdentity(1));
    mkdirSync(dest, { recursive: true });
    stage(w.staging, 'a.md', messageFrontmatter(1));
    expect(
      codes(validate({ stagingDir: w.staging, workLogRoot: w.workLog })),
    ).toEqual(['UNSAFE_DESTINATION']);

    const w2 = world();
    writeFileSync(join(w2.workLog, 'messages'), '');
    stage(w2.staging, 'a.md');
    expect(
      codes(validate({ stagingDir: w2.staging, workLogRoot: w2.workLog })),
    ).toEqual(['UNSAFE_DESTINATION']);
  });

  it('rejects a stored file at the destination with a different identity', () => {
    const w = world();
    const dest = getImportedRecordFilePath(w.workLog, slackIdentity(1));
    const other = storeRecord(w.workLog, 2);
    writeFileSync(dest, readFileSync(other));
    stage(w.staging, 'a.md', messageFrontmatter(1));

    const result = validate({ stagingDir: w.staging, workLogRoot: w.workLog });

    expect(codes(result)).toEqual(['IDENTITY_CONFLICT']);
  });

  it('rejects an unreadable or unparsable stored file at the destination', () => {
    const w = world();
    const dest = getImportedRecordFilePath(w.workLog, slackIdentity(1));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, 'not a record');
    stage(w.staging, 'a.md', messageFrontmatter(1));

    expect(
      codes(validate({ stagingDir: w.staging, workLogRoot: w.workLog })),
    ).toEqual(['IDENTITY_CONFLICT']);
  });

  it.each([
    ['checking an ancestor', 'lstat'],
    ['reading the stored record', 'readFile'],
  ] as const)(
    'rejects when %s fails with anything but "not found" (injected)',
    (_label, failingOp) => {
      const w = world();
      storeRecord(w.workLog, 1);
      stage(w.staging, 'a.md', messageFrontmatter(1), 'Changed.');
      const env = createImportEnv();
      env.fs = hookedFs(env.fs, (op, args) => {
        const path = String(args[0]);
        if (op === failingOp && path.includes(join('messages', 'slack'))) {
          throw fsError('EACCES');
        }
      });

      const result = validate({
        stagingDir: w.staging,
        workLogRoot: w.workLog,
        env,
      });

      expect(codes(result)).toEqual(['UNSAFE_DESTINATION']);
    },
  );

  it.skipIf(!caseInsensitiveTmp)(
    'treats a differently cased existing directory as the same directory',
    () => {
      const w = world();
      const stored = storeRecord(w.workLog, 1, 'Same body.');
      // messages/ -> Messages/ on a case-insensitive volume
      renameSync(join(w.workLog, 'messages'), join(w.workLog, 'Messages'));
      stage(w.staging, 'a.md', messageFrontmatter(1), 'Same body.');

      const result = validate({
        stagingDir: w.staging,
        workLogRoot: w.workLog,
      });

      expect(result.ok).toBe(true);
      expect(result.records).toEqual([{ file: 'a.md', action: 'unchanged' }]);
      expect(stored).toContain('messages');
    },
  );

  it.skipIf(!caseInsensitiveTmp)(
    'checks the identity of a differently cased stored file name',
    () => {
      const w = world();
      const dest = getImportedRecordFilePath(w.workLog, slackIdentity(1));
      const other = storeRecord(w.workLog, 2);
      renameSync(other, join(dirname(dest), basename(dest).toUpperCase()));
      stage(w.staging, 'a.md', messageFrontmatter(1));

      const result = validate({
        stagingDir: w.staging,
        workLogRoot: w.workLog,
      });

      expect(codes(result)).toEqual(['IDENTITY_CONFLICT']);
    },
  );
});
