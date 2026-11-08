import { spawnSync } from 'node:child_process';
import {
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
  documentFrontmatter,
  stage,
  SYNTH_GOOGLE_ACCOUNT,
} from '@core/import/import.test-support';
import { afterAll, describe, expect, it } from 'vitest';

/** These tests run the CLI several times; slow CI runners need more than the 5 s default */
const CLI_RUNS = { timeout: 60_000 };

// The `google-docs` commands, run as the real CLI in a child process with
// HOME and the workspace in a temporary directory, as the import skill runs
// them: profile and report resolution, the config rewrite, and the
// `google-docs show --json` contract. All accounts are synthetic.

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'wc-google-docs-cli-'));
const home = join(root, 'home');
const wcHome = join(root, 'wc-home');
const soloConfig = join(wcHome, 'profiles', 'solo', 'config.yaml');
const teamConfig = join(wcHome, 'profiles', 'team', 'config.yaml');

mkdirSync(home, { recursive: true });
mkdirSync(join(wcHome, 'profiles', 'solo', 'work-log'), { recursive: true });
mkdirSync(join(wcHome, 'profiles', 'team', 'reports'), { recursive: true });
writeFileSync(
  soloConfig,
  `# synthetic IC profile (comment kept)
github:
  username: synthetic-ic
  orgs: []
output:
  directory: ./work-log
fetch:
  since: "2026-01-01"
  until: "2026-06-30"
`,
);
writeFileSync(
  teamConfig,
  `mode: manager
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
`,
);

afterAll(() => rmSync(root, { recursive: true, force: true }));

function cli(profile: string, args: string[]) {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'src/cli/index.ts', ...args],
    {
      cwd: repoRoot,
      encoding: 'utf-8',
      env: {
        PATH: process.env.PATH,
        HOME: home,
        WORK_CHRONICLER_HOME: wcHome,
        WORK_CHRONICLER_PROFILE: profile,
        NO_COLOR: '1',
      },
      timeout: 30_000,
    },
  );
  return { status: result.status, stdout: result.stdout };
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

describe('google-docs commands: IC profile', CLI_RUNS, () => {
  it('sets up the account, shows it to the skill, and import follows it', () => {
    expect(json('solo', ['google-docs', 'show']).value).toMatchObject({
      configured: false,
      account: null,
      record: null,
    });
    expect(json('solo', ['import', batch(documentFrontmatter(1))]).status).toBe(
      1,
    );

    const configured = json('solo', [
      'google-docs',
      'configure',
      '--account',
      'Synthetic.Owner@Example.com',
    ]);
    expect(configured).toEqual({
      status: 0,
      value: {
        ok: true,
        changed: true,
        warnings: [],
        subject: { kind: 'ic' },
        configured: true,
        account: SYNTH_GOOGLE_ACCOUNT,
      },
    });
    const config = readFileSync(soloConfig, 'utf-8');
    expect(config).toContain('(comment kept)');
    expect(config).toContain(`googleDocs:\n  account: ${SYNTH_GOOGLE_ACCOUNT}`);

    expect(json('solo', ['google-docs', 'show'])).toEqual({
      status: 0,
      value: {
        profile: 'solo',
        mode: 'ic',
        subject: { kind: 'ic' },
        subjectName: null,
        configured: true,
        range: { since: '2026-01-01', until: '2026-06-30' },
        account: SYNTH_GOOGLE_ACCOUNT,
        record: {
          type: 'document',
          source: 'google-docs',
          sourceAccount: SYNTH_GOOGLE_ACCOUNT,
          subject: { kind: 'ic' },
          attribution: { status: 'unverified', authorId: null },
          document: { mimeType: 'application/vnd.google-apps.document' },
        },
        excerptMaxBytes: 16384,
        importCommand: [
          'work-chronicler',
          '--profile',
          'solo',
          'import',
          '<staging-dir>',
        ],
        workLog: join(wcHome, 'profiles', 'solo', 'work-log'),
      },
    });

    const again = json('solo', [
      'google-docs',
      'configure',
      '--account',
      SYNTH_GOOGLE_ACCOUNT,
    ]);
    expect(again.value.changed).toBe(false);

    expect(json('solo', ['import', batch(documentFrontmatter(1))]).status).toBe(
      0,
    );
  });

  it("refuses another account while the work log holds the first account's Docs", () => {
    const refused = json('solo', [
      'google-docs',
      'configure',
      '--account',
      'someone.else@example.com',
    ]);
    expect(refused.status).toBe(1);
    expect(refused.value).toEqual({
      ok: false,
      error: expect.stringContaining('owned by another account'),
    });
    expect(readFileSync(soloConfig, 'utf-8')).toContain(SYNTH_GOOGLE_ACCOUNT);
  });

  it('refuses an account that is not an email address', () => {
    const refused = json('solo', [
      'google-docs',
      'configure',
      '--account',
      'not-an-email',
    ]);
    expect(refused.status).toBe(1);
    expect(refused.value.error).toContain('Google account email address');
  });
});

describe('google-docs commands: manager reports', CLI_RUNS, () => {
  it('sets up one report and leaves the others unconfigured', () => {
    expect(json('team', ['google-docs', 'show']).value.error).toContain(
      'manager profile',
    );

    const configured = json('team', [
      'google-docs',
      'configure',
      '--account',
      'alice.synthetic@example.com',
      '--report',
      'alice-smith',
    ]);
    expect(configured.status).toBe(0);
    expect(configured.value.subject).toEqual({
      kind: 'report',
      reportId: 'alice-smith',
    });

    const alice = json('team', [
      'google-docs',
      'show',
      '--report',
      'alice-smith',
    ]).value;
    expect(alice).toMatchObject({
      mode: 'manager',
      subjectName: 'Alice Smith',
      configured: true,
      range: { since: '2026-02-01', until: null },
      account: 'alice.synthetic@example.com',
      importCommand: [
        'work-chronicler',
        '--profile',
        'team',
        'import',
        '<staging-dir>',
        '--report',
        'alice-smith',
      ],
    });
    expect(
      json('team', ['google-docs', 'show', '--report', 'bob-jones']).value,
    ).toMatchObject({ configured: false, account: null, record: null });
  });
});
