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
  SECRET,
  slackIdentity,
  stage,
} from '@core/import/import.test-support';
import { getImportedRecordFilePath } from '@storage/paths';
import { afterAll, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';

// The import and validate commands, run as the real CLI in a child process
// with HOME and the workspace in a temporary directory: exit codes, stdout
// (JSON) and stderr are observed exactly as a skill would see them.

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'wc-import-cli-'));
const home = join(root, 'home');
const wcHome = join(root, 'wc-home');
const icWorkLog = join(wcHome, 'profiles', 'solo', 'work-log');
const reportsDir = join(wcHome, 'profiles', 'team', 'reports');
const aliceWorkLog = join(reportsDir, 'alice-smith', 'work-log');
const bobWorkLog = join(reportsDir, 'bob-jones', 'work-log');

/** Slack settings matching the synthetic records' workspace, user and channel */
const slack = (shared: boolean) => ({
  workspace: 'T0SYNTH01',
  user: 'U0SYNTH01',
  channels: [
    {
      id: 'C0SYNTH01',
      name: 'synthetic-channel',
      reason: 'Synthetic test channel',
      ...(shared ? { sharedWithManager: true } : {}),
    },
  ],
});

function setUpWorkspace() {
  mkdirSync(home, { recursive: true });
  mkdirSync(icWorkLog, { recursive: true });
  mkdirSync(aliceWorkLog, { recursive: true });
  mkdirSync(bobWorkLog, { recursive: true });
  writeFileSync(
    join(wcHome, 'profiles', 'solo', 'config.yaml'),
    stringify({
      github: { username: 'synthetic-ic', orgs: [] },
      output: { directory: './work-log' },
      fetch: { since: '2026-01-01' },
      slack: slack(false),
    }),
  );
  writeFileSync(
    join(wcHome, 'profiles', 'team', 'config.yaml'),
    stringify({
      mode: 'manager',
      github: { org: 'synthetic-org' },
      fetch: { since: '2026-01-01' },
      reports: [
        {
          name: 'Alice Smith',
          github: 'alice-synthetic',
          email: 'alice@example.com',
          slack: slack(true),
        },
        // No Slack settings: Slack imports nothing for this report
        {
          name: 'Bob Jones',
          github: 'bob-synthetic',
          email: 'bob@example.com',
        },
      ],
    }),
  );
}
setUpWorkspace();

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
    },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

let batches = 0;
/** A fresh staging directory holding the given records */
function batch(...records: Record<string, unknown>[]): string {
  const dir = join(root, `batch-${++batches}`);
  mkdirSync(dir);
  records.forEach((record, i) => stage(dir, `${i}.md`, record));
  return dir;
}

const aboutAlice = { subject: { kind: 'report', reportId: 'alice-smith' } };

