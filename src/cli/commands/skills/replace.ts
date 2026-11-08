import { randomBytes } from 'node:crypto';
import { cpSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import {
  type FsEntry,
  type ImportFs,
  nodeImportFs,
} from '@core/import/import-fs';

import { declaredSkillName } from './migrate';
import type { InstallMethod } from './types';

/**
 * The filesystem operations `skills install` uses to put a skill in place:
 * the import engine's filesystem seam, plus copying a tree and creating a
 * link. Tests inject failures through it instead of relying on permissions.
 */
export interface SkillInstallFs extends Pick<
  ImportFs,
  'lstat' | 'readdir' | 'readFile' | 'rename' | 'unlink' | 'removeTree'
> {
  /** Copy a directory tree to a path that does not exist yet */
  copyTree: (from: string, to: string) => void;
  /** Create a directory symlink at `path` that points to `target` */
  symlink: (target: string, path: string) => void;
}

export const nodeSkillInstallFs: SkillInstallFs = {
  lstat: nodeImportFs.lstat,
  readdir: nodeImportFs.readdir,
  readFile: nodeImportFs.readFile,
  rename: nodeImportFs.rename,
  unlink: nodeImportFs.unlink,
  removeTree: nodeImportFs.removeTree,
  copyTree: (from, to) =>
    cpSync(from, to, { recursive: true, errorOnExist: true, force: false }),
  symlink: (target, path) => symlinkSync(target, path, 'dir'),
};

/** Upper bound on the size of a `SKILL.md` read to check its name */
const MAX_SKILL_FILE_BYTES = 1024 * 1024;

const STAGING = 'staging';
const BACKUP = 'backup';

/** Name of a temporary entry beside a skill (hidden, so never listed as a skill) */
function sideName(skill: string, role: string, id: string): string {
  return `.${skill}.wc-${role}-${id}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function errorCode(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

/** What is at `path`, null only when it is proven absent (ENOENT) */
function entryAt(fs: SkillInstallFs, path: string): FsEntry | null {
  try {
    return fs.lstat(path);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  }
}

/** Whether `<dir>/SKILL.md` declares `name` */
function declaresSkill(fs: SkillInstallFs, dir: string, name: string): boolean {
  try {
    const { data } = fs.readFile(join(dir, 'SKILL.md'), MAX_SKILL_FILE_BYTES);
    return declaredSkillName(data.toString('utf8')) === name;
  } catch {
    return false;
  }
}

/** Remove an entry without following it: a link or file is unlinked */
function removeEntry(fs: SkillInstallFs, path: string, kind: FsEntry['kind']) {
  if (kind === 'directory') fs.removeTree(path);
  else fs.unlink(path);
}

/**
 * The name the existing entry has on disk. On a case-insensitive volume
 * `skill` can reach an entry spelled differently; putting it back restores
 * that spelling.
 */
function onDiskName(
  fs: SkillInstallFs,
  dir: string,
  skill: string,
  existing: FsEntry,
): string {
  try {
    const names = fs.readdir(dir);
    if (names.includes(skill)) return skill;
    for (const name of names) {
      if (name.toLowerCase() !== skill.toLowerCase()) continue;
      const entry = entryAt(fs, join(dir, name));
      if (entry?.dev === existing.dev && entry.ino === existing.ino)
        return name;
    }
  } catch {
    // Fall back to the requested spelling
  }
  return skill;
}

export interface ReplaceSkillRequest {
  fs: SkillInstallFs;
  /** The packaged skill directory */
  sourcePath: string;
  /** The tool's skills directory */
  skillsDir: string;
  skill: string;
  method: InstallMethod;
  /** A short random string for unique temporary names */
  randomId?: () => string;
}

export type ReplaceSkillResult =
  | { installed: true; warnings: string[] }
  | { installed: false; error: string; warnings: string[] };

/**
 * Install one skill at `<skillsDir>/<skill>`, replacing whatever is there.
 *
 * The skill is first staged beside the destination (a copy, or a link for
 * the symlink method) and its `SKILL.md` must declare the skill's name.
 * Only then is the existing entry renamed aside and the staged one renamed
 * into place. The previous entry is removed only after the installed one is
 * checked again in place; any failure before that puts the previous entry
 * back, so a failed install never loses it. Links are unlinked, never
 * followed. A failure to remove a temporary or replaced entry is returned as
 * a warning naming where it was left; it never fails the install.
 */
export function replaceSkill(request: ReplaceSkillRequest): ReplaceSkillResult {
  const { fs, sourcePath, skillsDir, skill, method } = request;
  const id = (request.randomId ?? (() => randomBytes(8).toString('hex')))();
  const target = join(skillsDir, skill);
  const staging = join(skillsDir, sideName(skill, STAGING, id));
  const backup = join(skillsDir, sideName(skill, BACKUP, id));
  const warnings: string[] = [];

  const failed = (error: string): ReplaceSkillResult => ({
    installed: false,
    error,
    warnings,
  });

  const removeStaging = (kind: FsEntry['kind']) => {
    try {
      removeEntry(fs, staging, kind);
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return;
      warnings.push(
        `${skill}: a temporary copy could not be removed and is left at ${staging} (${errorMessage(error)}); remove it yourself`,
      );
    }
  };

  const stagedKind: FsEntry['kind'] =
    method === 'symlink' ? 'symlink' : 'directory';

  let existing: FsEntry | null;
  try {
    existing = entryAt(fs, target);
  } catch (error) {
    return failed(`cannot check ${target}: ${errorMessage(error)}`);
  }
  const kept = existing ? '; the previous install was kept' : '';

  // Stage and verify
  try {
    if (method === 'symlink') fs.symlink(sourcePath, staging);
    else fs.copyTree(sourcePath, staging);
    if (!declaresSkill(fs, staging, skill)) {
      throw new Error(`the staged SKILL.md does not declare ${skill}`);
    }
  } catch (error) {
    removeStaging(stagedKind);
    return failed(`${errorMessage(error)}${kept}`);
  }

  // Swap: move the existing entry aside, then put the staged one in place
  const restorePath = existing
    ? join(skillsDir, onDiskName(fs, skillsDir, skill, existing))
    : target;
  let movedAside = false;

  /** Put a moved-aside entry back and report why the install failed */
  const restore = (cause: string): ReplaceSkillResult => {
    if (movedAside) {
      try {
        fs.rename(backup, restorePath);
      } catch (error) {
        return failed(
          `${cause}; the previous install could not be put back and is kept at ${backup} (${errorMessage(error)}); move it to ${restorePath}`,
        );
      }
    }
    return failed(`${cause}${kept}`);
  };

  try {
    if (existing) {
      fs.rename(target, backup);
      movedAside = true;
    }
    fs.rename(staging, target);
  } catch (error) {
    const result = restore(errorMessage(error));
    removeStaging(stagedKind);
    return result;
  }

  // Check the installed entry in place before removing the previous one
  if (!declaresSkill(fs, target, skill)) {
    const cause = `the installed SKILL.md at ${target} does not declare ${skill}`;
    try {
      fs.rename(target, staging);
    } catch (error) {
      return failed(
        `${cause}, and it could not be moved out (${errorMessage(error)})${movedAside ? `; the previous install is kept at ${backup}` : ''}`,
      );
    }
    const result = restore(cause);
    removeStaging(stagedKind);
    return result;
  }

  if (existing && movedAside) {
    try {
      removeEntry(fs, backup, existing.kind);
    } catch (error) {
      warnings.push(
        `${skill}: installed, but the replaced entry could not be removed and is left at ${backup} (${errorMessage(error)}); remove it yourself`,
      );
    }
  }
  return { installed: true, warnings };
}
