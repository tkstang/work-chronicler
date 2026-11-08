import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CliError } from '@cli/errors';
import { checkbox, confirm, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command, Option } from 'commander';

import { isPathOccupied } from './installed';
import {
  findRenamedSkills,
  planRenamedSkillRemoval,
  removeRenamedSkill,
  type RenamedSkillEntry,
} from './migrate';
import {
  nodeSkillInstallFs,
  recoverInterruptedReplacements,
  replaceSkill,
  type SkillInstallFs,
} from './replace';
import {
  AI_TOOL_KEYS,
  AI_TOOLS,
  type AIToolKey,
  type InstallMethod,
  InstallMethodSchema,
  SKILL_PREFIX,
} from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface InstallOptions {
  tool?: (AIToolKey | 'all')[];
  method?: InstallMethod;
  yes?: boolean;
  overwrite?: boolean;
  keepOld?: boolean;
}

/**
 * Get the source skills directory (from the package)
 */
function getSourceSkillsDir(): string {
  // Navigate from dist/cli/commands/skills/ to .agents/skills/
  // In development: src/cli/commands/skills/ -> .agents/skills/
  // In production: dist/cli/commands/skills/ -> .agents/skills/
  const packageRoot = join(__dirname, '..', '..', '..', '..');
  return join(packageRoot, '.agents', 'skills');
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

function getSkillsDir(toolKey: AIToolKey): string {
  const tool = AI_TOOLS[toolKey];
  return join(homedir(), tool.configDir, tool.skillsDir);
}

function isToolDetected(toolKey: AIToolKey): boolean {
  return existsSync(join(homedir(), AI_TOOLS[toolKey].configDir));
}

/** A symlink whose target is gone. `existsSync` follows the link. */
function isDanglingSymlink(path: string): boolean {
  return isPathOccupied(path) && !existsSync(path);
}

/**
 * Skills about to be installed whose destination is already occupied by
 * anything: a directory, a regular file or a working symlink. Replacing one
 * needs an explicit overwrite decision. Broken symlinks are not conflicts:
 * they are always replaced, so they never need an overwrite prompt. Old-name
 * skills are not destinations; the rename migration handles them.
 */
function getConflictingSkills(toolKey: AIToolKey, skills: string[]): string[] {
  const skillsDir = getSkillsDir(toolKey);
  return skills.filter((skill) => {
    const path = join(skillsDir, skill);
    return isPathOccupied(path) && !isDanglingSymlink(path);
  });
}

interface InstallRequest {
  fs: SkillInstallFs;
  toolKey: AIToolKey;
  skills: string[];
  method: InstallMethod;
  overwrite: boolean;
}

interface InstallResult {
  installed: number;
  skipped: number;
  failed: string[];
  warnings: string[];
}

/**
 * Install skills to a target tool. Each skill is staged and checked before
 * it replaces anything, so a skill that fails to install is reported in
 * `failed` and whatever was at its name before is kept. Leftovers that
 * could not be removed are reported in `warnings`; neither stops the
 * remaining skills.
 */
function installSkills(request: InstallRequest): InstallResult {
  const { fs, toolKey, skills, method, overwrite } = request;
  const sourceDir = getSourceSkillsDir();
  const targetDir = getSkillsDir(toolKey);
  const result: InstallResult = {
    installed: 0,
    skipped: 0,
    failed: [],
    warnings: [],
  };

  try {
    mkdirSync(targetDir, { recursive: true });
  } catch (error) {
    result.failed = skills.map((skill) => `${skill}: ${errorMessage(error)}`);
    return result;
  }

  for (const skill of skills) {
    const targetPath = join(targetDir, skill);
    if (
      isPathOccupied(targetPath) &&
      !overwrite &&
      !isDanglingSymlink(targetPath)
    ) {
      result.skipped++;
      continue;
    }

    const outcome = replaceSkill({
      fs,
      sourcePath: join(sourceDir, skill),
      skillsDir: targetDir,
      skill,
      method,
    });
    result.warnings.push(...outcome.warnings);
    if (outcome.installed) {
      result.installed++;
    } else {
      result.failed.push(`${skill}: ${outcome.error}`);
    }
  }

  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatRenames(entries: RenamedSkillEntry[]): string {
  return entries
    .map((entry) => `    ${entry.oldName} → ${entry.newName}`)
    .join('\n');
}

async function selectTools(options: InstallOptions): Promise<AIToolKey[]> {
  if (options.tool !== undefined) {
    return options.tool.includes('all')
      ? AI_TOOL_KEYS
      : [...new Set(options.tool as AIToolKey[])];
  }

  if (options.yes) {
    return AI_TOOL_KEYS.filter(isToolDetected);
  }

  return checkbox({
    message: 'Select AI tools to install skills for:',
    choices: AI_TOOL_KEYS.map((key) => {
      const detected = isToolDetected(key);
      return {
        name: `${AI_TOOLS[key].name} (~/${AI_TOOLS[key].configDir})${detected ? '' : chalk.dim(' - not detected')}`,
        value: key,
        checked: detected,
      };
    }),
  });
}

async function selectMethod(options: InstallOptions): Promise<InstallMethod> {
  if (options.method !== undefined) return options.method;
  if (options.yes) return 'copy';
  return select<InstallMethod>({
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
}

/**
 * Remove a tool's old-name skills once their replacements are verified.
 * Removal is its own confirmed step; declining keeps both names.
 *
 * @returns Failure messages for entries that could not be removed
 */
async function migrateRenamedSkills(
  toolKey: AIToolKey,
  options: InstallOptions,
): Promise<string[]> {
  const tool = AI_TOOLS[toolKey];
  const skillsDir = getSkillsDir(toolKey);
  const { removable, blocked, dependent } = planRenamedSkillRemoval(
    skillsDir,
    AI_TOOL_KEYS.map(getSkillsDir),
  );

  if (blocked.length > 0) {
    console.log(
      chalk.yellow(
        `  Kept ${blocked.length} old-name skill(s) in ${tool.name}: the new name is missing or its SKILL.md does not declare that name.\n${formatRenames(blocked)}\n  Re-run with --overwrite to replace what occupies the new name.`,
      ),
    );
  }

  if (dependent.length > 0) {
    const details = dependent
      .map(
        (entry) =>
          `    ${entry.oldName} → ${entry.newName} (used by ${entry.usedBy.join(', ')})`,
      )
      .join('\n');
    console.log(
      chalk.yellow(
        `  Kept ${dependent.length} old-name skill(s) in ${tool.name}: another installed skill, in this or another tool, resolves into the old entry (for example a symlink to the old copy), so removing it would break that skill.\n${details}\n  Make that skill independent: for a work-chronicler skill run \`work-chronicler skills install --tool <its tool> --overwrite\`; for your own skill, replace the link with a copy of what it points to. Then run \`work-chronicler skills install\` again for ${tool.name}; the old name is removed once nothing resolves into it.`,
      ),
    );
  }

  if (removable.length === 0) return [];

  console.log(
    chalk.cyan(
      `  ${tool.name} has ${removable.length} skill(s) under old names:\n${formatRenames(removable)}`,
    ),
  );

  const remove = options.keepOld
    ? false
    : options.yes
      ? true
      : await confirm({
          message: `Remove the old names from ${tool.name}?`,
          default: true,
        });

  if (!remove) {
    console.log(
      chalk.yellow(
        `  Kept the old names in ${tool.name}; both old and new names are installed. Run \`work-chronicler skills install\` again to remove them.`,
      ),
    );
    return [];
  }

  const failed: string[] = [];
  let removed = 0;
  for (const entry of removable) {
    try {
      removeRenamedSkill(skillsDir, entry);
      removed++;
    } catch (error) {
      failed.push(`${tool.name} ${entry.oldName}: ${errorMessage(error)}`);
    }
  }
  if (removed > 0) {
    console.log(
      chalk.green(`✓ Removed ${removed} old-name skill(s) from ${tool.name}`),
    );
  }
  return failed;
}

/** What `skills install` runs against; tests inject filesystem failures */
export interface InstallDependencies {
  fs?: SkillInstallFs;
}

/**
 * Create the `skills install` command.
 *
 * @param dependencies - Filesystem used to replace and recover skills
 *   (defaults to the real one; tests inject failures)
 * @returns The configured command
 */
export function createInstallSubcommand(
  dependencies: InstallDependencies = {},
): Command {
  const fs = dependencies.fs ?? nodeSkillInstallFs;
  return new Command('install')
    .description('Install work-chronicler skills to AI tools')
    .addOption(
      new Option(
        '-t, --tool <tool...>',
        'tools to install for (skips the tool prompt)',
      ).choices([...AI_TOOL_KEYS, 'all']),
    )
    .addOption(
      new Option(
        '-m, --method <method>',
        'install method (skips the method prompt)',
      ).choices(InstallMethodSchema.options),
    )
    .option(
      '-y, --yes',
      'never prompt: use detected tools, copy, keep what is already at a skill name and remove old names',
    )
    .option(
      '--overwrite',
      'replace what is already at a skill name without asking',
    )
    .option(
      '--keep-old',
      'keep skills installed under old names without asking',
    )
    .action(async (options: InstallOptions) => {
      // Check for source skills
      const availableSkills = getAvailableSkills();
      if (availableSkills.length === 0) {
        throw new CliError(
          chalk.red('No skills found in package. Package may be corrupted.'),
        );
      }

      console.log(
        chalk.cyan(`\nFound ${availableSkills.length} skills to install.\n`),
      );

      const selectedTools = await selectTools(options);

      if (selectedTools.length === 0) {
        console.log(
          chalk.yellow(
            options.yes
              ? 'No AI tools detected. Pass --tool to choose one. Exiting.'
              : 'No tools selected. Exiting.',
          ),
        );
        return;
      }

      const method = await selectMethod(options);

      // Check for conflicts, install, then migrate old names
      let totalInstalled = 0;
      const failures: string[] = [];

      for (const toolKey of selectedTools) {
        const tool = AI_TOOLS[toolKey];

        // Finish what an interrupted run left before deciding what to replace
        const recovery = recoverInterruptedReplacements(
          fs,
          getSkillsDir(toolKey),
          availableSkills,
        );
        if (recovery.restored.length > 0) {
          console.log(
            chalk.yellow(
              `\n${tool.name}: put back ${recovery.restored.length} skill(s) that an interrupted install had moved aside:\n${recovery.restored.map((name) => `    ${name}`).join('\n')}`,
            ),
          );
        }
        for (const warning of recovery.warnings) {
          console.log(chalk.yellow(`  Warning: ${tool.name} ${warning}`));
        }

        const conflicts = getConflictingSkills(toolKey, availableSkills);

        // Only an explicit decision replaces what occupies a destination
        let overwrite = options.overwrite === true;
        if (conflicts.length > 0 && !overwrite) {
          console.log(
            chalk.yellow(
              `\n${tool.name} already has something at ${conflicts.length} skill name(s):\n${conflicts.map((name) => `    ${name}`).join('\n')}`,
            ),
          );
          overwrite = options.yes
            ? false
            : await confirm({
                message: 'Overwrite existing skills?',
                default: false,
              });
        }

        const result = installSkills({
          fs,
          toolKey,
          skills: availableSkills,
          method,
          overwrite,
        });
        totalInstalled += result.installed;
        failures.push(...result.failed.map((text) => `${tool.name} ${text}`));

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
        for (const warning of result.warnings) {
          console.log(chalk.yellow(`  Warning: ${tool.name} ${warning}`));
        }

        failures.push(...(await migrateRenamedSkills(toolKey, options)));
      }

      // Old names on tools that were not selected are left alone.
      for (const toolKey of AI_TOOL_KEYS) {
        if (selectedTools.includes(toolKey)) continue;
        const leftover = findRenamedSkills(getSkillsDir(toolKey));
        if (leftover.length > 0) {
          console.log(
            chalk.yellow(
              `\n${AI_TOOLS[toolKey].name} was not selected and still has ${leftover.length} skill(s) under old names. Run \`work-chronicler skills install --tool ${toolKey}\` to migrate it.`,
            ),
          );
        }
      }

      console.log(
        chalk.cyan(`\nDone! Installed ${totalInstalled} skill(s) (${method}).`),
      );

      if (failures.length > 0) {
        throw new CliError(
          chalk.red(
            `Some skills could not be installed or migrated; old names were kept where their replacement is missing:\n${failures.map((text) => `  ${text}`).join('\n')}`,
          ),
        );
      }

      if (totalInstalled > 0) {
        console.log(chalk.dim('\nSkills are now available in your AI tools.'));
        console.log(
          chalk.dim(
            'Restart your AI tool if it was running, then use /work-chronicler-summarize-work (or similar).',
          ),
        );
      }
    });
}

export const installSubcommand = createInstallSubcommand();