describe('work-chronicler import', () => {
  it('imports an IC batch into the profile work log', () => {
    const run = cli('solo', ['import', batch(messageFrontmatter(1)), '--json']);

    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toMatchObject({
      ok: true,
      command: 'import',
      target: { kind: 'ic' },
      summary: { records: 1, created: 1 },
      issues: [],
    });
    expect(
      existsSync(getImportedRecordFilePath(icWorkLog, slackIdentity(1))),
    ).toBe(true);
  });

  it('changes nothing when the same batch is imported again', () => {
    const dir = batch(messageFrontmatter(8));
    expect(cli('solo', ['import', dir]).status).toBe(0);
    const path = getImportedRecordFilePath(icWorkLog, slackIdentity(8));
    const stored = readFileSync(path, 'utf-8');

    const again = cli('solo', ['import', dir, '--json']);

    expect(again.status).toBe(0);
    expect(JSON.parse(again.stdout).summary).toEqual({
      records: 1,
      created: 0,
      updated: 0,
      unchanged: 1,
    });
    expect(readFileSync(path, 'utf-8')).toBe(stored);
  });

  it('refuses Slack records for a report without Slack settings', () => {
    const aboutBob = { subject: { kind: 'report', reportId: 'bob-jones' } };
    const run = cli('team', [
      'import',
      batch(messageFrontmatter(9, aboutBob)),
      '--report',
      'bob-jones',
      '--json',
    ]);

    expect(run.status).toBe(1);
    expect(JSON.parse(run.stdout).issues).toEqual([
      expect.objectContaining({ code: 'SOURCE_RULE', field: 'source' }),
    ]);
    expect(
      existsSync(getImportedRecordFilePath(bobWorkLog, slackIdentity(9))),
    ).toBe(false);
  });

  it("refuses another person's message without echoing it", () => {
    const dir = batch(
      messageFrontmatter(10, {
        attribution: { status: 'verified', authorId: 'U0OTHER01' },
      }),
    );

    const run = cli('solo', ['import', dir]);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain('SOURCE_RULE 0.md attribution.authorId');
    expect(run.stderr).toContain('no records were changed');
    expect(`${run.stdout}${run.stderr}`).not.toContain(SECRET);
    expect(
      existsSync(getImportedRecordFilePath(icWorkLog, slackIdentity(10))),
    ).toBe(false);
  });

  it("imports a manager batch into the report's work log", () => {
    const run = cli('team', [
      'import',
      batch(messageFrontmatter(2, aboutAlice)),
      '--report',
      'alice-smith',
    ]);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain('1 created');
    expect(
      existsSync(getImportedRecordFilePath(aliceWorkLog, slackIdentity(2))),
    ).toBe(true);
  });

  it('rejects a report that is not in the manager profile, writing nothing', () => {
    const subject = { subject: { kind: 'report', reportId: 'carol-jones' } };

    const run = cli('team', [
      'import',
      batch(messageFrontmatter(3, subject)),
      '--report',
      'carol-jones',
      '--json',
    ]);

    expect(run.status).toBe(1);
    expect(JSON.parse(run.stdout).issues).toEqual([
      expect.objectContaining({ code: 'REPORT_NOT_FOUND' }),
    ]);
    expect(existsSync(join(reportsDir, 'carol-jones'))).toBe(false);
  });

  it.each([
    ['a manager profile without --report', 'team', []],
    ['an IC profile with --report', 'solo', ['--report', 'alice-smith']],
  ])('rejects %s', (_label, profile, extra) => {
    const run = cli(profile, [
      'import',
      batch(messageFrontmatter(4)),
      ...extra,
      '--json',
    ]);

    expect(run.status).toBe(1);
    expect(JSON.parse(run.stdout).issues).toEqual([
      expect.objectContaining({ code: 'TARGET_INVALID' }),
    ]);
  });

  it('exits nonzero with errors that never echo record content', () => {
    const dir = batch(messageFrontmatter(5, { attribution: SECRET }));
    writeFileSync(
      join(dir, 'broken.md'),
      `---\nnote: "${SECRET}"\nx: [\n---\n`,
    );

    const json = cli('solo', ['import', dir, '--json']);
    const text = cli('solo', ['import', dir]);

    expect(json.status).toBe(1);
    expect(
      JSON.parse(json.stdout).issues.map((i: { code: string }) => i.code),
    ).toEqual(['SCHEMA_INVALID', 'YAML_INVALID']);
    expect(text.status).toBe(1);
    expect(text.stderr).toContain('YAML_INVALID broken.md');
    expect(text.stderr).toContain('no records were changed');
    for (const output of [json.stdout, json.stderr, text.stdout, text.stderr]) {
      expect(output).not.toContain(SECRET);
    }
    expect(
      existsSync(getImportedRecordFilePath(icWorkLog, slackIdentity(5))),
    ).toBe(false);
  });
});

describe('work-chronicler validate', () => {
  it('accepts a valid batch without writing anything', () => {
    const run = cli('team', [
      'validate',
      batch(messageFrontmatter(6, aboutAlice)),
      '--report',
      'alice-smith',
    ]);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain('Nothing was written');
    expect(
      existsSync(getImportedRecordFilePath(aliceWorkLog, slackIdentity(6))),
    ).toBe(false);
  });

  it('exits nonzero with machine-readable issues for an invalid batch', () => {
    const run = cli('solo', [
      'validate',
      batch(messageFrontmatter(7, aboutAlice)),
      '--json',
    ]);

    expect(run.status).toBe(1);
    expect(JSON.parse(run.stdout)).toMatchObject({
      ok: false,
      command: 'validate',
      issues: [{ code: 'SUBJECT_MISMATCH', file: '0.md', field: 'subject' }],
    });
  });
});
