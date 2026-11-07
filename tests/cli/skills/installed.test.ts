import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  findInstalledSkills,
  isPathOccupied,
} from '../../../src/cli/commands/skills/installed';

describe('installed skill discovery', () => {
  let root: string;
  let skillsDir: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wc-skills-'));
    skillsDir = join(root, 'skills');
    mkdirSync(skillsDir);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // Symlink installs made before 0.4 point into the removed `.agent/skills`
  // directory. They must stay visible so list/install/uninstall can repair
  // or remove them instead of failing with EEXIST.
  it('reports copies, live symlinks and dangling symlinks', () => {
    const liveTarget = join(root, 'package', 'work-chronicler-live');
    mkdirSync(liveTarget, { recursive: true });

    mkdirSync(join(skillsDir, 'work-chronicler-copied'));
    symlinkSync(liveTarget, join(skillsDir, 'work-chronicler-live'), 'dir');
    symlinkSync(
      join(root, '.agent', 'skills', 'work-chronicler-legacy'),
      join(skillsDir, 'work-chronicler-legacy'),
      'dir',
    );
    mkdirSync(join(skillsDir, 'someone-elses-skill'));

    const found = findInstalledSkills(skillsDir).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    expect(found).toEqual([
      { name: 'work-chronicler-copied', isSymlink: false, isBroken: false },
      { name: 'work-chronicler-legacy', isSymlink: true, isBroken: true },
      { name: 'work-chronicler-live', isSymlink: true, isBroken: false },
    ]);
  });

  it('treats a dangling symlink as occupying its path', () => {
    const link = join(skillsDir, 'work-chronicler-legacy');
    symlinkSync(join(root, 'missing'), link, 'dir');

    expect(isPathOccupied(link)).toBe(true);
    expect(isPathOccupied(join(skillsDir, 'work-chronicler-absent'))).toBe(
      false,
    );
  });
});
