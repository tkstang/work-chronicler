import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkbox, confirm, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import {
  AI_TOOLS,
  type AIToolKey,
  type InstallMethod,
  SKILL_PREFIX,
} from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the source skills directory (from the package)
 */
function getSourceSkillsDir(): string {
  // Navigate from dist/cli/commands/skills/ to .agent/skills/
  // In development: src/cli/commands/skills/ -> .agent/skills/
  // In production: dist/cli/commands/skills/ -> .agent/skills/
  const packageRoot = join(__dirname, '..', '..', '..', '..');
  return join(packageRoot, '.agent', 'skills');
}

/**
 * Get available skills from source directory
 */
function getAvailableSkills(): string[] {
  const sourceDir = getSourceSkillsDir();
  if (!existsSync(sourceDir)) {
    return [];
  }

  try {
    return readdirSync(sourceDir, { withFileTypes: true })
      .filter(
        (entry) => entry.isDirectory() && entry.name.startsWith(SKILL_PREFIX),
      )
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * Check which AI tools have their config directory
 */
function detectInstalledTools(): { key: AIToolKey; detected: boolean }[] {
  return (Object.keys(AI_TOOLS) as AIToolKey[]).map((key) => ({
    key,
    detected: existsSync(join(homedir(), AI_TOOLS[key].configDir)),
  }));
}

/**
 * Check for existing skills at target
 */
function getExistingSkills(toolKey: AIToolKey): string[] {
  const tool = AI_TOOLS[toolKey];
  const targetDir = join(homedir(), tool.configDir, tool.skillsDir);

  if (!existsSync(targetDir)) {
    return [];
  }

  try {
    return readdirSync(targetDir, { withFileTypes: true })
      .filter(
        (entry) => entry.isDirectory() && entry.name.startsWith(SKILL_PREFIX),
      )
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * Install skills to a target tool
 */
function installSkills(
  toolKey: AIToolKey,
  skills: string[],
  method: InstallMethod,
  overwrite: boolean,
): { installed: number; skipped: number } {
  const tool = AI_TOOLS[toolKey];
  const sourceDir = getSourceSkillsDir();
  const targetDir = join(homedir(), tool.configDir, tool.skillsDir);

  // Ensure target directory exists
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  let installed = 0;
  let skipped = 0;

  for (const skill of skills) {
    const sourcePath = join(sourceDir, skill);
    const targetPath = join(targetDir, skill);

    if (existsSync(targetPath)) {
      if (overwrite) {
        rmSync(targetPath, { recursive: true, force: true });
      } else {
        skipped++;
        continue;
      }
    }

    if (method === 'symlink') {
      symlinkSync(sourcePath, targetPath, 'dir');
    } else {
      cpSync(sourcePath, targetPath, { recursive: true });
    }
    installed++;
  }

  return { installed, skipped };
}

export const installSubcommand = new Command('install')
  .description('Install work-chronicler skills to AI tools')
  .action(async () => {
    // Check for source skills
    const availableSkills = getAvailableSkills();
    if (availableSkills.length === 0) {
      console.error(
        chalk.red('No skills found in package. Package may be corrupted.'),
      );
      process.exit(1);
    }

    console.log(
      chalk.cyan(`\nFound ${availableSkills.length} skills to install.\n`),
    );

    // Detect installed tools
    const tools = detectInstalledTools();
    const choices = tools.map(({ key, detected }) => ({
      name: `${AI_TOOLS[key].name} (~/${AI_TOOLS[key].configDir})${detected ? '' : chalk.dim(' - not detected')}`,
      value: key,
      checked: detected,
    }));

    // Select tools
    const selectedTools = await checkbox({
      message: 'Select AI tools to install skills for:',
      choices,
    });

    if (selectedTools.length === 0) {
      console.log(chalk.yellow('No tools selected. Exiting.'));
      return;
    }

    // Select install method
    const method = await select<InstallMethod>({
      message: 'How should skills be installed?',
      choices: [
        {
          name: 'Copy (recommended - works after package updates)',
          value: 'copy',
        },
        {
          name: 'Symlink (auto-updates but requires global install)',
          value: 'symlink',
        },
      ],
    });

    // Check for conflicts and install
    let totalInstalled = 0;

    for (const toolKey of selectedTools) {
      const tool = AI_TOOLS[toolKey];
      const existing = getExistingSkills(toolKey);

      let overwrite = false;
      if (existing.length > 0) {
        console.log(
          chalk.yellow(
            `\n${tool.name} already has ${existing.length} work-chronicler skill(s).`,
          ),
        );
        overwrite = await confirm({
          message: 'Overwrite existing skills?',
          default: false,
        });
      }

      const result = installSkills(
        toolKey,
        availableSkills,
        method,
        overwrite || existing.length === 0,
      );
      totalInstalled += result.installed;

      if (result.installed > 0) {
        console.log(
          chalk.green(
            `✓ Installed ${result.installed} skill(s) to ${tool.name}`,
          ),
        );
      }
      if (result.skipped > 0) {
        console.log(
          chalk.yellow(`  Skipped ${result.skipped} existing skill(s)`),
        );
      }
    }

    console.log(
      chalk.cyan(`\nDone! Installed ${totalInstalled} skill(s) (${method}).`),
    );

    if (totalInstalled > 0) {
      console.log(chalk.dim('\nSkills are now available in your AI tools.'));
      console.log(
        chalk.dim(
          'Use /work-chronicler-summarize-work (or similar) to invoke them.',
        ),
      );
    }
  });
