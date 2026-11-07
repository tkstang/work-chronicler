import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { SKILL_PREFIX } from './types';

export interface InstalledSkill {
  name: string;
  isSymlink: boolean;
  /** A symlink whose target is gone, e.g. one created before 0.4 moved the packaged skills from `.agent/skills` to `.agents/skills`. */
  isBroken: boolean;
}

/**
 * List work-chronicler skills in a tool's skills directory.
 *
 * Symlinks are included even when their target no longer exists, so that
 * `list`, `install` and `uninstall` can see and repair stale links instead of
 * treating the slot as empty.
 */
export function findInstalledSkills(skillsPath: string): InstalledSkill[] {
  if (!existsSync(skillsPath)) {
    return [];
  }

  try {
    return readdirSync(skillsPath, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.name.startsWith(SKILL_PREFIX) &&
          (entry.isDirectory() || entry.isSymbolicLink()),
      )
      .map((entry) => {
        const isSymlink = entry.isSymbolicLink();
        return {
          name: entry.name,
          isSymlink,
          isBroken: isSymlink && !existsSync(join(skillsPath, entry.name)),
        };
      });
  } catch {
    return [];
  }
}

/**
 * Whether anything (including a dangling symlink) occupies a path.
 * `existsSync` follows symlinks and reports dangling ones as absent.
 */
export function isPathOccupied(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}
