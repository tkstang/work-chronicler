import { stripVTControlCharacters } from 'node:util';

import { CliError, toCliError } from '@cli/errors';
import { findConfigPath, getOutputDirectory, loadConfig } from '@config/loader';
import {
  type SlackSettingsChange,
  type SlackSettingsOwner,
  updateSlackSettings,
} from '@config/slack-config';
import { type ImportSubject, ReportIdSchema } from '@wc-types/imported-record';
import type { SlackSettings } from '@wc-types/slack';
import { getActiveProfile } from '@workspace/global-config';
import { getReport, loadManagerConfig } from '@workspace/report-manager';
import {
  getProfileConfigPath,
  getReportWorkLogDir,
  isManagerMode,
  isWorkspaceMode,
} from '@workspace/resolver';
import chalk from 'chalk';

/** Options shared by every `slack` subcommand */
export interface SlackCommandOptions {
  report?: string;
  config?: string;
  json?: boolean;
}

/** The subject a `slack` command reads or changes, with its settings */
export interface SlackSubject {
  /** Active profile, or null for a legacy config passed with --config */
  profile: string | null;
  mode: 'ic' | 'manager';
  owner: SlackSettingsOwner;
  subject: ImportSubject;
  /** The report's display name (manager mode) */
  subjectName: string | null;
  /** Config file that holds the settings */
  configPath: string;
  /** Work log records for this subject are imported into */
  workLog: string;
  /** The profile's fetch range; `until: null` means now */
  range: { since: string; until: string | null };
  /** Slack settings, or null when Slack is not set up for the subject */
  slack: SlackSettings | null;
}

const ERROR = chalk.red('✗');

function fail(message: string, hint?: string): never {
  throw new CliError(`${ERROR} ${message}`, { hint });
}

/**
 * Resolve the subject from the active profile and options, the same way
 * `import` does: an IC profile (or `--config`) is the IC; a manager profile
 * needs `--report <id>`.
 *
 * @param options - Command options
 * With `--json`, a failure is printed as `{ ok: false, error }` first (and
 * no hint follows it on stdout), so a JSON reader always gets a result.
 *
 * @returns The subject and its current settings
 * @throws {CliError} When the profile, config or report cannot be resolved
 */
export async function resolveSlackSubject(
  options: SlackCommandOptions,
): Promise<SlackSubject> {
  try {
    if (!options.config && isWorkspaceMode()) {
      const profile = getActiveProfile();
      if (isManagerMode(profile)) {
        if (!options.report) {
          fail(
            'This is a manager profile: pass --report <id> naming the report.',
            chalk.gray('See `work-chronicler reports list` for report IDs.'),
          );
        }
        const reportId = ReportIdSchema.safeParse(options.report);
        const config = loadManagerConfig(profile);
        const report = reportId.success
          ? getReport(config, reportId.data)
          : undefined;
        if (!reportId.success || !report) {
          fail(
            'No report with this ID is in the manager profile.',
            chalk.gray('See `work-chronicler reports list` for report IDs.'),
          );
        }
        return {
          profile,
          mode: 'manager',
          owner: { kind: 'report', reportId: reportId.data },
          subject: { kind: 'report', reportId: reportId.data },
          subjectName: report.name,
          configPath: getProfileConfigPath(profile),
          workLog: getReportWorkLogDir(profile, reportId.data),
          range: { since: config.fetch.since, until: config.fetch.until },
          slack: report.slack ?? null,
        };
      }
    }

    if (options.report) {
      fail('--report is only for manager profiles; this profile is one IC.');
    }
    const configPath = findConfigPath(options.config);
    const config = await loadConfig(options.config);
    if (!configPath) fail('Config file not found.');
    return {
      profile: !options.config && isWorkspaceMode() ? getActiveProfile() : null,
      mode: 'ic',
      owner: { kind: 'ic' },
      subject: { kind: 'ic' },
      subjectName: null,
      configPath,
      workLog: getOutputDirectory(config, configPath),
      range: { since: config.fetch.since, until: config.fetch.until },
      slack: config.slack ?? null,
    };
  } catch (error) {
    const failure = toCliError(
      error,
      `${ERROR} The profile or config could not be loaded:`,
    );
    if (!options.json) throw failure;
    // A JSON reader gets a result on stdout, and only that: the hint, which
    // would be printed to stdout after it, is left out
    const message = stripVTControlCharacters(failure.message).replace(
      /^✗\s*/,
      '',
    );
    console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    throw new CliError(failure.message, {
      exitCode: failure.exitCode,
      cause: failure.cause ?? failure,
    });
  }
}

