import { homedir } from 'node:os';
import { join } from 'node:path';

import chalk from 'chalk';
import { Command } from 'commander';

import { findInstalledSkills, type InstalledSkill } from './installed';
import { AI_TOOLS, type AIToolKey, RENAMED_SKILLS } from './types';

function getInstalledSkills(toolKey: AIToolKey): InstalledSkill[] {
  const tool = AI_TOOLS[toolKey];
  return findInstalledSkills(join(homedir(), tool.configDir, tool.skillsDir));
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
          if (skill.isBroken) {
            console.log(
              chalk.yellow(
                `  ✗ ${skill.name} (broken symlink — run \`skills install\` to repair)`,
              ),
            );
            continue;
          }
          const newName = RENAMED_SKILLS[skill.name];
          if (newName !== undefined) {
            console.log(
              chalk.yellow(
                `  ! ${skill.name} (renamed to ${newName} — run \`skills install\` to migrate)`,
              ),
            );
            continue;
          }
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
