import chalk from 'chalk';
import { Command } from 'commander';

import {
  channelLine,
  describeChannels,
  describeSubject,
  resolveSlackSubject,
  type SlackCommandOptions,
  type SlackSubject,
} from './slack.utils';

/**
 * What `slack show --json` prints: everything an import skill needs to
 * collect and stage the subject's messages, and nothing it must not use.
 */
export function slackShowResult(subject: SlackSubject) {
  const { slack } = subject;
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
    configured: slack !== null,
    range: subject.range,
    workspace: slack?.workspace ?? null,
    user: slack?.user ?? null,
    channels: describeChannels(subject),
    /** Fields every staged record must carry for this subject */
    record: slack
      ? {
          source: 'slack',
          sourceAccount: slack.workspace,
          subject: subject.subject,
          attribution: { status: 'verified', authorId: slack.user },
        }
      : null,
    importCommand,
    workLog: subject.workLog,
  };
}

export const showCommand = new Command('show')
  .description(
    'Print the subject, fetch range and Slack settings an import skill uses (read-only)',
  )
  .option('--report <id>', 'Manager profile: the report to show')
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Print a machine-readable result')
  .action(async (options: SlackCommandOptions) => {
    const subject = await resolveSlackSubject(options);
    const result = slackShowResult(subject);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    const who = describeSubject(subject);
    if (!result.configured) {
      console.log(
        chalk.gray(`Slack is not set up for ${who}; nothing is imported.`),
      );
      console.log(
        chalk.gray(
          `Set it up with \`work-chronicler slack configure --workspace <team-id> --user <user-id>${subject.owner.kind === 'report' ? ` --report ${subject.owner.reportId}` : ''}\`.`,
        ),
      );
      return;
    }
    console.log(chalk.bold(`Slack for ${who}`));
    console.log(`  Workspace: ${result.workspace}`);
    console.log(`  User: ${result.user}`);
    console.log(
      `  Range: ${result.range.since} to ${result.range.until ?? 'now'}`,
    );
    console.log(`  Work log: ${result.workLog}`);
    console.log(chalk.bold(`Channels: ${result.channels.length}`));
    for (const channel of result.channels) console.log(channelLine(channel));
    if (result.channels.length === 0) {
      console.log(
        chalk.gray('  None yet: nothing is imported until a channel is added.'),
      );
    }
    console.log(`Import with: ${result.importCommand.join(' ')}`);
  });
