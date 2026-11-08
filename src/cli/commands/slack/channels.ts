import { readFileSync } from 'node:fs';

import chalk from 'chalk';
import { Command } from 'commander';

import {
  channelLine,
  describeChannels,
  describeSubject,
  failSlackChange,
  resolveSlackSubject,
  runSlackChange,
  type SlackCommandOptions,
} from './slack.utils';

interface AddOptions extends SlackCommandOptions {
  name: string;
  reason?: string;
  reasonFile?: string;
  private?: boolean;
  sharedWithManager?: boolean;
}

/**
 * The reason from `--reason`, or read from `--reason-file` (`-` is standard
 * input). Read from a file or standard input, the text never passes through
 * a shell, so quotes, `$`, backticks and backslashes in it are kept as they
 * are. One trailing line break is dropped; the settings check refuses
 * anything else that is not one line of text.
 */
function readReason(options: AddOptions): string {
  if ((options.reason === undefined) === (options.reasonFile === undefined)) {
    failSlackChange(
      options,
      'Pass the reason with either --reason <text> or --reason-file <path> (`-` reads standard input). The config was not changed.',
    );
  }
  if (options.reason !== undefined) return options.reason;
  const file = options.reasonFile as string;
  let text: string;
  try {
    text = readFileSync(file === '-' ? 0 : file, 'utf-8');
  } catch (error) {
    failSlackChange(
      options,
      `The reason could not be read from ${file === '-' ? 'standard input' : file} (${
        error instanceof Error ? error.message : String(error)
      }). The config was not changed.`,
      error,
    );
  }
  return text.replace(/\r?\n$/, '');
}

const addCommand = new Command('add')
  .description('Add a channel whose messages by the subject may be imported')
  .argument('<channel-id>', 'Slack channel ID, such as C0123ABCD')
  .requiredOption('--name <name>', 'Channel name (without #)')
  .option(
    '--reason <text>',
    'Why the channel holds review-relevant work (one line)',
  )
  .option(
    '--reason-file <path>',
    'Read the reason from a file instead (`-` reads standard input), so no shell quoting is needed',
  )
  .option(
    '--private',
    'Opt in to a private channel (channels are public otherwise)',
  )
  .option(
    '--shared-with-manager',
    'Manager profile: confirm you and the report are both members of the channel (required)',
  )
  .option('--report <id>', 'Manager profile: the report the channel is for')
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Print a machine-readable result')
  .action(async (id: string, options: AddOptions) => {
    const reason = readReason(options);
    await runSlackChange(
      options,
      {
        kind: 'add-channel',
        channel: {
          id,
          name: options.name.replace(/^#/, ''),
          reason,
          private: options.private === true,
          sharedWithManager: options.sharedWithManager === true,
        },
      },
      {
        changed: `Channel ${id} added`,
        unchanged: `Channel ${id} is already configured`,
      },
    );
  });

const removeCommand = new Command('remove')
  .description(
    'Remove a channel (records already imported from it are kept; future imports refuse it)',
  )
  .argument('<channel-id>', 'Slack channel ID')
  .option('--report <id>', 'Manager profile: the report the channel is for')
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Print a machine-readable result')
  .action(async (id: string, options: SlackCommandOptions) => {
    await runSlackChange(
      options,
      { kind: 'remove-channel', id },
      {
        changed: `Channel ${id} removed`,
        unchanged: `Channel ${id} is not configured`,
      },
    );
  });

const listCommand = new Command('list')
  .description('List the configured channels')
  .option('--report <id>', 'Manager profile: the report to list')
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Print a machine-readable result')
  .action(async (options: SlackCommandOptions) => {
    const subject = await resolveSlackSubject(options);
    const channels = describeChannels(subject);
    if (options.json) {
      console.log(
        JSON.stringify(
          {
            subject: subject.subject,
            configured: subject.slack !== null,
            channels,
          },
          null,
          2,
        ),
      );
      return;
    }
    if (!subject.slack) {
      console.log(
        chalk.gray(
          `Slack is not set up for ${describeSubject(subject)}; nothing is imported.`,
        ),
      );
      return;
    }
    console.log(
      chalk.bold(
        `Slack channels for ${describeSubject(subject)}: ${channels.length}`,
      ),
    );
    for (const channel of channels) console.log(channelLine(channel));
  });

export const channelsCommand = new Command('channels')
  .description('Manage the channels Slack messages may be imported from')
  .addCommand(addCommand)
  .addCommand(removeCommand)
  .addCommand(listCommand);