/** "this profile" or "report alice-smith (Alice Smith)" */
export function describeSubject(subject: SlackSubject): string {
  return subject.owner.kind === 'ic'
    ? 'this profile'
    : `report ${subject.owner.reportId}${subject.subjectName ? ` (${subject.subjectName})` : ''}`;
}

/**
 * A channel as `slack show`/`channels list` print it. `importable` is false
 * for a report channel the manager has not confirmed as shared.
 */
export function describeChannels(subject: SlackSubject) {
  return (subject.slack?.channels ?? []).map((channel) => ({
    id: channel.id,
    name: channel.name,
    reason: channel.reason,
    private: channel.private,
    ...(subject.mode === 'manager'
      ? { sharedWithManager: channel.sharedWithManager === true }
      : {}),
    importable:
      subject.mode === 'ic' ? true : channel.sharedWithManager === true,
  }));
}

/** One channel as a line of text */
export function channelLine(
  channel: ReturnType<typeof describeChannels>[number],
): string {
  const flags = [
    channel.private ? 'private, opted in' : 'public',
    ...('sharedWithManager' in channel && !channel.sharedWithManager
      ? ['not confirmed as shared: not imported']
      : []),
  ];
  return `  ${channel.id}  #${channel.name} (${flags.join('; ')}): ${channel.reason}`;
}

/**
 * Fail a command that changes Slack settings. With `--json`, the failure is
 * printed as `{ ok: false, error }` first, so a JSON reader always gets a
 * result.
 *
 * @param options - Command options
 * @param message - What went wrong (unstyled)
 * @param cause - The underlying error, kept for debugging
 * @throws {CliError} Always
 */
export function failSlackChange(
  options: SlackCommandOptions,
  message: string,
  cause?: unknown,
): never {
  if (options.json) {
    console.log(JSON.stringify({ ok: false, error: message }, null, 2));
  }
  throw new CliError(`${ERROR} ${message}`, { cause });
}

/**
 * Change the subject's Slack settings and print the result.
 *
 * @param options - Command options
 * @param change - The change
 * @param messages - What to print when the file changed or already held it
 */
export async function runSlackChange(
  options: SlackCommandOptions,
  change: SlackSettingsChange,
  messages: { changed: string; unchanged: string },
): Promise<void> {
  const subject = await resolveSlackSubject(options);
  let result: ReturnType<typeof updateSlackSettings>;
  try {
    result = updateSlackSettings({
      configPath: subject.configPath,
      owner: subject.owner,
      change,
      workLog: subject.workLog,
    });
  } catch (error) {
    failSlackChange(
      options,
      error instanceof Error ? error.message : String(error),
      error,
    );
  }
  const after = await resolveSlackSubject(options);
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          changed: result.changed,
          warnings: result.warnings,
          subject: after.subject,
          configured: after.slack !== null,
          channels: describeChannels(after),
        },
        null,
        2,
      ),
    );
    return;
  }
  for (const warning of result.warnings)
    console.log(chalk.yellow(`⚠ ${warning}`));
  console.log(
    result.changed
      ? chalk.green(`✓ ${messages.changed} (${describeSubject(after)})`)
      : chalk.gray(
          `${messages.unchanged} (${describeSubject(after)}); nothing changed`,
        ),
  );
}
