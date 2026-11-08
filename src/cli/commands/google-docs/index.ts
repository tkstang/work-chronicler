/**
 * google-docs command
 *
 * Google Docs settings for the Google Docs import skill. The CLI never talks
 * to Google: these commands record whose Docs (by owner account) a skill may
 * collect, and print the settings and range for the skill. `import`
 * enforces them. Subcommands: configure, show
 */

import { Command } from 'commander';

import { configureCommand } from './configure';
import { showCommand } from './show';

export const googleDocsCommand = new Command('google-docs')
  .description(
    'Google Docs settings for the Google Docs import skill (the CLI never contacts Google)',
  )
  .addCommand(configureCommand)
  .addCommand(showCommand);
