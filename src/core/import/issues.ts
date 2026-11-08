import { errorCode } from './import-fs';

/**
 * Machine-readable problems reported by `import` and `validate`.
 *
 * An issue never carries record content: only a code, the staging file name,
 * a field path, a position, and a fixed message written by this module.
 */
export const IMPORT_ISSUE_CODES = [
  // Target and work log
  'TARGET_INVALID',
  'REPORT_NOT_FOUND',
  'WORK_LOG_NOT_FOUND',
  'RANGE_INVALID',
  // Staging directory and files
  'STAGING_NOT_FOUND',
  'STAGING_UNREADABLE',
  'UNEXPECTED_ENTRY',
  'BATCH_TOO_LARGE',
  'FILE_TOO_LARGE',
  'READ_FAILED',
  'FILE_CHANGED',
  // Record contents
  'INVALID_ENCODING',
  'FRONTMATTER_MISSING',
  'YAML_INVALID',
  'SCHEMA_INVALID',
  'SOURCE_RULE',
  'SUBJECT_MISMATCH',
  'DUPLICATE_IDENTITY',
  // Destination
  'UNSAFE_DESTINATION',
  'IDENTITY_CONFLICT',
  'DESTINATION_COLLISION',
  // Transaction
  'IMPORT_IN_PROGRESS',
  'RECOVERY_REQUIRED',
  'RECOVERY_CONFLICT',
  'CHANGED_DURING_IMPORT',
  'COMMIT_FAILED',
  'ROLLBACK_INCOMPLETE',
] as const;
export type ImportIssueCode = (typeof IMPORT_ISSUE_CODES)[number];

/**
 * One problem with a batch. Any issue rejects the whole batch.
 */
export interface ImportIssue {
  code: ImportIssueCode;
  /** Fixed explanation; never contains record content */
  message: string;
  /** Staging file name the issue belongs to */
  file?: string;
  /** Frontmatter field path, such as `attribution.status` */
  field?: string;
  /** 1-based position in the file, for YAML errors */
  line?: number;
  column?: number;
  /** Destination path relative to the work log */
  destination?: string;
}

/**
 * Build an issue.
 *
 * @param code - Issue code
 * @param message - Fixed explanation (no record content)
 * @param details - File, field, position or destination
 */
export function importIssue(
  code: ImportIssueCode,
  message: string,
  details: Omit<ImportIssue, 'code' | 'message'> = {},
): ImportIssue {
  return { code, message, ...details };
}

/**
 * Describe a filesystem error by its code only (never its message, which can
 * include paths chosen by a record or text from a file).
 *
 * @param error - Any caught value
 */
export function describeFsError(error: unknown): string {
  return errorCode(error) ?? 'unknown error';
}
