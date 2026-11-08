/**
 * slack command
 *
 * Slack settings for the import skills. The CLI never talks to Slack: these
 * commands record which workspace, user and channels a skill may collect
 * messages from, and print them for the skill. `import` enforces them.
 * Subcommands: configure, channels (add, remove, list), show
 */

import { Command } from 'commander';

import { channelsCommand } from './channels';
import { configureCommand } from './configure';
import { showCommand } from './show';

export const slackCommand = new Command('slack')
  .description(
    'Slack settings for the Slack import skills (the CLI never contacts Slack)',
  )
  .addCommand(configureCommand)
  .addCommand(channelsCommand)
  .addCommand(showCommand);
