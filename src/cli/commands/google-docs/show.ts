import {
  GOOGLE_DOC_MIME_TYPE,
  MAX_DOCUMENT_EXCERPT_BYTES,
} from '@wc-types/google-docs';
import chalk from 'chalk';
import { Command } from 'commander';

import {
  describeSubject,
  resolveSlackSubject,
  type SlackCommandOptions,
  type SlackSubject,
} from '../slack/slack.utils';

/**
 * What `google-docs show --json` prints: everything the import skill needs
 * to find, read and stage the subject's own Docs, and nothing it must not
 * use.
 */
export function googleDocsShowResult(subject: SlackSubject) {
  const { googleDocs } = subject;
  const importCommand = [
    'work-chronicler',
    ...(subject.profile ? ['--profile', subject.profile] : []),
    'import',
    '<staging-dir>',
    ...(subject.owner.kind === 'report'
      ? ['--report', subject.owner.reportId]
      : []),
    ...(subject.profile ? [] : ['--config', subject.configPath]),
  ];
  return {
    profile: subject.profile,
    mode: subject.mode,
    subject: subject.subject,
    subjectName: subject.subjectName,
    configured: googleDocs !== null,
    /**
     * The profile's fetch range: a Doc is imported when its modified time
     * falls inside it (UTC, inclusive; a date alone is the whole day)
     */
    range: subject.range,
    /** The account every imported Doc must be owned by */
    account: googleDocs?.account ?? null,
    /** Fields every staged record must carry for this subject */
    record: googleDocs
      ? {
          type: 'document',
          source: 'google-docs',
          sourceAccount: googleDocs.account,
          subject: subject.subject,
          attribution: { status: 'unverified', authorId: null },
          document: { mimeType: GOOGLE_DOC_MIME_TYPE },
        }
      : null,
    /** Largest record body: the Doc's own text, cut to fit (UTF-8 bytes) */
    excerptMaxBytes: MAX_DOCUMENT_EXCERPT_BYTES,
    importCommand,
    workLog: subject.workLog,
  };
}

export const showCommand = new Command('show')
  .description(
    'Print the subject, fetch range and Google Docs settings an import skill uses (read-only)',
  )
  .option('--report <id>', 'Manager profile: the report to show')
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Print a machine-readable result')
  .action(async (options: SlackCommandOptions) => {
    const subject = await resolveSlackSubject(options);
    const result = googleDocsShowResult(subject);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const who = describeSubject(subject);
    if (!result.configured) {
      console.log(
        chalk.gray(
          `Google Docs is not set up for ${who}; nothing is imported.`,
        ),
      );
      console.log(
        chalk.gray(
          `Set it up with \`work-chronicler google-docs configure --account <email>${subject.owner.kind === 'report' ? ` --report ${subject.owner.reportId}` : ''}\`.`,
        ),
      );
      return;
    }
    console.log(chalk.bold(`Google Docs for ${who}`));
    console.log(`  Owner account: ${result.account}`);
    console.log(
      `  Range (modified time): ${result.range.since} to ${result.range.until ?? 'now'}`,
    );
    console.log(`  Excerpt cap: ${result.excerptMaxBytes} bytes`);
    console.log(`  Work log: ${result.workLog}`);
    console.log(`Import with: ${result.importCommand.join(' ')}`);
  });
