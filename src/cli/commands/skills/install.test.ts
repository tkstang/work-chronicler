import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Scripted answers keyed by prompt message; any other prompt fails the test.
const prompts = vi.hoisted(() => {
  const answers = new Map<string, unknown[]>();
  const answer = async (options: { message: string }) => {
    const queue = answers.get(options.message);
    if (!queue?.length) {
      throw new Error(`Unexpected prompt: ${options.message}`);
    }
    return queue.shift();
  };
  return { answers, answer };
});

vi.mock('@inquirer/prompts', () => ({
  checkbox: prompts.answer,
  confirm: prompts.answer,
  select: prompts.answer,
}));

const OLD_NAMES = {
  bullets: 'work-chronicler-generate-resume-bullets',
  peer: 'work-chronicler-mgmt-write-peer-review',
  packet: 'work-chronicler-mgmt-write-review-packet',
  highlights: 'work-chronicler-mgmt-quarterly-highlights',
  team: 'work-chronicler-mgmt-team-summary',
};

const NEW_NAMES = {
  bullets: 'work-chronicler-write-resume-bullets',
  peer: 'work-chronicler-write-peer-review',
  packet: 'work-chronicler-manager-write-review-packet',
  highlights: 'work-chronicler-manager-write-quarterly-highlights',
  team: 'work-chronicler-manager-write-team-summary',
};

let root: string;
let home: string;
let logs: string[];

const skillsDir = (tool: string) => join(home, `.${tool}`, 'skills');

