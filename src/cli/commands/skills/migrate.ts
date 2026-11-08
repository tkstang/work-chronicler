import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
} from 'node:fs';
import { dirname, isAbsolute, join, parse, resolve, sep } from 'node:path';

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

/** Path separators: a backslash is an ordinary file-name character on POSIX */
const SEPARATORS = process.platform === 'win32' ? /[\\/]+/ : /\/+/;

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
  let pending = absolute.slice(current.length).split(SEPARATORS);
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
      ...target.slice(parse(target).root.length).split(SEPARATORS),
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

/** The filesystem object at `path` itself (a link is not followed), or null */
function fileIdentity(path: string): string | null {
  try {
    const stat = lstatSync(path);
    return `${stat.dev}:${stat.ino}`;
  } catch {
    return null;
  }
}

/**
 * Whether `path` is `location` or sits under it. Paths are compared as text
 * and also by filesystem identity, so a differently cased spelling of the
 * same location on a case-insensitive volume still matches.
 */
function isAtOrUnder(
  path: string,
  location: string,
  locationIdentity: string | null,
): boolean {
  if (path === location || path.startsWith(location + sep)) return true;
  if (locationIdentity === null) return false;
  for (let current = path; ; current = dirname(current)) {
    if (fileIdentity(current) === locationIdentity) return true;
    if (dirname(current) === current) return false;
  }
}

/** Upper bound on files and directories visited inside one entry */
const MAX_NESTED_ENTRIES = 10_000;

/**
 * The resolution trails of every symlink nested anywhere inside `path` (a
 * skill's `scripts/` or `references/` linked elsewhere, for example).
 * Linked directories are walked too, each real directory once. Returns null
 * when part of the tree cannot be read or it is too large to check.
 */
function nestedLinkTrails(path: string): string[] | null {
  const trails: string[] = [];
  const visited = new Set<string>();
  let budget = MAX_NESTED_ENTRIES;

  const walk = (dir: string): boolean => {
    let real: string;
    try {
      real = realpathSync(dir);
    } catch (error) {
      // Only a target proven missing has nothing below it; a permission or
      // other failure leaves the scan incomplete
      const code = (error as NodeJS.ErrnoException).code;
      return code === 'ENOENT' || code === 'ENOTDIR';
    }
    if (visited.has(real)) return true;
    visited.add(real);
    let names: string[];
    try {
      if (!statSync(real).isDirectory()) return true;
      names = readdirSync(real);
    } catch {
      return false;
    }
    for (const name of names) {
      if (--budget < 0) return false;
      const child = join(dir, name);
      let isSymlink: boolean;
      let isDirectory: boolean;
      try {
        const stat = lstatSync(child);
        isSymlink = stat.isSymbolicLink();
        isDirectory = stat.isDirectory();
      } catch {
        return false;
      }
      if (isSymlink) trails.push(...(resolutionTrail(child) ?? []));
      if ((isSymlink || isDirectory) && !walk(child)) return false;
    }
    return true;
  };

  return walk(path) ? trails : null;
}

/** An old-name entry kept because other installed entries resolve into it */
export interface DependentRenamedSkillEntry extends RenamedSkillEntry {
  /** Paths of the entries that resolve into the old entry */
  usedBy: string[];
}

interface InventoryEntry {
  path: string;
  location: string;
  /** Every location the entry's resolution passes through */
  trail: string[];
  /** Part of the entry could not be read, so its links are not all known */
  unchecked: boolean;
}

/**
 * Every entry in the given skills directories, whatever its name, with the
 * locations its resolution passes through: the entry itself, its
 * `SKILL.md`, and every symlink nested inside it. Directories that do not
 * exist are skipped; one that cannot be read is listed as a single entry
 * that is not fully checked.
 */
function inventoryEntries(dirs: string[]): InventoryEntry[] {
  const seen = new Set<string>();
  const inventory: InventoryEntry[] = [];
  for (const dir of dirs) {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch (error) {
      // A tool that is not installed has no entries. A directory that exists
      // but cannot be read may hide entries that depend on an old copy.
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT' && code !== 'ENOTDIR') {
        inventory.push({
          path: dir,
          location: dir,
          trail: [],
          unchecked: true,
        });
      }
      continue;
    }
    for (const name of names) {
      const location = entryLocation(dir, name);
      // Two tools can share one directory through a symlink
      if (seen.has(location)) continue;
      seen.add(location);
      const path = join(dir, name);
      const nested = nestedLinkTrails(path);
      inventory.push({
        path,
        location,
        trail: [
          ...(resolutionTrail(path) ?? []),
          ...(resolutionTrail(join(path, 'SKILL.md')) ?? []),
          ...(nested ?? []),
        ],
        unchecked: nested === null,
      });
    }
  }
  return inventory;
}

/**
 * Split a tool's old-name skills into those safe to remove and those to keep.
 *
 * - `removable`: the replacement is installed and verified, and nothing else
 *   in any inventoried skills directory resolves into the old entry
 * - `blocked`: the replacement is missing or not a verified install
 * - `dependent`: the replacement is verified, but another entry, in this
 *   tool or another one (typically a new-name symlink to the old copy, or a
 *   link nested inside a skill), resolves into the old entry, so removing it
 *   would break that entry. An entry that cannot be fully read counts too.
 *
 * @param inventoryDirs - Every known tool's skills directory, selected or
 *   not, so that removal never breaks another tool's installation
 */
export function planRenamedSkillRemoval(
  skillsDir: string,
  inventoryDirs: string[],
): {
  removable: RenamedSkillEntry[];
  blocked: RenamedSkillEntry[];
  dependent: DependentRenamedSkillEntry[];
} {
  const removable: RenamedSkillEntry[] = [];
  const blocked: RenamedSkillEntry[] = [];
  const dependent: DependentRenamedSkillEntry[] = [];
  const entries = findRenamedSkills(skillsDir);
  if (entries.length === 0) return { removable, blocked, dependent };

  const inventory = inventoryEntries([skillsDir, ...inventoryDirs]);

  for (const entry of entries) {
    if (!isVerifiedSkill(skillsDir, entry.newName)) {
      blocked.push(entry);
      continue;
    }
    const location = entryLocation(skillsDir, entry.oldName);
    const locationIdentity = fileIdentity(location);
    // An entry that could not be fully checked might depend on the old one
    const usedBy = inventory
      .filter(
        (other) =>
          other.location !== location &&
          (other.unchecked ||
            other.trail.some((path) =>
              isAtOrUnder(path, location, locationIdentity),
            )),
      )
      .map((other) =>
        other.unchecked
          ? `${other.path} (could not be fully checked)`
          : other.path,
      );
    if (usedBy.length > 0) {
      dependent.push({ ...entry, usedBy });
    } else {
      removable.push(entry);
    }
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
