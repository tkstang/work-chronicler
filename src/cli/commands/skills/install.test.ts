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
import { join } from 'node:path';

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

async function install(args: string[]): Promise<{ error?: Error }> {
  const { Command } = await import('commander');
  const { installSubcommand } = await import('./install');
  const program = new Command('skills')
    .exitOverride()
    .addCommand(installSubcommand);
  try {
    await program.parseAsync(['install', ...args], { from: 'user' });
    return {};
  } catch (error) {
    return { error: error as Error };
  }
}

const output = () => logs.join('\n');

describe('skills install rename migration', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wc-skills-install-'));
    home = join(root, 'home');
    mkdirSync(home);
    vi.stubEnv('HOME', home);
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