/** An old-name skill as an earlier release installed it with the copy method. */
function seedCopy(tool: string, name: string): string {
  const dir = join(skillsDir(tool), name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\n---\nold body\n`);
  return dir;
}

function seedLink(tool: string, name: string, target: string): string {
  mkdirSync(skillsDir(tool), { recursive: true });
  const link = join(skillsDir(tool), name);
  symlinkSync(target, link, 'dir');
  return link;
}

const occupied = (path: string) => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

const installedName = (tool: string, name: string) =>
  /^name: (.+)$/m.exec(
    readFileSync(join(skillsDir(tool), name, 'SKILL.md'), 'utf8'),
  )?.[1];

function script(answers: Record<string, unknown[]>): void {
  prompts.answers.clear();
  for (const [message, queue] of Object.entries(answers)) {
    prompts.answers.set(message, [...queue]);
  }
}

/** Runs before every filesystem operation of a replacement; throw to fail it */
type FsHook = (op: string, args: unknown[]) => void;

/** An error shaped like Node's filesystem errors */
const fsError = (code: string) =>
  Object.assign(new Error(`${code}: injected`), { code });

async function install(
  args: string[],
  hook?: FsHook,
): Promise<{ error?: Error }> {
  const { Command } = await import('commander');
  const { createInstallSubcommand } = await import('./install');
  const { nodeSkillInstallFs } = await import('./replace');
  const fs = Object.fromEntries(
    Object.entries(nodeSkillInstallFs).map(([op, fn]) => [
      op,
      (...opArgs: unknown[]) => {
        hook?.(op, opArgs);
        return (fn as (...a: unknown[]) => unknown)(...opArgs);
      },
    ]),
  ) as unknown as typeof nodeSkillInstallFs;
  const program = new Command('skills')
    .exitOverride()
    .addCommand(createInstallSubcommand({ fs }));
  try {
    await program.parseAsync(['install', ...args], { from: 'user' });
    return {};
  } catch (error) {
    return { error: error as Error };
  }
}

const output = () => logs.join('\n');

/** Whether the temporary directory's volume ignores letter case (macOS default) */
const caseInsensitiveTmp = (() => {
  const probe = mkdtempSync(join(tmpdir(), 'wc-case-'));
  try {
    return existsSync(join(dirname(probe), basename(probe).toUpperCase()));
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
})();

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wc-skills-install-'));
  home = join(root, 'home');
  mkdirSync(home);
  vi.stubEnv('HOME', home);
  vi.stubEnv('USERPROFILE', home);
  vi.resetModules();
  script({});
  logs = [];
  vi.spyOn(console, 'log').mockImplementation((...parts: unknown[]) => {
    logs.push(parts.join(' '));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  chmodSync(root, 0o755);
  rmSync(root, { recursive: true, force: true });
});

describe('skills install rename migration', () => {
  it('replaces copied old names on the selected tool and leaves other tools alone', async () => {
    for (const name of Object.values(OLD_NAMES)) seedCopy('claude', name);
    const cursorOld = seedCopy('cursor', OLD_NAMES.team);
    mkdirSync(join(skillsDir('claude'), 'someone-elses-skill'));

    const { error } = await install(['--tool', 'claude', '--yes']);

    expect(error).toBeUndefined();
    for (const key of Object.keys(OLD_NAMES) as (keyof typeof OLD_NAMES)[]) {
      expect(occupied(join(skillsDir('claude'), OLD_NAMES[key]))).toBe(false);
      expect(installedName('claude', NEW_NAMES[key])).toBe(NEW_NAMES[key]);
    }
    expect(existsSync(join(skillsDir('claude'), 'someone-elses-skill'))).toBe(
      true,
    );
    expect(readFileSync(join(cursorOld, 'SKILL.md'), 'utf8')).toContain(
      'old body',
    );
    expect(existsSync(join(skillsDir('cursor'), NEW_NAMES.team))).toBe(false);
    expect(output()).toContain(
      'Cursor was not selected and still has 1 skill(s) under old names',
    );
  });

  it('unlinks live and dangling old symlinks without touching their targets', async () => {
    const oldPackage = join(root, 'old-package', '.agents', 'skills');
    const liveTarget = join(oldPackage, OLD_NAMES.packet);
    mkdirSync(liveTarget, { recursive: true });
    writeFileSync(join(liveTarget, 'SKILL.md'), 'old package skill\n');
    const live = seedLink('codex', OLD_NAMES.packet, liveTarget);
    const dangling = seedLink(
      'codex',
      OLD_NAMES.team,
      join(root, 'removed-package', OLD_NAMES.team),
    );

    const { error } = await install([
      '--tool',
      'codex',
      '--method',
      'symlink',
      '--yes',
    ]);

    expect(error).toBeUndefined();
    expect(occupied(live)).toBe(false);
    expect(occupied(dangling)).toBe(false);
    expect(readFileSync(join(liveTarget, 'SKILL.md'), 'utf8')).toBe(
      'old package skill\n',
    );
    const newLink = join(skillsDir('codex'), NEW_NAMES.packet);
    expect(lstatSync(newLink).isSymbolicLink()).toBe(true);
    expect(readlinkSync(newLink)).toMatch(
      /\.agents[/\\]skills[/\\]work-chronicler-manager-write-review-packet$/,
    );
  });

  it('keeps an old name when overwrite is refused and something else holds the new name', async () => {
    const oldTeam = seedCopy('claude', OLD_NAMES.team);
    const oldPeer = seedCopy('claude', OLD_NAMES.peer);
    const squatter = join(skillsDir('claude'), NEW_NAMES.team);
    mkdirSync(squatter);
    writeFileSync(join(squatter, 'SKILL.md'), '---\nname: my-own-skill\n---\n');

    const { error } = await install(['--tool', 'claude', '--yes']);

    expect(error).toBeUndefined();
    expect(readFileSync(join(squatter, 'SKILL.md'), 'utf8')).toContain(
      'name: my-own-skill',
    );
    expect(existsSync(join(oldTeam, 'SKILL.md'))).toBe(true);
    expect(output()).toContain('Kept 1 old-name skill(s) in Claude Code');
    // The other rename still migrates.
    expect(occupied(oldPeer)).toBe(false);
    expect(installedName('claude', NEW_NAMES.peer)).toBe(NEW_NAMES.peer);
  });

  it('keeps a regular file at a new name and the old name when overwrite is not chosen', async () => {
    const oldBullets = seedCopy('claude', OLD_NAMES.bullets);
    const file = join(skillsDir('claude'), NEW_NAMES.bullets);
    writeFileSync(file, 'USER CONTENT\n');

    const { error } = await install(['--tool', 'claude', '--yes']);

    expect(error).toBeUndefined();
    expect(lstatSync(file).isFile()).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('USER CONTENT\n');
    expect(existsSync(join(oldBullets, 'SKILL.md'))).toBe(true);
    expect(output()).toContain(
      `Claude Code already has something at 1 skill name(s):\n    ${NEW_NAMES.bullets}`,
    );
    expect(output()).toContain('Skipped 1 existing skill(s)');
    expect(output()).toContain('Kept 1 old-name skill(s) in Claude Code');
  });

  it('repairs a broken symlink at a new name without an overwrite decision', async () => {
    const broken = seedLink(
      'claude',
      NEW_NAMES.bullets,
      join(root, 'removed-package', NEW_NAMES.bullets),
    );

    const { error } = await install(['--tool', 'claude', '--yes']);

    expect(error).toBeUndefined();
    expect(lstatSync(broken).isDirectory()).toBe(true);
    expect(installedName('claude', NEW_NAMES.bullets)).toBe(NEW_NAMES.bullets);
    expect(output()).not.toContain('already has something');
  });

  it('replaces what holds the new name and then removes the old name with --overwrite', async () => {
    const oldTeam = seedCopy('claude', OLD_NAMES.team);
    mkdirSync(join(skillsDir('claude'), NEW_NAMES.team));

    const { error } = await install([
      '--tool',
      'claude',
      '--yes',
      '--overwrite',
    ]);

    expect(error).toBeUndefined();
    expect(installedName('claude', NEW_NAMES.team)).toBe(NEW_NAMES.team);
    expect(occupied(oldTeam)).toBe(false);
  });

  describe('a new name already exposed through a symlink', () => {
    /** The old copy, edited to declare the new name and linked to from it. */
    function seedDependentLink(): { oldDir: string; newLink: string } {
      const oldDir = seedCopy('claude', OLD_NAMES.bullets);
      writeFileSync(
        join(oldDir, 'SKILL.md'),
        `---\nname: ${NEW_NAMES.bullets}\n---\nmy edits\n`,
      );
      const newLink = seedLink('claude', NEW_NAMES.bullets, oldDir);
      return { oldDir, newLink };
    }

    it('keeps the old copy the new-name link points into and says why', async () => {
      const { oldDir, newLink } = seedDependentLink();

      const { error } = await install([
        '--tool',
        'claude',
        '--method',
        'copy',
        '--yes',
      ]);

      expect(error).toBeUndefined();
      expect(readFileSync(join(oldDir, 'SKILL.md'), 'utf8')).toContain(
        'my edits',
      );
      expect(lstatSync(newLink).isSymbolicLink()).toBe(true);
      expect(installedName('claude', NEW_NAMES.bullets)).toBe(
        NEW_NAMES.bullets,
      );
      expect(output()).toContain(
        'Kept 1 old-name skill(s) in Claude Code: another installed skill, in this or another tool, resolves into the old entry',
      );
      expect(output()).toContain(`(used by ${newLink})`);
      expect(output()).not.toContain('Removed');
    });

    it('keeps the old copy an unselected tool links into, leaving that tool unchanged', async () => {
      const oldDir = seedCopy('claude', OLD_NAMES.bullets);
      writeFileSync(
        join(oldDir, 'SKILL.md'),
        `---\nname: ${NEW_NAMES.bullets}\n---\nmy edits\n`,
      );
      const codexLink = seedLink('codex', NEW_NAMES.bullets, oldDir);

      const { error } = await install([
        '--tool',
        'claude',
        '--method',
        'copy',
        '--yes',
      ]);

      expect(error).toBeUndefined();
      expect(readFileSync(join(oldDir, 'SKILL.md'), 'utf8')).toContain(
        'my edits',
      );
      expect(readdirSync(skillsDir('codex'))).toEqual([NEW_NAMES.bullets]);
      expect(readlinkSync(codexLink)).toBe(oldDir);
      expect(readFileSync(join(codexLink, 'SKILL.md'), 'utf8')).toContain(
        'my edits',
      );
      // The selected tool still gets its own replacement
      expect(
        lstatSync(join(skillsDir('claude'), NEW_NAMES.bullets)).isDirectory(),
      ).toBe(true);
      expect(output()).toContain(`(used by ${codexLink})`);
    });

    it('keeps an old symlink that the new-name link resolves through', async () => {
      const target = join(root, 'my-skills', 'bullets');
      mkdirSync(target, { recursive: true });
      writeFileSync(
        join(target, 'SKILL.md'),
        `---\nname: ${NEW_NAMES.bullets}\n---\nmy edits\n`,
      );
      const oldLink = seedLink('claude', OLD_NAMES.bullets, target);
      seedLink('claude', NEW_NAMES.bullets, oldLink);

      const { error } = await install([
        '--tool',
        'claude',
        '--method',
        'copy',
        '--yes',
      ]);

      expect(error).toBeUndefined();
      expect(lstatSync(oldLink).isSymbolicLink()).toBe(true);
      expect(installedName('claude', NEW_NAMES.bullets)).toBe(
        NEW_NAMES.bullets,
      );
      expect(output()).toContain('resolves into the old entry');
    });

    it('replaces the link with an independent copy and then removes the old copy with --overwrite', async () => {
      const { oldDir, newLink } = seedDependentLink();

      const { error } = await install([
        '--tool',
        'claude',
        '--method',
        'copy',
        '--yes',
        '--overwrite',
      ]);

      expect(error).toBeUndefined();
      expect(occupied(oldDir)).toBe(false);
      expect(lstatSync(newLink).isDirectory()).toBe(true);
      expect(installedName('claude', NEW_NAMES.bullets)).toBe(
        NEW_NAMES.bullets,
      );
    });

    it('keeps the old copy a kept skill links into from a nested folder', async () => {
      const oldDir = seedCopy('claude', OLD_NAMES.bullets);
      mkdirSync(join(oldDir, 'scripts'));
      writeFileSync(join(oldDir, 'scripts', 'helper.sh'), 'echo helper\n');
      // The user's own copy under the new name, reusing the old helpers
      const newDir = join(skillsDir('claude'), NEW_NAMES.bullets);
      mkdirSync(newDir);
      writeFileSync(
        join(newDir, 'SKILL.md'),
        `---\nname: ${NEW_NAMES.bullets}\n---\nmy edits\n`,
      );
      symlinkSync(join(oldDir, 'scripts'), join(newDir, 'scripts'), 'dir');

      const { error } = await install([
        '--tool',
        'claude',
        '--method',
        'copy',
        '--yes',
      ]);

      expect(error).toBeUndefined();
      expect(readFileSync(join(newDir, 'scripts', 'helper.sh'), 'utf8')).toBe(
        'echo helper\n',
      );
      expect(output()).toContain(`(used by ${newDir})`);
    });

    it.skipIf(process.getuid?.() === 0)(
      'keeps the old copy when a nested link cannot be followed',
      async () => {
        const oldDir = seedCopy('claude', OLD_NAMES.bullets);
        mkdirSync(join(oldDir, 'scripts'));
        writeFileSync(join(oldDir, 'scripts', 'helper.sh'), 'echo helper\n');
        const resources = join(root, 'private', 'resources');
        mkdirSync(resources, { recursive: true });
        symlinkSync(join(oldDir, 'scripts'), join(resources, 'helpers'), 'dir');
        const newDir = join(skillsDir('claude'), NEW_NAMES.bullets);
        mkdirSync(newDir);
        writeFileSync(
          join(newDir, 'SKILL.md'),
          `---\nname: ${NEW_NAMES.bullets}\n---\nmy edits\n`,
        );
        symlinkSync(resources, join(newDir, 'scripts'), 'dir');

        chmodSync(join(root, 'private'), 0o000);
        let result: { error?: Error };
        try {
          result = await install([
            '--tool',
            'claude',
            '--method',
            'copy',
            '--yes',
          ]);
        } finally {
          chmodSync(join(root, 'private'), 0o755);
        }

        expect(result.error).toBeUndefined();
        expect(
          readFileSync(join(newDir, 'scripts', 'helpers', 'helper.sh'), 'utf8'),
        ).toBe('echo helper\n');
        expect(output()).toContain(
          `(used by ${newDir} (could not be fully checked))`,
        );
      },
    );

    it.skipIf(process.getuid?.() === 0)(
      'keeps the old copy when another tool skills directory cannot be read',
      async () => {
        const oldDir = seedCopy('claude', OLD_NAMES.bullets);
        mkdirSync(join(oldDir, 'scripts'));
        writeFileSync(join(oldDir, 'scripts', 'helper.sh'), 'echo helper\n');
        const cursorSkill = join(skillsDir('cursor'), 'my-skill');
        mkdirSync(cursorSkill, { recursive: true });
        symlinkSync(
          join(oldDir, 'scripts'),
          join(cursorSkill, 'scripts'),
          'dir',
        );

        chmodSync(skillsDir('cursor'), 0o000);
        let result: { error?: Error };
        try {
          result = await install([
            '--tool',
            'claude',
            '--method',
            'copy',
            '--yes',
          ]);
        } finally {
          chmodSync(skillsDir('cursor'), 0o755);
        }

        expect(result.error).toBeUndefined();
        expect(
          readFileSync(join(cursorSkill, 'scripts', 'helper.sh'), 'utf8'),
        ).toBe('echo helper\n');
        expect(output()).toContain(
          `(used by ${skillsDir('cursor')} (could not be fully checked))`,
        );
      },
    );

    it.skipIf(!caseInsensitiveTmp)(
      'keeps the old copy a nested link reaches through a differently cased path',
      async () => {
        const oldDir = seedCopy('claude', OLD_NAMES.bullets);
        mkdirSync(join(oldDir, 'scripts'));
        writeFileSync(join(oldDir, 'scripts', 'helper.sh'), 'echo helper\n');
        const newDir = join(skillsDir('claude'), NEW_NAMES.bullets);
        mkdirSync(newDir);
        writeFileSync(
          join(newDir, 'SKILL.md'),
          `---\nname: ${NEW_NAMES.bullets}\n---\nmy edits\n`,
        );
        symlinkSync(
          join(skillsDir('claude'), OLD_NAMES.bullets.toUpperCase(), 'scripts'),
          join(newDir, 'scripts'),
          'dir',
        );

        const { error } = await install([
          '--tool',
          'claude',
          '--method',
          'copy',
          '--yes',
        ]);

        expect(error).toBeUndefined();
        expect(readFileSync(join(newDir, 'scripts', 'helper.sh'), 'utf8')).toBe(
          'echo helper\n',
        );
      },
    );

    it.skipIf(process.platform === 'win32')(
      'keeps the old copy a nested link reaches through a backslash in a name',
      async () => {
        const oldDir = seedCopy('claude', OLD_NAMES.bullets);
        mkdirSync(join(oldDir, 'scripts'));
        writeFileSync(join(oldDir, 'scripts', 'helper.sh'), 'echo helper\n');
        const odd = join(root, 'my\\helpers');
        mkdirSync(odd);
        symlinkSync(join(oldDir, 'scripts'), join(odd, 'shared'), 'dir');
        const newDir = join(skillsDir('claude'), NEW_NAMES.bullets);
        mkdirSync(newDir);
        writeFileSync(
          join(newDir, 'SKILL.md'),
          `---\nname: ${NEW_NAMES.bullets}\n---\nmy edits\n`,
        );
        symlinkSync(join(odd, 'shared'), join(newDir, 'scripts'), 'dir');

        const { error } = await install([
          '--tool',
          'claude',
          '--method',
          'copy',
          '--yes',
        ]);

        expect(error).toBeUndefined();
        expect(readFileSync(join(newDir, 'scripts', 'helper.sh'), 'utf8')).toBe(
          'echo helper\n',
        );
      },
    );

    it('still removes the old copy when a nested link target is missing', async () => {
      const oldDir = seedCopy('claude', OLD_NAMES.bullets);
      const newDir = join(skillsDir('claude'), NEW_NAMES.bullets);
      mkdirSync(newDir);
      writeFileSync(
        join(newDir, 'SKILL.md'),
        `---\nname: ${NEW_NAMES.bullets}\n---\nmy edits\n`,
      );
      symlinkSync(join(root, 'gone'), join(newDir, 'scripts'), 'dir');

      const { error } = await install([
        '--tool',
        'claude',
        '--method',
        'copy',
        '--yes',
      ]);

      expect(error).toBeUndefined();
      expect(occupied(oldDir)).toBe(false);
    });

    it('still removes the old copy when a nested link points elsewhere', async () => {
      const oldDir = seedCopy('claude', OLD_NAMES.bullets);
      const helpers = join(root, 'my-helpers');
      mkdirSync(helpers);
      const newDir = join(skillsDir('claude'), NEW_NAMES.bullets);
      mkdirSync(newDir);
      writeFileSync(
        join(newDir, 'SKILL.md'),
        `---\nname: ${NEW_NAMES.bullets}\n---\nmy edits\n`,
      );
      symlinkSync(helpers, join(newDir, 'scripts'), 'dir');

      const { error } = await install([
        '--tool',
        'claude',
        '--method',
        'copy',
        '--yes',
      ]);

      expect(error).toBeUndefined();
      expect(occupied(oldDir)).toBe(false);
      expect(readlinkSync(join(newDir, 'scripts'))).toBe(helpers);
    });

    it('still removes the old copy when the new-name link points elsewhere', async () => {
      const oldDir = seedCopy('claude', OLD_NAMES.bullets);
      const elsewhere = join(root, 'my-skills', NEW_NAMES.bullets);
      mkdirSync(elsewhere, { recursive: true });
      writeFileSync(
        join(elsewhere, 'SKILL.md'),
        `---\nname: ${NEW_NAMES.bullets}\n---\nmy edits\n`,
      );
      const newLink = seedLink('claude', NEW_NAMES.bullets, elsewhere);

      const { error } = await install([
        '--tool',
        'claude',
        '--method',
        'copy',
        '--yes',
      ]);

      expect(error).toBeUndefined();
      expect(occupied(oldDir)).toBe(false);
      expect(readlinkSync(newLink)).toBe(elsewhere);
      expect(readFileSync(join(newLink, 'SKILL.md'), 'utf8')).toContain(
        'my edits',
      );
      expect(output()).toContain('Removed 1 old-name skill(s)');
    });
  });

  it('asks before overwriting a same-name skill and keeps it when declined', async () => {
    const edited = join(skillsDir('gemini'), NEW_NAMES.bullets);
    mkdirSync(edited, { recursive: true });
    writeFileSync(
      join(edited, 'SKILL.md'),
      `---\nname: ${NEW_NAMES.bullets}\n---\nmy edits\n`,
    );
    const oldBullets = seedCopy('gemini', OLD_NAMES.bullets);
    script({
      'Select AI tools to install skills for:': [['gemini']],
      'How should skills be installed?': ['copy'],
      'Overwrite existing skills?': [false],
      'Remove the old names from Gemini?': [true],
    });

    const { error } = await install([]);

    expect(error).toBeUndefined();
    expect(readFileSync(join(edited, 'SKILL.md'), 'utf8')).toContain(
      'my edits',
    );
    // The kept skill is a verified install of the new name, so the old
    // name can still go.
    expect(occupied(oldBullets)).toBe(false);
  });

  it.each<{ how: string; args: string[]; answers: Record<string, unknown[]> }>([
    {
      how: 'declined at the prompt',
      args: [],
      answers: {
        'Select AI tools to install skills for:': [['claude']],
        'How should skills be installed?': ['copy'],
        'Remove the old names from Claude Code?': [false],
      },
    },
    {
      how: 'declined with --keep-old',
      args: ['--tool', 'claude', '--yes', '--keep-old'],
      answers: {},
    },
  ])(
    'keeps both names when old-name removal is $how',
    async ({ args, answers }) => {
      const oldTeam = seedCopy('claude', OLD_NAMES.team);
      script(answers);

      const { error } = await install(args);

      expect(error).toBeUndefined();
      expect(existsSync(join(oldTeam, 'SKILL.md'))).toBe(true);
      expect(installedName('claude', NEW_NAMES.team)).toBe(NEW_NAMES.team);
      expect(output()).toContain(
        'Kept the old names in Claude Code; both old and new names are installed',
      );
    },
  );

  it('is stable when run again across tools', async () => {
    seedCopy('claude', OLD_NAMES.highlights);
    seedLink('gemini', OLD_NAMES.peer, join(root, 'gone', OLD_NAMES.peer));
    const args = ['--tool', 'claude', 'gemini', '--yes'];

    expect((await install(args)).error).toBeUndefined();
    vi.resetModules();
    logs = [];
    expect((await install(args)).error).toBeUndefined();

    for (const tool of ['claude', 'gemini']) {
      for (const name of Object.values(OLD_NAMES)) {
        expect(occupied(join(skillsDir(tool), name))).toBe(false);
      }
      for (const name of Object.values(NEW_NAMES)) {
        expect(installedName(tool, name)).toBe(name);
      }
    }
    expect(output()).not.toContain('old names');
    expect(output()).toContain('Skipped');
  });

  it('keeps the old copy and fails when the replacement cannot be installed', async () => {
    const oldTeam = seedCopy('claude', OLD_NAMES.team);
    chmodSync(skillsDir('claude'), 0o555);

    const { error } = await install(['--tool', 'claude', '--yes']);
    chmodSync(skillsDir('claude'), 0o755);

    expect(error?.message).toContain(
      'Some skills could not be installed or migrated',
    );
    expect(readFileSync(join(oldTeam, 'SKILL.md'), 'utf8')).toContain(
      'old body',
    );
    expect(output()).toContain('Kept 1 old-name skill(s) in Claude Code');
  });
});

describe('skills install replacement safety', () => {
  const BULLETS = NEW_NAMES.bullets;
  const bulletsPath = () => join(skillsDir('claude'), BULLETS);

  /** The user's edited copy of a current skill */
  function seedEdited(tool: string, name: string): string {
    const dir = join(skillsDir(tool), name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\n---\nmy edits\n`);
    return dir;
  }

  const hidden = (tool: string) =>
    readdirSync(skillsDir(tool)).filter((name) => name.startsWith('.'));

  const isBulletsSide = (path: unknown, role: string) =>
    typeof path === 'string' &&
    basename(path).startsWith(`.${BULLETS}.wc-${role}-`);

  it.each([
    { method: 'copy', op: 'copyTree' },
    { method: 'symlink', op: 'symlink' },
  ])(
    'keeps the previous skill when the $method fails during --overwrite and carries on',
    async ({ method, op }) => {
      seedEdited('claude', BULLETS);
      const oldTeam = seedCopy('claude', OLD_NAMES.team);

      const { error } = await install(
        ['--tool', 'claude', '--method', method, '--yes', '--overwrite'],
        (name, args) => {
          if (name !== op || basename(String(args[0])) !== BULLETS) return;
          if (op === 'copyTree') {
            // A copy that dies part-way leaves a partial staging tree
            mkdirSync(String(args[1]));
            writeFileSync(join(String(args[1]), 'SKILL.md'), '---\n');
          }
          throw fsError('EIO');
        },
      );

      expect(error?.message).toContain(
        `Claude Code ${BULLETS}: EIO: injected; the previous install was kept`,
      );
      expect(readFileSync(join(bulletsPath(), 'SKILL.md'), 'utf8')).toContain(
        'my edits',
      );
      expect(hidden('claude')).toEqual([]);
      // The remaining skills and the old-name migration still run
      expect(installedName('claude', NEW_NAMES.team)).toBe(NEW_NAMES.team);
      expect(occupied(oldTeam)).toBe(false);
      expect(output()).toContain(
        'Removed 1 old-name skill(s) from Claude Code',
      );
    },
  );

  it('reports a temporary copy it cannot remove and still finishes the run', async () => {
    seedEdited('claude', BULLETS);
    const oldTeam = seedCopy('claude', OLD_NAMES.team);

    const { error } = await install(
      ['--tool', 'claude', '--yes', '--overwrite'],
      (name, args) => {
        if (name === 'copyTree' && basename(String(args[0])) === BULLETS) {
          mkdirSync(String(args[1]));
          throw fsError('EIO');
        }
        if (name === 'removeTree' && isBulletsSide(args[0], 'staging')) {
          throw fsError('EBUSY');
        }
      },
    );

    expect(error?.message).toContain(`${BULLETS}: EIO: injected`);
    expect(output()).toMatch(
      new RegExp(
        `Warning: Claude Code ${BULLETS}: a temporary copy could not be removed and is left at .*\\.wc-staging-.* \\(EBUSY: injected\\)`,
      ),
    );
    expect(readFileSync(join(bulletsPath(), 'SKILL.md'), 'utf8')).toContain(
      'my edits',
    );
    expect(installedName('claude', NEW_NAMES.team)).toBe(NEW_NAMES.team);
    expect(occupied(oldTeam)).toBe(false);
  });

  it('puts the previous skill back when the staged one cannot be moved into place', async () => {
    seedEdited('claude', BULLETS);

    const { error } = await install(
      ['--tool', 'claude', '--yes', '--overwrite'],
      (name, args) => {
        if (name === 'rename' && isBulletsSide(args[0], 'staging')) {
          throw fsError('EXDEV');
        }
      },
    );

    expect(error?.message).toContain(
      `${BULLETS}: EXDEV: injected; the previous install was kept`,
    );
    expect(readFileSync(join(bulletsPath(), 'SKILL.md'), 'utf8')).toContain(
      'my edits',
    );
    expect(hidden('claude')).toEqual([]);
  });

  it('keeps the previous skill aside and says where when it cannot be put back', async () => {
    seedEdited('claude', BULLETS);

    const { error } = await install(
      ['--tool', 'claude', '--yes', '--overwrite'],
      (name, args) => {
        if (
          name === 'rename' &&
          (isBulletsSide(args[0], 'staging') ||
            isBulletsSide(args[0], 'backup'))
        ) {
          throw fsError('EIO');
        }
      },
    );

    const [backup] = hidden('claude');
    expect(backup).toMatch(new RegExp(`^\\.${BULLETS}\\.wc-backup-`));
    expect(error?.message).toContain(
      `the previous install could not be put back and is kept at ${join(skillsDir('claude'), backup as string)}`,
    );
    expect(
      readFileSync(
        join(skillsDir('claude'), backup as string, 'SKILL.md'),
        'utf8',
      ),
    ).toContain('my edits');
  });

  it('puts the previous skill back when the installed one does not check out in place', async () => {
    seedEdited('claude', BULLETS);

    const { error } = await install(
      ['--tool', 'claude', '--yes', '--overwrite'],
      (name, args) => {
        if (
          name === 'readFile' &&
          args[0] === join(bulletsPath(), 'SKILL.md')
        ) {
          throw fsError('EIO');
        }
      },
    );

    expect(error?.message).toContain(
      `the installed SKILL.md at ${bulletsPath()} does not declare ${BULLETS}; the previous install was kept`,
    );
    expect(readFileSync(join(bulletsPath(), 'SKILL.md'), 'utf8')).toContain(
      'my edits',
    );
    expect(hidden('claude')).toEqual([]);
  });

  it('reports a replaced skill it cannot remove without failing the install', async () => {
    seedEdited('claude', BULLETS);
    const oldTeam = seedCopy('claude', OLD_NAMES.team);

    const { error } = await install(
      ['--tool', 'claude', '--yes', '--overwrite'],
      (name, args) => {
        if (name === 'removeTree' && isBulletsSide(args[0], 'backup')) {
          throw fsError('EBUSY');
        }
      },
    );

    expect(error).toBeUndefined();
    expect(installedName('claude', BULLETS)).toBe(BULLETS);
    const [backup] = hidden('claude');
    expect(output()).toContain(
      `Warning: Claude Code ${BULLETS}: installed, but the replaced entry could not be removed and is left at ${join(skillsDir('claude'), backup as string)} (EBUSY: injected)`,
    );
    expect(installedName('claude', NEW_NAMES.team)).toBe(NEW_NAMES.team);
    expect(occupied(oldTeam)).toBe(false);
  });

  it('replaces a symlinked skill without touching what it points to', async () => {
    const mine = join(root, 'my-skills', BULLETS);
    mkdirSync(mine, { recursive: true });
    writeFileSync(join(mine, 'SKILL.md'), `---\nname: ${BULLETS}\n---\nmine\n`);
    seedLink('claude', BULLETS, mine);

    const { error } = await install([
      '--tool',
      'claude',
      '--yes',
      '--overwrite',
    ]);

    expect(error).toBeUndefined();
    expect(lstatSync(bulletsPath()).isDirectory()).toBe(true);
    expect(installedName('claude', BULLETS)).toBe(BULLETS);
    expect(readFileSync(join(mine, 'SKILL.md'), 'utf8')).toContain('mine');
  });

  it('keeps a link from another tool into the replaced skill working', async () => {
    seedEdited('claude', BULLETS);
    const cursorLink = seedLink('cursor', BULLETS, bulletsPath());

    const { error } = await install([
      '--tool',
      'claude',
      '--yes',
      '--overwrite',
    ]);

    expect(error).toBeUndefined();
    expect(readlinkSync(cursorLink)).toBe(bulletsPath());
    expect(installedName('cursor', BULLETS)).toBe(BULLETS);
    expect(readFileSync(join(cursorLink, 'SKILL.md'), 'utf8')).not.toContain(
      'my edits',
    );
  });

  it.skipIf(!caseInsensitiveTmp)(
    'puts a differently cased skill back under its own name',
    async () => {
      const upper = BULLETS.toUpperCase();
      seedEdited('claude', upper);

      const { error } = await install(
        ['--tool', 'claude', '--yes', '--overwrite'],
        (name, args) => {
          if (name === 'rename' && isBulletsSide(args[0], 'staging')) {
            throw fsError('EIO');
          }
        },
      );

      expect(error?.message).toContain(
        `${BULLETS}: EIO: injected; the previous install was kept`,
      );
      expect(readdirSync(skillsDir('claude'))).toContain(upper);
      expect(readdirSync(skillsDir('claude'))).not.toContain(BULLETS);
      expect(
        readFileSync(join(skillsDir('claude'), upper, 'SKILL.md'), 'utf8'),
      ).toContain('my edits');
    },
  );
});
