import type { ImportSubject } from '@wc-types/imported-record';

import { createImportEnv, type ImportEnv } from './import-fs';
import type { ImportIssue } from './issues';
import { type PlannedAction, planImport } from './plan';
import { checkStagedBatch, readStagingBatch } from './staging';

export { createImportEnv, type ImportEnv, type ImportFs } from './import-fs';
export {
  IMPORT_ISSUE_CODES,
  type ImportIssue,
  type ImportIssueCode,
} from './issues';
export { MAX_BATCH_RECORDS, MAX_RECORD_BYTES } from './staging';

export interface ImportRunOptions {
  /** `validate` checks and plans without writing */
  mode: 'validate';
  /** Directory a skill wrote the batch to */
  stagingDir: string;
  /** Work log to import into (an IC's, or a report's in manager mode) */
  workLogRoot: string;
  /** Who the records must be about */
  target: ImportSubject;
  /** Filesystem and process environment (defaults to the real ones) */
  env?: ImportEnv;
}

export interface ImportRunResult {
  /** True only when every record was accepted (and, for import, stored) */
  ok: boolean;
  mode: ImportRunOptions['mode'];
  /** What happened (or would happen) to each staged file */
  records: { file: string; action: PlannedAction }[];
  summary: {
    records: number;
    created: number;
    updated: number;
    unchanged: number;
  };
  issues: ImportIssue[];
  warnings: string[];
}

function summarize(records: { action: PlannedAction }[]) {
  const count = (action: PlannedAction) =>
    records.filter((r) => r.action === action).length;
  return {
    records: records.length,
    created: count('create'),
    updated: count('update'),
    unchanged: count('unchanged'),
  };
}

function rejected(
  mode: ImportRunOptions['mode'],
  issues: ImportIssue[],
  warnings: string[] = [],
): ImportRunResult {
  return {
    ok: false,
    mode,
    records: [],
    summary: summarize([]),
    issues,
    warnings,
  };
}

/**
 * Validate a staged batch against a work log.
 *
 * Every record is read and checked, then every destination is planned; any
 * issue rejects the whole batch. Nothing is written.
 *
 * @param options - Staging directory, work log, target and mode
 * @returns The outcome, with machine-readable issues
 */
export function runImport(options: ImportRunOptions): ImportRunResult {
  const env = options.env ?? createImportEnv();
  const { mode } = options;

  const staged = readStagingBatch(options.stagingDir, env.fs);
  const issues = [
    ...staged.issues,
    ...checkStagedBatch(staged.records, options.target),
  ];
  if (issues.length > 0) return rejected(mode, issues);

  const planned = planImport(
    options.workLogRoot,
    staged.records,
    options.target,
    env.fs,
  );
  if (!planned.plan) return rejected(mode, planned.issues);

  const records = planned.plan.records.map((r) => ({
    file: r.file,
    action: r.action,
  }));
  return {
    ok: true,
    mode,
    records,
    summary: summarize(records),
    issues: [],
    warnings: [],
  };
}
