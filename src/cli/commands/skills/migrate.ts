import {
  existsSync,
  lstatSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  unlinkSync,
} from 'node:fs';
import { dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';

import { findInstalledSkills } from './installed';
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

/** Upper bound on symlinks followed while resolving one path */
const MAX_SYMLINKS = 40;

/**
 * Every filesystem location visited while resolving `path`: each symlink
 * on the way (where the link itself sits) and each real directory or file
 * reached, all with their parent directories already resolved. Returns null
 * when the path does not resolve.
 */
function resolutionTrail(path: string): string[] | null {
  const trail: string[] = [];
  const absolute = resolve(path);
  let current = parse(absolute).root;
  let pending = absolute.slice(current.length).split(/[\\/]+/);
  let links = 0;

  while (pending.length > 0) {
    const part = pending.shift() as string;
    if (part === '' || part === '.') continue;
    if (part === '..') {
      current = dirname(current);
      continue;
    }
    const next = join(current, part);
    let isSymlink: boolean;
    try {
      isSymlink = lstatSync(next).isSymbolicLink();
    } catch {
      return null;
    }
    trail.push(next);
    if (!isSymlink) {
      current = next;
      continue;
    }
    if (++links > MAX_SYMLINKS) return null;
    const target = readlinkSync(next);
    if (isAbsolute(target)) current = parse(target).root;
    pending = [
      ...target.slice(parse(target).root.length).split(/[\\/]+/),
      ...pending,
    ];
  }
  return trail;
}

/**
 * Where an old-name entry really sits: its parent resolved, the entry itself
 * not followed. Removing the entry deletes this location (and, for a copy,
 * everything under it); a symlink's target is never part of it.
 */
function entryLocation(skillsDir: string, name: string): string {
  return join(realpathSync(skillsDir), name);
}

function isAtOrUnder(path: string, location: string): boolean {
  return path === location || path.startsWith(location + sep);
}

/**
 * Split a tool's old-name skills into those safe to remove and those to keep.
 *
 * - `removable`: the replacement is installed and verified, and no other
 *   installed skill resolves into the old entry
 * - `blocked`: the replacement is missing or not a verified install
 * - `dependent`: the replacement is verified, but a skill installed under
 *   another name (typically the replacement, symlinked to the old copy)
 *   resolves into the old entry, so removing it would break that skill
 */
export function planRenamedSkillRemoval(skillsDir: string): {
  removable: RenamedSkillEntry[];
  blocked: RenamedSkillEntry[];
  dependent: RenamedSkillEntry[];
} {
  const removable: RenamedSkillEntry[] = [];
  const blocked: RenamedSkillEntry[] = [];
  const dependent: RenamedSkillEntry[] = [];
  const entries = findRenamedSkills(skillsDir);
  if (entries.length === 0) return { removable, blocked, dependent };

  // Every location the other installed skills rely on
  const relied = findInstalledSkills(skillsDir)
    .filter((skill) => !(skill.name in RENAMED_SKILLS))
    .flatMap(
      (skill) => resolutionTrail(join(skillsDir, skill.name, 'SKILL.md')) ?? [],
    );

  for (const entry of entries) {
    if (!isVerifiedSkill(skillsDir, entry.newName)) {
      blocked.push(entry);
      continue;
    }
    const location = entryLocation(skillsDir, entry.oldName);
    (relied.some((path) => isAtOrUnder(path, location))
      ? dependent
      : removable
    ).push(entry);
  }
  return { removable, blocked, dependent };
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
