import type { ImportSubject } from '@wc-types/imported-record';

import { createImportEnv, type ImportEnv } from './import-fs';
import type { ImportIssue } from './issues';
import { importIssue } from './issues';
import { type PlannedAction, planImport, resolveWorkLogRoot } from './plan';
import {
  type AppliedRange,
  type ImportRange,
  type ImportRangeInput,
  resolveImportRange,
} from './range';
import type { ImportSourceSettings } from './sources';
import { checkStagedBatch, readStagingBatch } from './staging';
import {
  acquireImportLock,
  commitImportPlan,
  inspectImportState,
  type RecoveryReport,
  releaseImportLock,
  settleInterruptedImport,
} from './transaction';

export { createImportEnv, type ImportEnv, type ImportFs } from './import-fs';
export {
  IMPORT_ISSUE_CODES,
  type ImportIssue,
  type ImportIssueCode,
} from './issues';
export {
  MAX_BATCH_RECORDS,
  MAX_RECORD_BYTES,
  MAX_STORED_BYTES,
} from './staging';
export {
  type AppliedRange,
  type ImportRangeInput,
  parseRangeBound,
  parseUtcDay,
} from './range';
export { type ImportSourceSettings, NO_SOURCE_SETTINGS } from './sources';
export { settleInterruptedImport, type RecoveryReport } from './transaction';

export interface ImportRunOptions {
  /** `validate` checks and plans without writing; `import` also commits */
  mode: 'validate' | 'import';
  /** Directory a skill wrote the batch to */
  stagingDir: string;
  /** Work log to import into (an IC's, or a report's in manager mode) */
  workLogRoot: string;
  /** Who the records must be about */
  target: ImportSubject;
  /**
   * The target's per-source settings from its config (opt-in, identity,
   * channels). A source without settings imports nothing.
   */
  sources: ImportSourceSettings;
  /**
   * The subject's `fetch` range and any `--since` / `--until` override.
   * Documents must have been modified inside it; messages are not checked
   * against it. Without it, documents are refused.
   */
  range?: ImportRangeInput;
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
  /** An interrupted earlier import this run finished (import mode only) */
  recovery: RecoveryReport | null;
  /**
   * The range documents were checked against (applied to `document`
   * records only); null when no range was given or it could not be read
   */
  range: AppliedRange | null;
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

/**
 * Validate or import a staged batch.
 *
 * Both modes read and check every record and plan every destination; any
 * issue rejects the whole batch. `validate` stops there and writes nothing.
 * `import` then takes the work log's lock, finishes any interrupted import,
 * plans again against the current work log and commits the batch
 * atomically: afterwards the work log holds either the whole batch or none
 * of it.
 *
 * @param options - Staging directory, work log, target and mode
 * @returns The outcome, with machine-readable issues
 */
export function runImport(options: ImportRunOptions): ImportRunResult {
  const env = options.env ?? createImportEnv();
  const { mode } = options;
  const warnings: string[] = [];
  let recovery: RecoveryReport | null = null;
  let applied: AppliedRange | null = null;
  const rejected = (issues: ImportIssue[]): ImportRunResult => ({
    ok: false,
    mode,
    records: [],
    summary: summarize([]),
    issues,
    warnings,
    recovery,
    range: applied,
  });

  const staged = readStagingBatch(options.stagingDir, env.fs);
  const hasDocuments = staged.records.some(
    ({ record }) => record.type === 'document',
  );
  let range: ImportRange | null = null;
  if (options.range) {
    const resolved = resolveImportRange(options.range);
    if ('problems' in resolved) {
      // A malformed option is always refused; a configured range that
      // cannot be read matters only to a batch with documents
      const problems = resolved.problems.filter(
        (problem) => problem.from === 'option' || hasDocuments,
      );
      if (problems.length > 0) {
        return rejected(
          problems.map((problem) =>
            importIssue(
              'RANGE_INVALID',
              problem.from === 'option'
                ? `--${problem.bound} ${problem.message}`
                : `the configured fetch.${problem.bound} ${problem.message}; pass --${problem.bound} to give the range for this batch`,
            ),
          ),
        );
      }
    } else {
      range = resolved.range;
      applied = resolved.applied;
    }
  }

  const batchIssues = [
    ...staged.issues,
    ...checkStagedBatch(staged.records, {
      target: options.target,
      settings: options.sources,
      range,
    }),
  ];
  if (batchIssues.length > 0) return rejected(batchIssues);

  if (mode === 'validate') {
    const resolved = resolveWorkLogRoot(options.workLogRoot, env.fs);
    if ('issue' in resolved) return rejected([resolved.issue]);
    const pending = inspectImportState(resolved.root, env);
    const planned = planImport(
      options.workLogRoot,
      staged.records,
      options.target,
      env.fs,
    );
    const issues = [...(pending ? [pending] : []), ...planned.issues];
    if (!planned.plan || issues.length > 0) return rejected(issues);
    const records = planned.plan.records.map(({ file, action }) => ({
      file,
      action,
    }));
    return {
      ok: true,
      mode,
      records,
      summary: summarize(records),
      issues: [],
      warnings,
      recovery,
      range: applied,
    };
  }

  const resolved = resolveWorkLogRoot(options.workLogRoot, env.fs);
  if ('issue' in resolved) return rejected([resolved.issue]);
  const batchId = env.randomId();
  const acquired = acquireImportLock(resolved.root, env, batchId);
  warnings.push(...acquired.warnings);
  if (!acquired.lock) return rejected(acquired.issue ? [acquired.issue] : []);
  const { lock } = acquired;

  try {
    const recovered = settleInterruptedImport(resolved.root, env);
    warnings.push(...recovered.warnings);
    recovery = recovered.report;
    if (recovered.issues.length > 0) return rejected(recovered.issues);

    const planned = planImport(
      resolved.root,
      staged.records,
      options.target,
      env.fs,
    );
    if (!planned.plan) return rejected(planned.issues);

    const committed = commitImportPlan(planned.plan, env, batchId);
    warnings.push(...committed.warnings);
    if (!committed.ok) return rejected(committed.issues);

    const records = planned.plan.records.map(({ file, action }) => ({
      file,
      action,
    }));
    return {
      ok: true,
      mode,
      records,
      summary: summarize(records),
      issues: [],
      warnings,
      recovery,
      range: applied,
    };
  } finally {
    warnings.push(...releaseImportLock(lock));
  }
}
