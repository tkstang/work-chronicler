import chalk from 'chalk';
import { Command } from 'commander';

import {
  channelLine,
  describeChannels,
  describeSubject,
  resolveSlackSubject,
  runSlackChange,
  type SlackCommandOptions,
} from './slack.utils';

interface AddOptions extends SlackCommandOptions {
  name: string;
  reason: string;
  private?: boolean;
  sharedWithManager?: boolean;
}

const addCommand = new Command('add')
  .description('Add a channel whose messages by the subject may be imported')
  .argument('<channel-id>', 'Slack channel ID, such as C0123ABCD')
  .requiredOption('--name <name>', 'Channel name (without #)')
  .requiredOption(
    '--reason <text>',
    'Why the channel holds review-relevant work (one line)',
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
    await runSlackChange(
      options,
      {
        kind: 'add-channel',
        channel: {
          id,
          name: options.name.replace(/^#/, ''),
          reason: options.reason,
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
