import { join } from 'node:path';

import { getImportedRecordSegments } from '@storage/paths';
import {
  getImportedRecordIdentity,
  type ImportedRecord,
  importedRecordIdentityKey,
  type ImportSubject,
} from '@wc-types/imported-record';

import type { ImportFs } from './import-fs';
import {
  describeFsError,
  errorCode,
  type ImportIssue,
  importIssue,
} from './issues';
import {
  parseImportedRecordFile,
  serializeImportedRecord,
} from './record-file';
import { checkSourceRules } from './sources';

/** Most records one batch may hold; skills split larger imports */
export const MAX_BATCH_RECORDS = 10_000;
/** Largest staged record file */
export const MAX_RECORD_BYTES = 1024 * 1024;

/**
 * A staged record that parsed and passed the schema. `content` is the stored
 * form the CLI writes: re-serialized from the validated record, never the
 * staged bytes.
 */
export interface StagedRecord {
  file: string;
  record: ImportedRecord;
  body: string;
  content: Buffer;
}

/**
 * Read every record in a staging directory.
 *
 * The staging directory holds only regular `*.md` files (no subdirectories,
 * symlinks, hidden or other files). Each file is opened without following
 * symlinks and must be the same file that was listed; its contents are kept
 * in memory, so nothing changed in the staging directory after this point
 * can affect what is imported. File names are never split or interpreted:
 * a name with backslashes is one ordinary name on POSIX.
 *
 * @param stagingDir - Directory a skill wrote the batch to
 * @param fs - Filesystem
 * @returns Parsed records and every problem found
 */
export function readStagingBatch(
  stagingDir: string,
  fs: ImportFs,
): { records: StagedRecord[]; issues: ImportIssue[] } {
  let dir: string;
  let names: string[];
  try {
    dir = fs.realpath(stagingDir);
    if (fs.lstat(dir).kind !== 'directory') {
      return {
        records: [],
        issues: [
          importIssue('STAGING_NOT_FOUND', 'staging path is not a directory'),
        ],
      };
    }
    names = fs.readdir(dir).sort();
  } catch (error) {
    const code = errorCode(error);
    return {
      records: [],
      issues: [
        code === 'ENOENT' || code === 'ENOTDIR'
          ? importIssue('STAGING_NOT_FOUND', 'staging directory not found')
          : importIssue(
              'STAGING_UNREADABLE',
              `staging directory could not be read (${describeFsError(error)})`,
            ),
      ],
    };
  }

  if (names.length > MAX_BATCH_RECORDS) {
    return {
      records: [],
      issues: [
        importIssue(
          'BATCH_TOO_LARGE',
          `a batch holds at most ${MAX_BATCH_RECORDS} records; split it`,
        ),
      ],
    };
  }

  const records: StagedRecord[] = [];
  const issues: ImportIssue[] = [];
  for (const file of names) {
    if (file.startsWith('.') || !file.endsWith('.md')) {
      issues.push(
        importIssue(
          'UNEXPECTED_ENTRY',
          'staging may contain only record files named *.md',
          { file },
        ),
      );
      continue;
    }
    const path = join(dir, file);
    let data: Buffer;
    try {
      const entry = fs.lstat(path);
      if (entry.kind !== 'file') {
        issues.push(
          importIssue(
            'UNEXPECTED_ENTRY',
            `staging may contain only regular files (found a ${entry.kind})`,
            { file },
          ),
        );
        continue;
      }
      if (entry.size > BigInt(MAX_RECORD_BYTES)) {
        issues.push(
          importIssue(
            'FILE_TOO_LARGE',
            `a record file holds at most ${MAX_RECORD_BYTES} bytes`,
            { file },
          ),
        );
        continue;
      }
      const read = fs.readFile(path, MAX_RECORD_BYTES);
      if (read.dev !== entry.dev || read.ino !== entry.ino) {
        issues.push(
          importIssue(
            'FILE_CHANGED',
            'file was replaced while the batch was being read',
            { file },
          ),
        );
        continue;
      }
      data = read.data;
    } catch (error) {
      const code = errorCode(error);
      issues.push(
        code === 'EFBIG'
          ? importIssue(
              'FILE_TOO_LARGE',
              `a record file holds at most ${MAX_RECORD_BYTES} bytes`,
              { file },
            )
          : code === 'ELOOP' || code === 'ENOTREG'
            ? importIssue(
                'FILE_CHANGED',
                'file was replaced while the batch was being read',
                { file },
              )
            : importIssue(
                'READ_FAILED',
                `file could not be read (${describeFsError(error)})`,
                { file },
              ),
      );
      continue;
    }

    const parsed = parseImportedRecordFile(data, file);
    if (!parsed.ok) {
      issues.push(...parsed.issues);
      continue;
    }
    records.push({
      file,
      record: parsed.record,
      body: parsed.body,
      content: serializeImportedRecord(parsed.record, parsed.body),
    });
  }
  return { records, issues };
}

function sameSubject(a: ImportSubject, b: ImportSubject): boolean {
  if (a.kind === 'ic' || b.kind === 'ic') return a.kind === b.kind;
  return a.reportId === b.reportId;
}

/**
 * Check a batch as a whole: source rules, that every record is about the
 * import target, and that no two records share an identity or a
 * destination (compared case-insensitively, as some volumes do).
 *
 * @param records - Parsed records
 * @param target - The IC or report being imported for
 * @returns Problems; empty when the batch is acceptable
 */
export function checkStagedBatch(
  records: StagedRecord[],
  target: ImportSubject,
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const identities = new Set<string>();
  const destinations = new Set<string>();
  for (const { file, record } of records) {
    for (const problem of checkSourceRules(record, { target })) {
      issues.push(
        importIssue('SOURCE_RULE', problem.message, {
          file,
          field: problem.field,
        }),
      );
    }
    if (!sameSubject(record.subject, target)) {
      issues.push(
        importIssue(
          'SUBJECT_MISMATCH',
          target.kind === 'ic'
            ? 'record is not about the IC this work log belongs to'
            : 'record is not about the report being imported for',
          { file, field: 'subject' },
        ),
      );
    }
    const identity = getImportedRecordIdentity(record);
    const key = importedRecordIdentityKey(identity);
    if (identities.has(key)) {
      issues.push(
        importIssue(
          'DUPLICATE_IDENTITY',
          'another record in the batch has the same identity',
          { file },
        ),
      );
      continue;
    }
    identities.add(key);
    const destination = getImportedRecordSegments(identity)
      .join('/')
      .toLowerCase();
    if (destinations.has(destination)) {
      issues.push(
        importIssue(
          'DESTINATION_COLLISION',
          'another record in the batch maps to the same file',
          { file },
        ),
      );
      continue;
    }
    destinations.add(destination);
  }
  return issues;
}
