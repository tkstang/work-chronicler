import { updateGoogleDocsSettings } from '@config/google-docs-config';
import chalk from 'chalk';
import { Command } from 'commander';

import {
  describeSubject,
  failSlackChange,
  resolveSlackSubject,
  type SlackCommandOptions,
} from '../slack/slack.utils';

interface ConfigureOptions extends SlackCommandOptions {
  account: string;
}

export const configureCommand = new Command('configure')
  .description(
    'Set up Google Docs for this profile, or for a report with --report (the account that owns the Docs)',
  )
  .requiredOption(
    '--account <email>',
    "The subject's Google account (yours, or the report's): only Docs it owns are imported",
  )
  .option('--report <id>', 'Manager profile: the report to set up')
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Print a machine-readable result')
  .action(async (options: ConfigureOptions) => {
    const subject = await resolveSlackSubject(options);
    let result: ReturnType<typeof updateGoogleDocsSettings>;
    try {
      result = updateGoogleDocsSettings({
        configPath: subject.configPath,
        owner: subject.owner,
        account: options.account,
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
            configured: after.googleDocs !== null,
            account: after.googleDocs?.account ?? null,
          },
          null,
          2,
        ),
      );
      return;
    }
    for (const warning of result.warnings) {
      console.log(chalk.yellow(`⚠ ${warning}`));
    }
    console.log(
      result.changed
        ? chalk.green(`✓ Google Docs account saved (${describeSubject(after)})`)
        : chalk.gray(
            `Google Docs already has this account (${describeSubject(after)}); nothing changed`,
          ),
    );
  });
