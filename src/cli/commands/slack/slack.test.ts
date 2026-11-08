import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  messageFrontmatter,
  stage,
  storeRecord,
} from '@core/import/import.test-support';
import { afterAll, describe, expect, it } from 'vitest';

import { MAX_REASON_FILE_BYTES } from './channels';

/** These tests run the built CLI several times; slow CI runners need more than the 5 s default */
const CLI_RUNS = { timeout: 60_000 };

// The `slack` commands, run as the real CLI in a child process with HOME and
// the workspace in a temporary directory, as a skill would run them. Rules
// and file safety are tested in @config/slack-config and @core/import; these
// tests cover profile and report resolution, flags, exit codes and the
// `slack show` contract the skills read. All IDs are synthetic.

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'wc-slack-cli-'));
const home = join(root, 'home');
const wcHome = join(root, 'wc-home');
const soloConfig = join(wcHome, 'profiles', 'solo', 'config.yaml');
const teamConfig = join(wcHome, 'profiles', 'team', 'config.yaml');

const SOLO_YAML = `# synthetic IC profile (comment kept)
github:
  username: synthetic-ic
  orgs: []
output:
  directory: ./work-log
fetch:
  since: "2026-01-01"
  until: "2026-06-30"
`;
const TEAM_YAML = `mode: manager
github:
  org: synthetic-org
fetch:
  since: "2026-02-01"
reports:
  - name: Alice Smith
    github: alice-synthetic
    email: alice@example.com
  - name: Bob Jones
    github: bob-synthetic
    email: bob@example.com
`;

mkdirSync(home, { recursive: true });
mkdirSync(join(wcHome, 'profiles', 'solo', 'work-log'), { recursive: true });
mkdirSync(join(wcHome, 'profiles', 'team', 'reports'), { recursive: true });
writeFileSync(soloConfig, SOLO_YAML);
writeFileSync(teamConfig, TEAM_YAML);

afterAll(() => rmSync(root, { recursive: true, force: true }));

function env(profile: string) {
  return {
    PATH: process.env.PATH,
    HOME: home,
    WORK_CHRONICLER_HOME: wcHome,
    WORK_CHRONICLER_PROFILE: profile,
    NO_COLOR: '1',
  };
}

