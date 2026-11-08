import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  docIdentity,
  documentFrontmatter,
  messageFrontmatter,
  SECRET,
  stage,
  SYNTH_GOOGLE_ACCOUNT,
} from '@core/import/import.test-support';
import { getImportedRecordFilePath } from '@storage/paths';
import { afterAll, describe, expect, it } from 'vitest';
import { stringify } from 'yaml';

/** These tests run the CLI several times; slow CI runners need more than the 5 s default */
const CLI_RUNS = { timeout: 60_000 };

// `import` and `validate` with Google Docs records, run as the real CLI in a
// child process with HOME and the workspace in a temporary directory: the
// configured fetch range, --since/--until, and per-report opt-in, as the
// import skill sees them. All accounts and IDs are synthetic.

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'wc-import-docs-cli-'));
const home = join(root, 'home');
const wcHome = join(root, 'wc-home');
const icWorkLog = join(wcHome, 'profiles', 'solo', 'work-log');
const reportsDir = join(wcHome, 'profiles', 'team', 'reports');
const aliceWorkLog = join(reportsDir, 'alice-smith', 'work-log');
const bobWorkLog = join(reportsDir, 'bob-jones', 'work-log');

mkdirSync(home, { recursive: true });
for (const dir of [icWorkLog, aliceWorkLog, bobWorkLog]) {
  mkdirSync(dir, { recursive: true });
}
writeFileSync(
  join(wcHome, 'profiles', 'solo', 'config.yaml'),
  stringify({
    github: { username: 'synthetic-ic', orgs: [] },
    output: { directory: './work-log' },
    fetch: { since: '2026-01-01', until: '2026-03-02' },
    googleDocs: { account: SYNTH_GOOGLE_ACCOUNT },
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
        // Alice's own account, not the manager's
        googleDocs: { account: SYNTH_GOOGLE_ACCOUNT },
      },
      // No Google Docs settings: nothing is imported for this report
      { name: 'Bob Jones', github: 'bob-synthetic', email: 'bob@example.com' },
    ],
  }),
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
  expect(`${result.stdout}${result.stderr}`).not.toContain(SECRET);
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    json: () => JSON.parse(result.stdout),
  };
}

let batches = 0;
function batch(...records: Record<string, unknown>[]): string {
  const dir = join(root, `batch-${++batches}`);
  mkdirSync(dir);
  records.forEach((record, i) =>
    stage(dir, `${i}.md`, record, `Synthetic Doc text. ${SECRET}`),
  );
  return dir;
}

/** Doc `n`, modified at `modified` (and captured just after) */
function modifiedAt(n: number, modified: string, extra = {}) {
  return documentFrontmatter(n, {
    occurredAt: modified,
    updatedAt: modified,
    capturedAt: '2026-08-01T00:00:00Z',
    ...extra,
  });
}

const aboutAlice = { subject: { kind: 'report', reportId: 'alice-smith' } };

describe('import and validate: Google Docs', CLI_RUNS, () => {
  it('imports an owned Doc modified late on the configured until day, and echoes the range', () => {
    const run = cli('solo', [
      'import',
      batch(modifiedAt(1, '2026-03-02T23:59:59Z')),
      '--json',
    ]);

    expect(run.status).toBe(0);
    expect(run.json()).toMatchObject({
      ok: true,
      summary: { created: 1 },
      range: {
        since: '2026-01-01T00:00:00.000Z',
        until: '2026-03-02T23:59:59.999Z',
        overridden: false,
      },
    });
    expect(
      existsSync(getImportedRecordFilePath(icWorkLog, docIdentity(1))),
    ).toBe(true);
  });

  it('refuses a Doc modified after the range, and validate and import accept it with the same override', () => {
    const dir = batch(modifiedAt(2, '2026-04-10T09:00:00Z'));
    const refused = cli('solo', ['validate', dir, '--json']);
    expect(refused.status).toBe(1);
    expect(refused.json().issues).toEqual([
      expect.objectContaining({ code: 'SOURCE_RULE', field: 'occurredAt' }),
    ]);

    const override = ['--since', '2026-04-01', '--until', '2026-04-10'];
    const validated = cli('solo', ['validate', dir, ...override, '--json']);
    const imported = cli('solo', ['import', dir, ...override, '--json']);
    for (const run of [validated, imported]) {
      expect(run.status).toBe(0);
      expect(run.json().range).toEqual({
        since: '2026-04-01T00:00:00.000Z',
        until: '2026-04-10T23:59:59.999Z',
        overridden: true,
      });
    }
    expect(validated.json().summary.created).toBe(1);
    expect(imported.json().summary.created).toBe(1);

    const text = cli('solo', ['import', dir, ...override]);
    expect(text.status).toBe(0);
    expect(text.stdout).toContain('from --since/--until');
    expect(text.stdout).toContain('1 unchanged');
  });

  it('refuses a malformed --until, for Docs and Slack batches alike', () => {
    for (const record of [
      modifiedAt(3, '2026-02-01T00:00:00Z'),
      messageFrontmatter(1),
    ]) {
      const run = cli('solo', [
        'import',
        batch(record),
        '--until',
        '2026-02-30',
        '--json',
      ]);
      expect(run.status).toBe(1);
      expect(run.json().issues).toEqual([
        expect.objectContaining({ code: 'RANGE_INVALID' }),
      ]);
    }
    expect(
      existsSync(getImportedRecordFilePath(icWorkLog, docIdentity(3))),
    ).toBe(false);
  });

  it("imports a configured report's Doc into its work log", () => {
    const run = cli('team', [
      'import',
      batch(modifiedAt(4, '2026-05-01T00:00:00Z', aboutAlice)),
      '--report',
      'alice-smith',
      '--json',
    ]);

    expect(run.status).toBe(0);
    // The manager profile's fetch range has no end
    expect(run.json().range.until).toBeNull();
    expect(
      existsSync(getImportedRecordFilePath(aliceWorkLog, docIdentity(4))),
    ).toBe(true);
  });

  it('refuses Docs for a report without Google Docs settings', () => {
    const aboutBob = { subject: { kind: 'report', reportId: 'bob-jones' } };
    const run = cli('team', [
      'validate',
      batch(modifiedAt(5, '2026-05-01T00:00:00Z', aboutBob)),
      '--report',
      'bob-jones',
      '--json',
    ]);

    expect(run.status).toBe(1);
    expect(run.json().issues).toEqual([
      expect.objectContaining({ code: 'SOURCE_RULE', field: 'source' }),
    ]);
  });
});
