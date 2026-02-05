import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import { AI_TOOLS, type AIToolKey, SKILL_PREFIX } from './types';

function getInstalledSkills(
  toolKey: AIToolKey,
): { name: string; isSymlink: boolean }[] {
  const tool = AI_TOOLS[toolKey];
  const skillsPath = join(homedir(), tool.configDir, tool.skillsDir);

  if (!existsSync(skillsPath)) {
    return [];
  }

  try {
    const entries = readdirSync(skillsPath, { withFileTypes: true });
    return entries
      .filter(
        (entry) => entry.isDirectory() && entry.name.startsWith(SKILL_PREFIX),
      )
      .map((entry) => ({
        name: entry.name,
        isSymlink: lstatSync(join(skillsPath, entry.name)).isSymbolicLink(),
      }));
  } catch {
    return [];
  }
}

export const listSubcommand = new Command('list')
  .description('Show where work-chronicler skills are installed')
  .action(() => {
    console.log(chalk.cyan('\nInstalled skills:\n'));

    let anyInstalled = false;

    for (const [key, tool] of Object.entries(AI_TOOLS)) {
      const skills = getInstalledSkills(key as AIToolKey);

      console.log(
        chalk.bold(`${tool.name} (~/${tool.configDir}/${tool.skillsDir}/):`),
      );

      if (skills.length === 0) {
        console.log(chalk.dim('  (not installed)\n'));
      } else {
        anyInstalled = true;
        for (const skill of skills) {
          const suffix = skill.isSymlink ? chalk.dim(' (symlinked)') : '';
          console.log(chalk.green(`  ✓ ${skill.name}${suffix}`));
        }
        console.log();
      }
    }

    if (!anyInstalled) {
      console.log(
        chalk.yellow(
          "No skills installed. Run 'work-chronicler skills install' to install.",
        ),
      );
    }
  });
