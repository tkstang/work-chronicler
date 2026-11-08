import { resolve } from 'node:path';

import { CliError } from '@cli/errors';
import { findConfigPath, getOutputDirectory, loadConfig } from '@config/loader';
import {
  type ImportIssue,
  type ImportRangeInput,
  type ImportRunResult,
  type ImportSourceSettings,
  runImport,
} from '@core/import/index';
import { importIssue } from '@core/import/issues';
import { type ImportSubject, ReportIdSchema } from '@wc-types/imported-record';
import { getActiveProfile } from '@workspace/global-config';
import { getReport, loadManagerConfig } from '@workspace/report-manager';
import {
  getReportWorkLogDir,
  isManagerMode,
  isWorkspaceMode,
} from '@workspace/resolver';
import chalk from 'chalk';

/** Options shared by `import` and `validate` */
export interface ImportCommandOptions {
  report?: string;
  config?: string;
  json?: boolean;
  /** Replaces the configured fetch.since for this batch (Google Docs only) */
  since?: string;
  /** Replaces the configured fetch.until for this batch (Google Docs only) */
  until?: string;
}

/** Where a batch goes, who it must be about and that subject's settings */
export interface ImportDestination {
  target: ImportSubject;
  workLogRoot: string;
  /** Per-source settings (Slack, Google Docs) from the IC's or the report's config */
  sources: ImportSourceSettings;
  /** The subject's configured fetch range */
  range: { since: string; until: string | null };
}

