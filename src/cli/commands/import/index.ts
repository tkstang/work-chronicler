import { Command } from 'commander';

import { type ImportCommandOptions, runImportCommand } from './import.utils';

export const importCommand = new Command('import')
  .description(
    'Import a staged batch of records (written by an import skill) into the work log, atomically',
  )
  .argument('<dir>', 'Staging directory holding the batch (*.md records)')
  .option(
    '--report <id>',
    'Manager profile: the report the records are about (see `reports list`)',
  )
  .option('-c, --config <path>', 'Path to config file')
  .option('--json', 'Print a machine-readable result')
  .action(async (dir: string, options: ImportCommandOptions) => {
    await runImportCommand('import', dir, options);
  });
