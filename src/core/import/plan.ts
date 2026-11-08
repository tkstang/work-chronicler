import { createHash } from 'node:crypto';
import { join } from 'node:path';

import { getImportedRecordSegments } from '@storage/paths';
import {
  getImportedRecordIdentity,
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
import { parseImportedRecordFile } from './record-file';
import { MAX_STORED_BYTES, type StagedRecord } from './staging';

/** A filesystem object's identity (device and inode) */
export interface FileId {
  dev: bigint;
  ino: bigint;
}

/** A stored record the import would replace or keep */
export interface ExistingRecord extends FileId {
  hash: string;
  content: Buffer;
}

export type PlannedAction = 'create' | 'update' | 'unchanged';

/** What import will do with one staged record */
export interface PlannedRecord {
  file: string;
  /** Destination under the work log, as path segments */
  segments: string[];
  action: PlannedAction;
  /** The stored form to write */
  content: Buffer;
  hash: string;
  existing: ExistingRecord | null;
}

/** A directory below the work log that a destination needs */
export interface PlannedDirectory {
  segments: string[];
  /** Identity when it already exists; null when import must create it */
  existing: FileId | null;
}

/**
 * Everything import verified before writing: the work log (by real path and
 * identity), every directory below it on the way to a destination, and the
 * state of every destination file.
 */
export interface ImportPlan {
  root: string;
  rootId: FileId;
  directories: PlannedDirectory[];
  records: PlannedRecord[];
}

/**
 * SHA-256 of some bytes, as hex.
 *
 * @param data - Bytes to hash
 */
export function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** Destination path relative to the work log, for messages */
export function displayPath(segments: string[]): string {
  return segments.join('/');
}

/**
 * Resolve the work log. Its own path (from config) is trusted, so it is
 * resolved through any symlinked ancestors once; everything below it must
 * then be real directories and files.
 *
 * @param workLogRoot - Work-log directory from config
 * @param fs - Filesystem
 */
export function resolveWorkLogRoot(
  workLogRoot: string,
  fs: ImportFs,
): { root: string; rootId: FileId } | { issue: ImportIssue } {
  try {
    const root = fs.realpath(workLogRoot);
    const entry = fs.lstat(root);
    if (entry.kind !== 'directory') {
      return {
        issue: importIssue('WORK_LOG_NOT_FOUND', 'work log is not a directory'),
      };
    }
    return { root, rootId: { dev: entry.dev, ino: entry.ino } };
  } catch (error) {
    const code = errorCode(error);
    return {
      issue:
        code === 'ENOENT'
          ? importIssue(
              'WORK_LOG_NOT_FOUND',
              'work log directory does not exist; run init or fetch first',
            )
          : importIssue(
              'UNSAFE_DESTINATION',
              `work log could not be checked (${describeFsError(error)})`,
            ),
    };
  }
}

function sameSubject(a: ImportSubject, b: ImportSubject): boolean {
  if (a.kind === 'ic' || b.kind === 'ic') return a.kind === b.kind;
  return a.reportId === b.reportId;
}

/**
 * Check a directory below the work log: absent (only a proven ENOENT), or a
 * real directory. A symlink, a file, or any other error means the
 * destination cannot be established.
 */
function checkDirectory(
  root: string,
  segments: string[],
  fs: ImportFs,
): { existing: FileId | null } | { issue: ImportIssue } {
  const destination = displayPath(segments);
  try {
    const entry = fs.lstat(join(root, ...segments));
    if (entry.kind === 'directory') {
      return { existing: { dev: entry.dev, ino: entry.ino } };
    }
    return {
      issue: importIssue(
        'UNSAFE_DESTINATION',
        entry.kind === 'symlink'
          ? 'a directory on the way to the destination is a symlink'
          : 'a directory on the way to the destination is not a directory',
        { destination },
      ),
    };
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return { existing: null };
    return {
      issue: importIssue(
        'UNSAFE_DESTINATION',
        `a directory on the way to the destination could not be checked (${describeFsError(error)})`,
        { destination },
      ),
    };
  }
}

/**
 * Check one destination file and decide the action.
 */
function checkDestination(
  root: string,
  staged: StagedRecord,
  segments: string[],
  target: ImportSubject,
  fs: ImportFs,
): { existing: ExistingRecord | null } | { issue: ImportIssue } {
  const where = { file: staged.file, destination: displayPath(segments) };
  const path = join(root, ...segments);
  let entry;
  try {
    entry = fs.lstat(path);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return { existing: null };
    return {
      issue: importIssue(
        'UNSAFE_DESTINATION',
        `destination could not be checked (${describeFsError(error)})`,
        where,
      ),
    };
  }
  if (entry.kind !== 'file') {
    return {
      issue: importIssue(
        'UNSAFE_DESTINATION',
        `destination is a ${entry.kind}, not a record file`,
        where,
      ),
    };
  }

  let read;
  try {
    read = fs.readFile(path, MAX_STORED_BYTES);
  } catch (error) {
    const code = errorCode(error);
    return {
      issue:
        code === 'EFBIG'
          ? importIssue(
              'IDENTITY_CONFLICT',
              'the stored file is too large to be a record',
              where,
            )
          : importIssue(
              'UNSAFE_DESTINATION',
              `stored record could not be read (${describeFsError(error)})`,
              where,
            ),
    };
  }
  if (read.dev !== entry.dev || read.ino !== entry.ino) {
    return {
      issue: importIssue(
        'UNSAFE_DESTINATION',
        'destination changed while it was being checked',
        where,
      ),
    };
  }

  const stored = parseImportedRecordFile(read.data);
  if (!stored.ok) {
    return {
      issue: importIssue(
        'IDENTITY_CONFLICT',
        'the stored file at the destination is not a valid record, so it is not replaced',
        where,
      ),
    };
  }
  const storedKey = importedRecordIdentityKey(
    getImportedRecordIdentity(stored.record),
  );
  const stagedKey = importedRecordIdentityKey(
    getImportedRecordIdentity(staged.record),
  );
  if (storedKey !== stagedKey) {
    return {
      issue: importIssue(
        'IDENTITY_CONFLICT',
        'the stored record at the destination has a different identity',
        where,
      ),
    };
  }
  if (!sameSubject(stored.record.subject, target)) {
    return {
      issue: importIssue(
        'IDENTITY_CONFLICT',
        'the stored record at the destination is about a different subject',
        where,
      ),
    };
  }
  return {
    existing: {
      dev: read.dev,
      ino: read.ino,
      hash: sha256(read.data),
      content: read.data,
    },
  };
}

/**
 * Work out where every staged record goes and what that does, without
 * writing anything. Any destination that cannot be shown safe rejects the
 * batch.
 *
 * @param workLogRoot - Work-log directory from config
 * @param records - Records that passed the batch checks
 * @param target - The IC or report being imported for
 * @param fs - Filesystem
 * @returns The plan, or the issues that reject the batch
 */
export function planImport(
  workLogRoot: string,
  records: StagedRecord[],
  target: ImportSubject,
  fs: ImportFs,
): { plan: ImportPlan | null; issues: ImportIssue[] } {
  const resolved = resolveWorkLogRoot(workLogRoot, fs);
  if ('issue' in resolved) return { plan: null, issues: [resolved.issue] };
  const { root, rootId } = resolved;

  const issues: ImportIssue[] = [];
  const destinations = records.map((staged) =>
    getImportedRecordSegments(getImportedRecordIdentity(staged.record)),
  );

  // Directories on the way to each destination, shallowest first
  const directoryKeys = new Map<string, string[]>();
  for (const segments of destinations) {
    for (let depth = 1; depth < segments.length; depth++) {
      const dir = segments.slice(0, depth);
      directoryKeys.set(displayPath(dir), dir);
    }
  }
  const directories: PlannedDirectory[] = [];
  const directoryState = new Map<string, FileId | null | 'unsafe'>();
  for (const dir of [...directoryKeys.values()].sort(
    (a, b) => a.length - b.length,
  )) {
    const parent = directoryState.get(displayPath(dir.slice(0, -1)));
    if (parent === 'unsafe') {
      directoryState.set(displayPath(dir), 'unsafe');
      continue;
    }
    if (parent === null) {
      directoryState.set(displayPath(dir), null);
      directories.push({ segments: dir, existing: null });
      continue;
    }
    const checked = checkDirectory(root, dir, fs);
    if ('issue' in checked) {
      issues.push(checked.issue);
      directoryState.set(displayPath(dir), 'unsafe');
      continue;
    }
    directoryState.set(displayPath(dir), checked.existing);
    directories.push({ segments: dir, existing: checked.existing });
  }

  const planned: PlannedRecord[] = [];
  records.forEach((staged, index) => {
    const segments = destinations[index] ?? [];
    const parent = directoryState.get(displayPath(segments.slice(0, -1)));
    if (parent === 'unsafe') return;
    const hash = sha256(staged.content);
    if (parent === null) {
      planned.push({
        file: staged.file,
        segments,
        action: 'create',
        content: staged.content,
        hash,
        existing: null,
      });
      return;
    }
    const checked = checkDestination(root, staged, segments, target, fs);
    if ('issue' in checked) {
      issues.push(checked.issue);
      return;
    }
    const existing = checked.existing;
    planned.push({
      file: staged.file,
      segments,
      action:
        existing === null
          ? 'create'
          : existing.hash === hash
            ? 'unchanged'
            : 'update',
      content: staged.content,
      hash,
      existing,
    });
  });

  if (issues.length > 0) return { plan: null, issues };
  return {
    plan: { root, rootId, directories, records: planned },
    issues: [],
  };
}