/** The machine-readable result printed by `--json` */
export interface ImportCommandResult {
  ok: boolean;
  command: 'import' | 'validate';
  target: ImportSubject | null;
  workLog: string | null;
  summary: ImportRunResult['summary'];
  records: ImportRunResult['records'];
  issues: ImportIssue[];
  warnings: string[];
  recovery: ImportRunResult['recovery'];
  /** The range Google Docs records were checked against */
  range: ImportRunResult['range'];
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Work out the import target from the active profile and options.
 *
 * - An IC profile (or `--config`) imports into its work log; every record
 *   must be about the IC.
 * - A manager profile requires `--report <id>` naming a report in the
 *   profile, and imports into `reports/<id>/work-log/`; every record must be
 *   about that report.
 *
 * Source settings come from the same config: the IC's `slack:` and
 * `googleDocs:` sections, or the report's. A source with no settings
 * imports nothing. The range Google Docs must fall in is the profile's
 * `fetch` range.
 *
 * @param options - Command options
 * @returns The destination, or the issue that rejects the import
 */
export async function resolveImportDestination(
  options: ImportCommandOptions,
): Promise<ImportDestination | ImportIssue> {
  try {
    if (!options.config && isWorkspaceMode()) {
      const profile = getActiveProfile();
      if (isManagerMode(profile)) {
        if (!options.report) {
          return importIssue(
            'TARGET_INVALID',
            'this is a manager profile: pass --report <id> naming the report the records are about',
          );
        }
        const reportId = ReportIdSchema.safeParse(options.report);
        const managerConfig = loadManagerConfig(profile);
        const report = reportId.success
          ? getReport(managerConfig, reportId.data)
          : undefined;
        if (!reportId.success || !report) {
          return importIssue(
            'REPORT_NOT_FOUND',
            'no report with this ID is in the manager profile; see `reports list`',
          );
        }
        const { fetch } = managerConfig;
        return {
          target: { kind: 'report', reportId: reportId.data },
          workLogRoot: getReportWorkLogDir(profile, reportId.data),
          sources: {
            slack: report.slack ?? null,
            googleDocs: report.googleDocs ?? null,
          },
          range: { since: fetch.since, until: fetch.until },
        };
      }
    }

    if (options.report) {
      return importIssue(
        'TARGET_INVALID',
        '--report is only for manager profiles; this profile belongs to one IC',
      );
    }
    const configPath = findConfigPath(options.config);
    const config = await loadConfig(options.config);
    return {
      target: { kind: 'ic' },
      workLogRoot: getOutputDirectory(config, configPath ?? undefined),
      sources: {
        slack: config.slack ?? null,
        googleDocs: config.googleDocs ?? null,
      },
      range: { since: config.fetch.since, until: config.fetch.until },
    };
  } catch (error) {
    return importIssue(
      'TARGET_INVALID',
      `the profile or config could not be loaded: ${message(error)}`,
    );
  }
}

/** A staging file name, quoted when it holds anything unusual */
function fileLabel(file: string): string {
  return /^[\x20-\x7e]+$/.test(file) ? file : JSON.stringify(file);
}

function formatIssue(issue: ImportIssue): string {
  const where = [
    issue.file === undefined ? undefined : fileLabel(issue.file),
    issue.field,
    issue.destination,
  ]
    .filter((part) => part !== undefined)
    .join(' ');
  const position =
    issue.line === undefined
      ? ''
      : ` (line ${issue.line}${issue.column === undefined ? '' : `, column ${issue.column}`})`;
  return `  ${issue.code}${where ? ` ${where}` : ''}: ${issue.message}${position}`;
}

function describeRecovery(
  recovery: NonNullable<ImportRunResult['recovery']>,
): string {
  const batch = recovery.batchId ? ` (batch ${recovery.batchId})` : '';
  switch (recovery.outcome) {
    case 'rolled-back':
      return chalk.yellow(
        `⚠ An interrupted import${batch} was rolled back: none of its ${recovery.records} record(s) were kept.`,
      );
    case 'completed':
      return chalk.yellow(
        `⚠ An interrupted import${batch} had already stored all ${recovery.records} record(s); its bookkeeping was cleared.`,
      );
    default:
      return chalk.yellow(
        `⚠ An interrupted import${batch} had not changed any records and was cleared.`,
      );
  }
}

/** Whether the work log may still hold part of an interrupted import */
function needsRecovery(issues: ImportIssue[]): boolean {
  return issues.some(
    (i) =>
      i.code === 'ROLLBACK_INCOMPLETE' ||
      i.code === 'RECOVERY_CONFLICT' ||
      i.code === 'RECOVERY_REQUIRED',
  );
}

/**
 * Run `import` or `validate` and print the result. Throws a
 * {@link CliError} (exit code 1) when the batch is rejected; with `--json`
 * the JSON result is printed to stdout first.
 *
 * @param command - Which command is running
 * @param stagingDir - Staging directory argument
 * @param options - Command options
 */
export async function runImportCommand(
  command: 'import' | 'validate',
  stagingDir: string,
  options: ImportCommandOptions,
): Promise<void> {
  const destination = await resolveImportDestination(options);
  let result: ImportCommandResult;
  if ('code' in destination) {
    result = {
      ok: false,
      command,
      target: null,
      workLog: null,
      summary: { records: 0, created: 0, updated: 0, unchanged: 0 },
      records: [],
      issues: [destination],
      warnings: [],
      recovery: null,
      range: null,
    };
  } else {
    const override: NonNullable<ImportRangeInput['override']> = {
      ...(options.since !== undefined ? { since: options.since } : {}),
      ...(options.until !== undefined ? { until: options.until } : {}),
    };
    const run = runImport({
      mode: command,
      stagingDir: resolve(stagingDir),
      workLogRoot: destination.workLogRoot,
      target: destination.target,
      sources: destination.sources,
      range: { ...destination.range, override },
    });
    result = {
      ok: run.ok,
      command,
      target: destination.target,
      workLog: destination.workLogRoot,
      summary: run.summary,
      records: run.records,
      issues: run.issues,
      warnings: run.warnings,
      recovery: run.recovery,
      range: run.range,
    };
  }

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) {
      throw new CliError(
        chalk.red(`✗ ${command} rejected the batch (see the JSON output)`),
      );
    }
    return;
  }

  if (result.recovery) console.log(describeRecovery(result.recovery));
  if (result.range?.overridden) {
    console.log(
      chalk.gray(
        `Range for Google Docs records (from --since/--until): ${result.range.since} to ${result.range.until ?? 'now'}`,
      ),
    );
  }
  for (const warning of result.warnings) {
    console.log(chalk.yellow(`⚠ ${warning}`));
  }

  if (!result.ok) {
    const count = result.issues.length;
    const outcome =
      command === 'validate'
        ? 'the batch is not valid'
        : needsRecovery(result.issues)
          ? 'the work log needs recovery (details below)'
          : 'no records were changed';
    throw new CliError(
      [
        chalk.red(`✗ ${command}: ${count} problem(s); ${outcome}.`),
        ...result.issues.map(formatIssue),
      ].join('\n'),
    );
  }

  const { records, created, updated, unchanged } = result.summary;
  console.log(
    command === 'validate'
      ? chalk.green(
          `✓ Batch is valid: ${records} record(s); import would create ${created}, update ${updated} and leave ${unchanged} unchanged. Nothing was written.`,
        )
      : chalk.green(
          `✓ Imported ${records} record(s) into ${result.workLog}: ${created} created, ${updated} updated, ${unchanged} unchanged.`,
        ),
  );
}
