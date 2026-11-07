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

import { CliError } from '@cli/errors';
import { checkbox, confirm, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command, Option } from 'commander';

import { findInstalledSkills, isPathOccupied } from './installed';
import {
  findRenamedSkills,
  planRenamedSkillRemoval,
  removeRenamedSkill,
  type RenamedSkillEntry,
} from './migrate';
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

/**
 * Skills about to be installed that already exist at the target. Broken
 * symlinks are excluded: they are always replaced, so they never need an
 * overwrite prompt. Old-name skills are not conflicts; the rename migration
 * handles them.
 */
function getConflictingSkills(toolKey: AIToolKey, skills: string[]): string[] {
  const wanted = new Set(skills);
  return findInstalledSkills(getSkillsDir(toolKey))
    .filter((skill) => !skill.isBroken && wanted.has(skill.name))
    .map((skill) => skill.name);
}

/**
 * Install skills to a target tool. A skill that fails to install is
 * reported in `failed` and removed again, so it never looks installed.
 */
function installSkills(
  toolKey: AIToolKey,
  skills: string[],
  method: InstallMethod,
  overwrite: boolean,
): { installed: number; skipped: number; failed: string[] } {
  const sourceDir = getSourceSkillsDir();
  const targetDir = getSkillsDir(toolKey);

  let installed = 0;
  let skipped = 0;
  const failed: string[] = [];

  try {
    mkdirSync(targetDir, { recursive: true });
  } catch (error) {
    return {
      installed,
      skipped,
      failed: skills.map((skill) => `${skill}: ${errorMessage(error)}`),
    };
  }

  const broken = new Set(
    findInstalledSkills(targetDir)
      .filter((skill) => skill.isBroken)
      .map((skill) => skill.name),
  );

  for (const skill of skills) {
    const sourcePath = join(sourceDir, skill);
    const targetPath = join(targetDir, skill);

    try {
      if (isPathOccupied(targetPath)) {
        if (overwrite || broken.has(skill)) {
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
    } catch (error) {
      failed.push(`${skill}: ${errorMessage(error)}`);
      rmSync(targetPath, { recursive: true, force: true });
    }
  }

  return { installed, skipped, failed };
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
  const { removable, blocked } = planRenamedSkillRemoval(skillsDir);

  if (blocked.length > 0) {
    console.log(
      chalk.yellow(
        `  Kept ${blocked.length} old-name skill(s) in ${tool.name}: the new name is missing or its SKILL.md does not declare that name.\n${formatRenames(blocked)}\n  Re-run with --overwrite to replace what occupies the new name.`,
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

export const installSubcommand = new Command('install')
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
    'never prompt: use detected tools, copy, keep existing skills and remove old names',
  )
  .option(
    '--overwrite',
    'replace existing skills with the same name without asking',
  )
  .option('--keep-old', 'keep skills installed under old names without asking')
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
      const conflicts = getConflictingSkills(toolKey, availableSkills);

      let overwrite = conflicts.length === 0 || options.overwrite === true;
      if (!overwrite) {
        console.log(
          chalk.yellow(
            `\n${tool.name} already has ${conflicts.length} work-chronicler skill(s).`,
          ),
        );
        overwrite = options.yes
          ? false
          : await confirm({
              message: 'Overwrite existing skills?',
              default: false,
            });
      }

      const result = installSkills(toolKey, availableSkills, method, overwrite);
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
