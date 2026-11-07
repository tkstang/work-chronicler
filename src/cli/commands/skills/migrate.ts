import {
  existsSync,
  lstatSync,
  readFileSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';

import { RENAMED_SKILLS } from './types';

/**
 * How an old-name skill sits in a tool's skills directory.
 *
 * - `copy`: a directory (or file) installed with the copy method
 * - `symlink`: a link whose target still exists
 * - `dangling-symlink`: a link whose target is gone, e.g. after the package
 *   that provided it was upgraded or removed
 */
export type RenamedSkillKind = 'copy' | 'symlink' | 'dangling-symlink';

export interface RenamedSkillEntry {
  oldName: string;
  newName: string;
  kind: RenamedSkillKind;
}

/**
 * Find old-name skills in a tool's skills directory.
 *
 * Only names in {@link RENAMED_SKILLS} are reported; nothing else in the
 * directory is considered. `lstat` is used so dangling symlinks are seen.
 */
export function findRenamedSkills(skillsDir: string): RenamedSkillEntry[] {
  const entries: RenamedSkillEntry[] = [];
  for (const [oldName, newName] of Object.entries(RENAMED_SKILLS)) {
    const path = join(skillsDir, oldName);
    let isSymlink: boolean;
    try {
      isSymlink = lstatSync(path).isSymbolicLink();
    } catch {
      continue;
    }
    const kind: RenamedSkillKind = !isSymlink
      ? 'copy'
      : existsSync(path)
        ? 'symlink'
        : 'dangling-symlink';
    entries.push({ oldName, newName, kind });
  }
  return entries;
}

/**
 * Whether `<skillsDir>/<name>` is a usable install of the named skill: its
 * `SKILL.md` resolves (following symlinks) and its frontmatter `name` matches.
 * An unrelated directory that happens to occupy the path does not count.
 */
export function isVerifiedSkill(skillsDir: string, name: string): boolean {
  try {
    const content = readFileSync(join(skillsDir, name, 'SKILL.md'), 'utf8');
    const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)?.[1];
    const declared = frontmatter
      ?.split(/\r?\n/)
      .map((line) => /^name:\s*['"]?([^'"]+?)['"]?\s*$/.exec(line)?.[1])
      .find((value) => value !== undefined);
    return declared === name;
  } catch {
    return false;
  }
}

/**
 * Split a tool's old-name skills into those whose replacement is installed
 * and verified (safe to remove) and those whose replacement is not.
 */
export function planRenamedSkillRemoval(skillsDir: string): {
  removable: RenamedSkillEntry[];
  blocked: RenamedSkillEntry[];
} {
  const removable: RenamedSkillEntry[] = [];
  const blocked: RenamedSkillEntry[] = [];
  for (const entry of findRenamedSkills(skillsDir)) {
    (isVerifiedSkill(skillsDir, entry.newName) ? removable : blocked).push(
      entry,
    );
  }
  return { removable, blocked };
}

/**
 * Remove one old-name entry. Symlinks (live or dangling) are unlinked, so
 * their targets are never touched; copies are deleted recursively.
 */
export function removeRenamedSkill(
  skillsDir: string,
  entry: RenamedSkillEntry,
): void {
  const path = join(skillsDir, entry.oldName);
  if (entry.kind === 'copy') {
    rmSync(path, { recursive: true });
  } else {
    unlinkSync(path);
  }
}
