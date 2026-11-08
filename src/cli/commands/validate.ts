import {
  type ImportCommandOptions,
  runImportCommand,
} from '@commands/import/import.utils';
import { Command } from 'commander';

export const validateCommand = new Command('validate')
  .description(
    'Check a staged batch of records against the work log without writing anything',
  )
  .argument('<dir>', 'Staging directory holding the batch (*.md records)')
  .option(
    '--report <id>',
    'Manager profile: the report the records are about (see `reports list`)',
  )
  .option(
    '--since <date>',
    'Google Docs records: start of the range they must be modified in, for this batch (YYYY-MM-DD, the whole UTC day, or an ISO timestamp); replaces fetch.since',
  )
  .option(
    '--until <date>',
    'Google Docs records: end of that range (YYYY-MM-DD includes the whole UTC day); replaces fetch.until',
  )
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Print a machine-readable result')
  .action(async (dir: string, options: ImportCommandOptions) => {
    await runImportCommand('validate', dir, options);
  });