function cli(profile: string, args: string[], input?: string) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'src/cli/index.ts', ...args],
    // A bound, so a run that reads without end fails instead of hanging
    {
      cwd: repoRoot,
      encoding: 'utf-8',
      env: env(profile),
      input,
      timeout: 30_000,
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

let reasonFiles = 0;

/**
 * Add a channel exactly as the setup-slack skill tells the assistant to: the
 * reason written to a file (as its file-writing tool would), then the skill's
 * command lines run through a shell with their placeholders filled.
 */
function skillChannelAdd(
  profile: string,
  values: { id: string; name: string; reason: string },
  marker: string,
) {
  const skill = readFileSync(
    join(repoRoot, '.agents/skills/work-chronicler-setup-slack/SKILL.md'),
    'utf-8',
  );
  const block = /```bash\n(work-chronicler slack channels add [^`]*)```/.exec(
    skill,
  )?.[1];
  if (!block) throw new Error('the skill has no `slack channels add` block');
  const reasonFile = join(root, `wc-reason-${++reasonFiles}.txt`);
  writeFileSync(reasonFile, values.reason);
  const script = block
    .replace('<channel-id>', () => values.id)
    .replace('<channel-name>', () => values.name)
    .replaceAll('<reason-file>', () => reasonFile)
    .replace(
      /^work-chronicler /,
      () => '"$WC_NODE" --import tsx src/cli/index.ts ',
    );
  const result = spawnSync('/bin/sh', ['-c', script], {
    cwd: repoRoot,
    encoding: 'utf-8',
    env: { ...env(profile), WC_NODE: process.execPath, WC_MARKER: marker },
  });
  return {
    /** The CLI's JSON result (the last line, `rm`, prints nothing) */
    value: JSON.parse(result.stdout),
    stderr: result.stderr,
    reasonFileLeft: existsSync(reasonFile),
  };
}

function json(profile: string, args: string[]) {
  const run = cli(profile, [...args, '--json']);
  return { status: run.status, value: JSON.parse(run.stdout) };
}

let batches = 0;
function batch(...records: Record<string, unknown>[]): string {
  const dir = join(root, `batch-${++batches}`);
  mkdirSync(dir);
  records.forEach((record, i) => stage(dir, `${i}.md`, record));
  return dir;
}

/** A synthetic message in channel C0TEST0001 by U0TEST0001 */
function message(n: number, extra: Record<string, unknown> = {}) {
  const base = messageFrontmatter(n);
  return {
    ...base,
    sourceAccount: 'T0TEST0001',
    sourceId: `C0TEST0001/1700000000.${String(n).padStart(6, '0')}`,
    attribution: { status: 'verified', authorId: 'U0TEST0001' },
    message: {
      ...(base.message as Record<string, unknown>),
      container: { id: 'C0TEST0001', name: 'synthetic-eng' },
    },
    ...extra,
  };
}

describe('slack commands: IC profile', CLI_RUNS, () => {
  it('sets up Slack, shows it to the skill, and import follows the settings', () => {
    expect(json('solo', ['slack', 'show']).value).toMatchObject({
      configured: false,
      channels: [],
      record: null,
    });

    expect(
      cli('solo', [
        'slack',
        'configure',
        '--workspace',
        'T0TEST0001',
        '--user',
        'U0TEST0001',
      ]).status,
    ).toBe(0);
    expect(
      cli('solo', [
        'slack',
        'channels',
        'add',
        'C0TEST0001',
        '--name',
        '#synthetic-eng',
        '--reason',
        'Design reviews',
      ]).status,
    ).toBe(0);
    expect(readFileSync(soloConfig, 'utf-8')).toContain('(comment kept)');

    const shown = json('solo', ['slack', 'show']);
    expect(shown.status).toBe(0);
    expect(shown.value).toEqual({
      profile: 'solo',
      mode: 'ic',
      subject: { kind: 'ic' },
      subjectName: null,
      configured: true,
      range: { since: '2026-01-01', until: '2026-06-30' },
      workspace: 'T0TEST0001',
      user: 'U0TEST0001',
      channels: [
        {
          id: 'C0TEST0001',
          name: 'synthetic-eng',
          reason: 'Design reviews',
          private: false,
          importable: true,
        },
      ],
      record: {
        source: 'slack',
        sourceAccount: 'T0TEST0001',
        subject: { kind: 'ic' },
        attribution: { status: 'verified', authorId: 'U0TEST0001' },
      },
      importCommand: [
        'work-chronicler',
        '--profile',
        'solo',
        'import',
        '<staging-dir>',
      ],
      workLog: join(wcHome, 'profiles', 'solo', 'work-log'),
    });

    expect(cli('solo', ['import', batch(message(1))]).status).toBe(0);

    expect(
      cli('solo', ['slack', 'channels', 'remove', 'C0TEST0001']).status,
    ).toBe(0);
    expect(json('solo', ['slack', 'channels', 'list']).value.channels).toEqual(
      [],
    );
    const again = json('solo', ['slack', 'channels', 'remove', 'C0TEST0001']);
    expect(again.status).toBe(1);
    expect(again.value).toEqual({
      ok: false,
      error: expect.stringContaining('C0TEST0001 is not configured'),
    });
    const refused = json('solo', ['import', batch(message(2))]);
    expect(refused.status).toBe(1);
    expect(refused.value.issues).toEqual([
      expect.objectContaining({
        code: 'SOURCE_RULE',
        field: 'message.container.id',
      }),
    ]);
  });

  it.each([
    ['a direct message', 'D0TEST0001', []],
    ['a G… conversation without --private', 'G0TEST0001', []],
  ])('refuses %s and leaves the config as it was', (_label, id, extra) => {
    const before = readFileSync(soloConfig, 'utf-8');

    const run = json('solo', [
      'slack',
      'channels',
      'add',
      id,
      '--name',
      'synthetic-private',
      '--reason',
      'x',
      ...extra,
    ]);

    expect(run.status).toBe(1);
    expect(run.value).toMatchObject({ ok: false });
    expect(readFileSync(soloConfig, 'utf-8')).toBe(before);
  });

  it('adds a private channel with the --private opt-in', () => {
    const run = json('solo', [
      'slack',
      'channels',
      'add',
      'G0TEST0001',
      '--name',
      'synthetic-private',
      '--reason',
      'x',
      '--private',
    ]);

    expect(run.status).toBe(0);
    expect(run.value.channels).toContainEqual(
      expect.objectContaining({ id: 'G0TEST0001', private: true }),
    );
  });

  it('keeps shell syntax in a reason as text, run as the setup skill writes it', () => {
    const marker = join(root, 'reason-ran');
    // Expanded by a shell, either substitution would create the marker
    const reason =
      'Alice\'s reviews: "$(touch "$WC_MARKER")" `touch "$WC_MARKER"` $HOME \\ end';

    const run = skillChannelAdd(
      'solo',
      { id: 'C0TEST0003', name: 'synthetic-reviews', reason },
      marker,
    );

    expect(run.value).toMatchObject({ ok: true });
    expect(run.value.channels).toContainEqual(
      expect.objectContaining({ id: 'C0TEST0003', reason }),
    );
    expect(existsSync(marker)).toBe(false);
    expect(run.reasonFileLeft).toBe(false);
  });

  it('refuses a multi-line reason, run as the setup skill writes it, and runs none of it', () => {
    const marker = join(root, 'multi-line-ran');
    // A line that would end a fixed here-document delimiter, then a command
    const reason = 'ok\nWC_REASON\ntouch "$WC_MARKER"\n';
    const before = readFileSync(soloConfig, 'utf-8');

    const run = skillChannelAdd(
      'solo',
      { id: 'C0TEST0006', name: 'synthetic-multi', reason },
      marker,
    );

    expect(run.value).toEqual({
      ok: false,
      error: expect.stringContaining('one line'),
    });
    expect(readFileSync(soloConfig, 'utf-8')).toBe(before);
    expect(existsSync(marker)).toBe(false);
    expect(run.stderr).not.toContain('not found');
    expect(run.reasonFileLeft).toBe(false);
  });

  it('reads the reason from a file with --reason-file', () => {
    const file = join(root, 'reason.txt');
    writeFileSync(file, "Bob's on-call handoffs\n");

    const run = json('solo', [
      'slack',
      'channels',
      'add',
      'C0TEST0004',
      '--name',
      'synthetic-oncall',
      '--reason-file',
      file,
    ]);

    expect(run.status).toBe(0);
    expect(run.value.channels).toContainEqual(
      expect.objectContaining({
        id: 'C0TEST0004',
        reason: "Bob's on-call handoffs",
      }),
    );
  });

  it('stores the reason without surrounding whitespace', () => {
    const file = join(root, 'padded-reason.txt');
    writeFileSync(file, '   Padded reason  \n\n');

    const run = json('solo', [
      'slack',
      'channels',
      'add',
      'C0TEST0007',
      '--name',
      'synthetic-padded',
      '--reason-file',
      file,
    ]);

    expect(run.status).toBe(0);
    expect(run.value.channels).toContainEqual(
      expect.objectContaining({ id: 'C0TEST0007', reason: 'Padded reason' }),
    );
    expect(readFileSync(soloConfig, 'utf-8')).toContain(
      'reason: Padded reason\n',
    );
  });

  it.each([
    [
      'larger than the bound',
      () => {
        const file = join(root, 'large-reason.txt');
        writeFileSync(file, 'x'.repeat(MAX_REASON_FILE_BYTES + 1));
        return file;
      },
      `larger than ${MAX_REASON_FILE_BYTES} bytes`,
    ],
    [
      'without end',
      () => '/dev/zero',
      `larger than ${MAX_REASON_FILE_BYTES} bytes`,
    ],
    [
      'not valid UTF-8',
      () => {
        const file = join(root, 'latin1-reason.txt');
        writeFileSync(file, Buffer.from([0x63, 0x61, 0x66, 0xff]));
        return file;
      },
      'not valid UTF-8',
    ],
  ])('refuses a reason file %s', (_label, path, message) => {
    const before = readFileSync(soloConfig, 'utf-8');

    const run = json('solo', [
      'slack',
      'channels',
      'add',
      'C0TEST0008',
      '--name',
      'synthetic-refused',
      '--reason-file',
      path(),
    ]);

    expect(run.status).toBe(1);
    expect(run.value).toEqual({
      ok: false,
      error: expect.stringContaining(message),
    });
    expect(readFileSync(soloConfig, 'utf-8')).toBe(before);
  });

  it.each([
    ['no reason', [], undefined],
    [
      'both --reason and --reason-file',
      ['--reason', 'x', '--reason-file', '-'],
      'x\n',
    ],
    [
      'a reason file that cannot be read',
      ['--reason-file', join(root, 'missing.txt')],
      undefined,
    ],
    ['a reason of more than one line', ['--reason-file', '-'], 'one\ntwo\n'],
  ])(
    'refuses %s with a JSON result and leaves the config as it was',
    (_label, extra, input) => {
      const before = readFileSync(soloConfig, 'utf-8');

      const run = cli(
        'solo',
        [
          'slack',
          'channels',
          'add',
          'C0TEST0005',
          '--name',
          'synthetic-refused',
          ...extra,
          '--json',
        ],
        input,
      );

      expect(run.status).toBe(1);
      expect(JSON.parse(run.stdout)).toEqual({
        ok: false,
        error: expect.any(String),
      });
      expect(readFileSync(soloConfig, 'utf-8')).toBe(before);
    },
  );

  it('reports a config it cannot load as JSON', () => {
    const invalid = join(root, 'invalid.yaml');
    writeFileSync(invalid, 'github: [unclosed\n');

    const run = cli('solo', [
      'slack',
      'configure',
      '--workspace',
      'T0TEST0001',
      '--user',
      'U0TEST0001',
      '--config',
      invalid,
      '--json',
    ]);

    expect(run.status).toBe(1);
    expect(JSON.parse(run.stdout)).toEqual({
      ok: false,
      error: expect.stringContaining('could not be loaded'),
    });
  });

  it('refuses --report in an IC profile', () => {
    expect(
      cli('solo', ['slack', 'show', '--report', 'alice-smith']).status,
    ).toBe(1);
  });
});

describe('slack commands: changing the user', CLI_RUNS, () => {
  it('refuses another user while messages by the previous one are imported', () => {
    const dir = join(wcHome, 'profiles', 'switcher');
    mkdirSync(join(dir, 'work-log'), { recursive: true });
    writeFileSync(join(dir, 'config.yaml'), SOLO_YAML);
    // A message by U0SYNTH01, as an earlier import stored it
    storeRecord(join(dir, 'work-log'), 1);
    const configure = (user: string) =>
      json('switcher', [
        'slack',
        'configure',
        '--workspace',
        'T0SYNTH01',
        '--user',
        user,
      ]);

    const refused = configure('U0TEST0002');
    expect(refused.status).toBe(1);
    expect(refused.value).toEqual({
      ok: false,
      error: expect.stringContaining('by another Slack user (U0SYNTH01)'),
    });
    expect(readFileSync(join(dir, 'config.yaml'), 'utf-8')).toBe(SOLO_YAML);

    expect(configure('U0SYNTH01').status).toBe(0);
  });
});

describe('slack commands: manager reports', CLI_RUNS, () => {
  it('needs --report in a manager profile', () => {
    const run = cli('team', ['slack', 'show']);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('pass --report <id>');
  });

  it.each([
    [
      'configure',
      ['configure', '--workspace', 'T0TEST0001', '--user', 'U0TEST0001'],
    ],
    [
      'channels add',
      ['channels', 'add', 'C0TEST0001', '--name', 'x', '--reason', 'x'],
    ],
    ['show', ['show']],
  ])('reports a subject it cannot resolve as JSON (%s)', (_label, args) => {
    const run = cli('team', ['slack', ...args, '--json']);

    expect(run.status).toBe(1);
    // stdout is the JSON result alone: the hint is left out
    expect(JSON.parse(run.stdout)).toEqual({
      ok: false,
      error: expect.stringContaining('pass --report <id>'),
    });
    expect(readFileSync(teamConfig, 'utf-8')).toBe(TEAM_YAML);
  });

  it('shows an unconfigured report as off and refuses its channels', () => {
    expect(json('team', ['slack', 'show', '--report', 'bob-jones'])).toEqual({
      status: 0,
      value: expect.objectContaining({
        subject: { kind: 'report', reportId: 'bob-jones' },
        subjectName: 'Bob Jones',
        configured: false,
        record: null,
        range: { since: '2026-02-01', until: null },
      }),
    });
    const add = cli('team', [
      'slack',
      'channels',
      'add',
      'C0TEST0001',
      '--name',
      'synthetic-eng',
      '--reason',
      'x',
      '--shared-with-manager',
      '--report',
      'bob-jones',
    ]);
    expect(add.status).toBe(1);
    expect(add.stderr).toContain('not set up for report bob-jones');
    expect(readFileSync(teamConfig, 'utf-8')).toBe(TEAM_YAML);
  });

  it('adds a report channel only with the shared-membership confirmation', () => {
    const args = [
      'slack',
      'channels',
      'add',
      'C0TEST0001',
      '--name',
      'synthetic-eng',
      '--reason',
      'Team work',
      '--report',
      'alice-smith',
    ];
    expect(
      cli('team', [
        'slack',
        'configure',
        '--workspace',
        'T0TEST0001',
        '--user',
        'U0TEST0001',
        '--report',
        'alice-smith',
      ]).status,
    ).toBe(0);

    const unconfirmed = cli('team', args);
    expect(unconfirmed.status).toBe(1);
    expect(unconfirmed.stderr).toContain('--shared-with-manager');

    const confirmed = json('team', [...args, '--shared-with-manager']);
    expect(confirmed.status).toBe(0);
    expect(confirmed.value.channels).toEqual([
      expect.objectContaining({
        id: 'C0TEST0001',
        sharedWithManager: true,
        importable: true,
      }),
    ]);
    expect(
      json('team', ['slack', 'show', '--report', 'alice-smith']).value
        .importCommand,
    ).toEqual([
      'work-chronicler',
      '--profile',
      'team',
      'import',
      '<staging-dir>',
      '--report',
      'alice-smith',
    ]);
  });
});
