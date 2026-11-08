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

/** The packaged skill being put in place */
const STAGING = 'staging';
/** The previous entry, moved aside while the swap is in progress */
const BACKUP = 'backup';
/** The previous entry after the new one checked out in place: being deleted */
const REPLACED = 'replaced';

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
 * checked again in place (it is first renamed to a `replaced` name, which
 * recovery never puts back); any failure before that puts the previous
 * entry back, so a failed install never loses it. Links are unlinked, never
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
    // Renamed out of the backup role first, so a deletion that stops
    // part-way never leaves something recovery would put back
    const replaced = join(skillsDir, sideName(skill, REPLACED, id));
    let doomed = backup;
    try {
      fs.rename(backup, replaced);
      doomed = replaced;
      removeEntry(fs, replaced, existing.kind);
    } catch (error) {
      warnings.push(
        `${skill}: installed, but the replaced entry could not be removed and is left at ${doomed} (${errorMessage(error)}); remove it yourself`,
      );
    }
  }
  return { installed: true, warnings };
}

/** Escape a string for use inside a regular expression */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface InterruptedReplacementReport {
  /** What was put back */
  restored: string[];
  /** Leftovers that need the user's attention */
  warnings: string[];
}

/**
 * Clean up after a `skills install` that stopped part-way through
 * replacing a skill (a crash or a kill between its steps).
 *
 * Staged entries are removed: they only ever hold a packaged skill. So are
 * replaced entries, which were already superseded by a new install that
 * checked out in place. An entry moved aside mid-swap is put back when
 * nothing is at the skill's name, it is the only one, and its `SKILL.md`
 * still declares the skill; otherwise it is left where it is and named,
 * since it may be the only copy of the user's skill.
 */
export function recoverInterruptedReplacements(
  fs: SkillInstallFs,
  skillsDir: string,
  skills: string[],
): InterruptedReplacementReport {
  const report: InterruptedReplacementReport = { restored: [], warnings: [] };
  let names: string[];
  try {
    names = fs.readdir(skillsDir);
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') {
      report.warnings.push(
        `could not check ${skillsDir} for an interrupted install (${errorMessage(error)})`,
      );
    }
    return report;
  }

  for (const skill of skills) {
    const pattern = new RegExp(
      `^\\.${escapeRegExp(skill)}\\.wc-(${STAGING}|${BACKUP}|${REPLACED})-[0-9a-f]{16}$`,
    );
    const disposable: string[] = [];
    const backups: string[] = [];
    for (const name of names) {
      const role = pattern.exec(name)?.[1];
      if (role === STAGING || role === REPLACED) {
        disposable.push(join(skillsDir, name));
      } else if (role === BACKUP) {
        backups.push(join(skillsDir, name));
      }
    }

    for (const path of disposable) {
      try {
        const entry = entryAt(fs, path);
        if (entry) removeEntry(fs, path, entry.kind);
      } catch (error) {
        report.warnings.push(
          `${skill}: a leftover from an earlier install could not be removed and is left at ${path} (${errorMessage(error)}); remove it yourself`,
        );
      }
    }

    if (backups.length === 0) continue;
    const target = join(skillsDir, skill);
    let free = false;
    try {
      free = entryAt(fs, target) === null;
    } catch {
      // Unknown counts as occupied: never put something over it
    }
    const [only] = backups;
    if (free && backups.length === 1 && only !== undefined) {
      if (!declaresSkill(fs, only, skill)) {
        report.warnings.push(
          `${skill}: an interrupted install left an entry at ${only} that is not a working copy of the skill, so it was not put back; remove it once you no longer need it`,
        );
        continue;
      }
      try {
        fs.rename(only, target);
        report.restored.push(skill);
      } catch (error) {
        report.warnings.push(
          `${skill}: an interrupted install left the previous install at ${only} and it could not be put back (${errorMessage(error)}); move it to ${target}`,
        );
      }
      continue;
    }
    for (const path of backups) {
      report.warnings.push(
        `${skill}: an interrupted install left a replaced entry at ${path}; remove it once you no longer need it`,
      );
    }
  }
  return report;
}
