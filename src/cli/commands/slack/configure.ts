import { Command } from 'commander';

import { runSlackChange, type SlackCommandOptions } from './slack.utils';

interface ConfigureOptions extends SlackCommandOptions {
  workspace: string;
  user: string;
}

export const configureCommand = new Command('configure')
  .description(
    'Set up Slack for this profile, or for a report with --report (workspace and user ID)',
  )
  .requiredOption(
    '--workspace <workspace>',
    'Slack workspace: its team ID (T0123ABCD), or its URL label when no tool shows the ID (example, for example.slack.com)',
  )
  .requiredOption(
    '--user <user-id>',
    "The subject's Slack user ID (yours, or the report's), such as U0123ABCD",
  )
  .option('--report <id>', 'Manager profile: the report to set up')
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Print a machine-readable result')
  .action(async (options: ConfigureOptions) => {
    await runSlackChange(
      options,
      { kind: 'configure', workspace: options.workspace, user: options.user },
      {
        changed: 'Slack workspace and user saved',
        unchanged: 'Slack already has this workspace and user',
      },
    );
  });
