import { existsSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { checkbox, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import { AI_TOOLS, type AIToolKey, SKILL_PREFIX } from './types';

/**
 * Get installed work-chronicler skills for a tool
 */
function getInstalledSkills(toolKey: AIToolKey): string[] {
  const tool = AI_TOOLS[toolKey];
  const skillsPath = join(homedir(), tool.configDir, tool.skillsDir);

  if (!existsSync(skillsPath)) {
    return [];
  }

  try {
    return readdirSync(skillsPath, { withFileTypes: true })
      .filter(
        (entry) => entry.isDirectory() && entry.name.startsWith(SKILL_PREFIX),
      )
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

/**
 * Remove skills from a tool
 */
function removeSkills(toolKey: AIToolKey): number {
  const tool = AI_TOOLS[toolKey];
  const skillsPath = join(homedir(), tool.configDir, tool.skillsDir);
  const skills = getInstalledSkills(toolKey);

  let removed = 0;
  for (const skill of skills) {
    const skillPath = join(skillsPath, skill);
    try {
      rmSync(skillPath, { recursive: true, force: true });
      removed++;
    } catch {
      // Skip if removal fails
    }
  }

  return removed;
}

export const uninstallSubcommand = new Command('uninstall')
  .description('Remove work-chronicler skills from AI tools')
  .action(async () => {
    // Find tools with installed skills
    const toolsWithSkills: { key: AIToolKey; count: number }[] = [];

    for (const key of Object.keys(AI_TOOLS) as AIToolKey[]) {
      const skills = getInstalledSkills(key);
      if (skills.length > 0) {
        toolsWithSkills.push({ key, count: skills.length });
      }
    }

    if (toolsWithSkills.length === 0) {
      console.log(chalk.yellow('\nNo work-chronicler skills are installed.'));
      return;
    }

    console.log(
      chalk.cyan('\nFound work-chronicler skills in the following tools:\n'),
    );

    // Select tools to uninstall from
    const choices = toolsWithSkills.map(({ key, count }) => ({
      name: `${AI_TOOLS[key].name} (${count} skill${count > 1 ? 's' : ''})`,
      value: key,
      checked: true,
    }));

    const selectedTools = await checkbox({
      message: 'Select tools to remove skills from:',
      choices,
    });

    if (selectedTools.length === 0) {
      console.log(chalk.yellow('No tools selected. Exiting.'));
      return;
    }

    // Confirm
    const totalSkills = selectedTools.reduce((sum, key) => {
      const found = toolsWithSkills.find((t) => t.key === key);
      return sum + (found?.count ?? 0);
    }, 0);

    const confirmed = await confirm({
      message: `Remove ${totalSkills} skill(s) from ${selectedTools.length} tool(s)?`,
      default: false,
    });

    if (!confirmed) {
      console.log(chalk.yellow('Cancelled.'));
      return;
    }

    // Remove skills
    let totalRemoved = 0;
    for (const toolKey of selectedTools) {
      const removed = removeSkills(toolKey);
      totalRemoved += removed;
      console.log(
        chalk.green(
          `✓ Removed ${removed} skill(s) from ${AI_TOOLS[toolKey].name}`,
        ),
      );
    }

    console.log(chalk.cyan(`\nDone! Removed ${totalRemoved} skill(s).`));
  });
