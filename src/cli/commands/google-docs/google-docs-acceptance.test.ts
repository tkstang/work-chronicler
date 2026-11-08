import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getPRFilePath,
  getTicketFilePath,
  type JiraTicket,
  type PullRequest,
  writeMarkdownFile,
} from '@core/index';
import { createServer, createToolServer } from '@mcp/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterAll, describe, expect, it, vi } from 'vitest';

/** These tests run the CLI several times; slow CI runners need more than the 5 s default */
const CLI_RUNS = { timeout: 60_000 };

// Acceptance for the Google Docs import contract: literal staged records in
// the layout work-chronicler-import-google-docs writes go through the real
// CLI, as the skill runs it (`google-docs show --json`, then its import
// command): validate → import → link → the MCP server's search_documents,
// for an IC and for a configured report, and refusal for a report without
// Google Docs settings. What the skill keeps (owned, in range, readable, not
// empty) is skill prose, reviewed with the skill, not re-implemented here.
// The CLI runs in a child process with HOME and the workspace in a temporary
// directory. Every account, ID and text is synthetic. Per-rule refusals are
// covered in @core/import/google-docs-rules.test.ts and the import command
// tests.

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const skillPath = join(
  repoRoot,
  '.agents/skills/work-chronicler-import-google-docs/SKILL.md',
);
const root = mkdtempSync(join(tmpdir(), 'wc-gdocs-acceptance-'));
const home = join(root, 'home');
const wcHome = join(root, 'wc-home');
const profileDir = (name: string) => join(wcHome, 'profiles', name);
const soloWorkLog = join(profileDir('solo'), 'work-log');
const reportWorkLog = (id: string) =>
  join(profileDir('team'), 'reports', id, 'work-log');
const aliceWorkLog = reportWorkLog('alice-smith');
const bobWorkLog = reportWorkLog('bob-jones');

const IC_ACCOUNT = 'synthetic.ic@example.com';
const ALICE_ACCOUNT = 'alice.synthetic@example.com';
const OTHER_ACCOUNT = 'someone.else@example.com';
const DOC_A = '1SyntheticDocAaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const DOC_B = '1SyntheticDocBbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const DOC_OTHER = '1SyntheticDocOtherooooooooooooooooooooooooo';
const DOC_ALICE = '1SyntheticDocAliceaaaaaaaaaaaaaaaaaaaaaaaa';
const PR_URL = 'https://github.com/synthetic-org/synthetic-api/pull/42';
/** Planted in a Doc the subject does not own: it must never reach output */
const OTHERS_TEXT = 'zebra-quartz-not-the-subjects-doc';

mkdirSync(home, { recursive: true });
for (const dir of [soloWorkLog, aliceWorkLog, bobWorkLog]) {
  mkdirSync(dir, { recursive: true });
}
mkdirSync(join(profileDir('example'), 'work-log'), { recursive: true });
for (const name of ['solo', 'example']) {
  writeFileSync(
    join(profileDir(name), 'config.yaml'),
    [
      'github:',
      '  username: synthetic-ic',
      '  orgs: []',
      'output:',
      '  directory: ./work-log',
      'fetch:',
      '  since: "2026-01-01"',
      '  until: "2026-06-30"',
      '',
    ].join('\n'),
  );
}
// Google Docs is set up for Alice below, with the CLI; Bob has no settings
writeFileSync(
  join(profileDir('team'), 'config.yaml'),
  [
    'mode: manager',
    'github:',
    '  org: synthetic-org',
    'fetch:',
    '  since: "2026-01-01"',
    'reports:',
    '  - name: Alice Smith',
    '    github: alice-synthetic',
    '    email: alice@example.com',
    '  - name: Bob Jones',
    '    github: bob-synthetic',
    '    email: bob@example.com',
    '',
  ].join('\n'),
);

/** A PR and a ticket the Docs mention, in a work log */
function writeMentionedWork(workLog: string): void {
  writeMarkdownFile(
    getPRFilePath(
      workLog,
      'synthetic-org',
      'synthetic-api',
      new Date('2026-01-02T00:00:00Z'),
      42,
    ),
    {
      title: 'Add usage-based invoices',
      prNumber: 42,
      repository: 'synthetic-org/synthetic-api',
      org: 'synthetic-org',
      author: 'synthetic-ic',
      state: 'merged',
      createdAt: '2026-01-02T10:00:00Z',
      mergedAt: '2026-01-03T10:00:00Z',
      closedAt: null,
      url: PR_URL,
      additions: 10,
      deletions: 2,
      changedFiles: 3,
      jiraTickets: [],
      labels: [],
    } satisfies PullRequest,
    'Synthetic PR body',
  );
  writeMarkdownFile(
    getTicketFilePath(workLog, 'synthetic-org', 'SYN', 'SYN-7'),
    {
      key: 'SYN-7',
      summary: 'Retry failed invoice runs',
      project: 'SYN',
      org: 'synthetic-org',
      issueType: 'Story',
      status: 'Done',
      storyPoints: null,
      url: 'https://synthetic.atlassian.net/browse/SYN-7',
      createdAt: '2026-01-01T09:00:00Z',
      resolvedAt: null,
      linkedPRs: [],
    } satisfies JiraTicket,
    'Synthetic ticket body',
  );
}
writeMentionedWork(soloWorkLog);
writeMentionedWork(aliceWorkLog);

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

function json(profile: string, args: string[]) {
  const run = cli(profile, [...args, '--json']);
  return { status: run.status, value: JSON.parse(run.stdout) };
}

/** What `google-docs show --json` prints (the fields the skill reads) */
interface GoogleDocsShow {
  configured: boolean;
  range: { since: string; until: string | null };
  account: string | null;
  record: Record<string, unknown> | null;
  excerptMaxBytes: number;
  importCommand: string[];
}

/** Write staged record files */
function stageFiles(dir: string, files: Record<string, string>): void {
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(dir, name), text);
  }
}

/** The IC's two Docs as staged records; a rerun changes capturedAt */
const icBatch = (capturedAt: string): Record<string, string> => ({
  '1.md': `---
schemaVersion: 1
type: document
source: google-docs
sourceAccount: "${IC_ACCOUNT}"
sourceId: "${DOC_A}"
url: "https://docs.google.com/document/d/${DOC_A}/edit?usp=drivesdk"
occurredAt: "2026-02-10T16:20:00.000Z"
updatedAt: "2026-02-10T16:20:00.000Z"
capturedAt: "${capturedAt}"
subject: { kind: ic }
attribution: { status: unverified, authorId: null }
mentions: { tickets: [SYN-7], pullRequests: ["${PR_URL}"] }
document:
  title: "Invoicing design: \\"phase 2\\""
  mimeType: application/vnd.google-apps.document
  createdAt: "2025-11-03T10:00:00.000Z"
  owners: ["${IC_ACCOUNT}"]
  driveId: null
  truncated: false
---

Goals: bill accounts by usage (SYN-7), shipped in ${PR_URL}.
`,
  '2.md': `---
schemaVersion: 1
type: document
source: google-docs
sourceAccount: "${IC_ACCOUNT}"
sourceId: "${DOC_B}"
url: "https://docs.google.com/document/d/${DOC_B}/edit"
occurredAt: "2026-03-01T08:00:00.000Z"
updatedAt: "2026-03-01T08:00:00.000Z"
capturedAt: "${capturedAt}"
subject: { kind: ic }
attribution: { status: unverified, authorId: null }
mentions: { tickets: [SYN-999], pullRequests: [] }
document:
  title: "Retry runbook"
  mimeType: application/vnd.google-apps.document
  createdAt: "2026-02-20T08:00:00.000Z"
  owners: ["${IC_ACCOUNT}"]
  driveId: null
  truncated: true
---

Step one: plan SYN-999 next.
`,
});

/** A Doc for a manager's report, staged for the manager's import */
const reportRecord = (reportId: string, account: string): string => `---
schemaVersion: 1
type: document
source: google-docs
sourceAccount: "${account}"
sourceId: "${DOC_ALICE}"
url: "https://docs.google.com/document/d/${DOC_ALICE}/edit?usp=drivesdk"
occurredAt: "2026-03-02T10:00:00.000Z"
updatedAt: "2026-03-02T10:00:00.000Z"
capturedAt: "2026-03-05T09:00:00Z"
subject: { kind: report, reportId: ${reportId} }
attribution: { status: unverified, authorId: null }
mentions: { tickets: [], pullRequests: ["${PR_URL}"] }
document:
  title: "Report design notes"
  mimeType: application/vnd.google-apps.document
  createdAt: "2026-03-01T10:00:00.000Z"
  owners: ["${account}"]
  driveId: null
  truncated: false
---

Report design notes for ${PR_URL}.
`;

/** The `importCommand` argv from `google-docs show`, as `validate` or `import` */
function fromImportCommand(
  show: GoogleDocsShow,
  command: 'validate' | 'import',
  staging: string,
): string[] {
  const [bin, ...args] = show.importCommand;
  expect(bin).toBe('work-chronicler');
  return args.map((arg) =>
    arg === 'import' ? command : arg === '<staging-dir>' ? staging : arg,
  );
}

function storedRecords(workLog: string): string[] {
  const dir = join(workLog, 'documents', 'google-docs');
  return existsSync(dir)
    ? readdirSync(dir).map((name) => readFileSync(join(dir, name), 'utf-8'))
    : [];
}

/** Connect an MCP client to a server and call search_documents on it */
async function withSearch(
  server: McpServer,
  run: (
    search: (args: Record<string, unknown>) => Promise<any>,
  ) => Promise<void>,
): Promise<void> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'acceptance', version: '0.0.0' });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    await run(async (args) => {
      const result = await client.callTool({
        name: 'search_documents',
        arguments: args,
      });
      const [content] = result.content as { type: string; text: string }[];
      return JSON.parse(content?.text ?? '');
    });
  } finally {
    await client.close();
  }
}

describe('Google Docs import skill: IC acceptance', CLI_RUNS, () => {
  it('stages, validates, imports, links and serves the subject’s own Docs', async () => {
    // Setup: the account is stored in lower case
    expect(json('solo', ['google-docs', 'show']).value.configured).toBe(false);
    expect(
      cli('solo', [
        'google-docs',
        'configure',
        '--account',
        'Synthetic.IC@Example.com',
      ]).status,
    ).toBe(0);

    // Import, as work-chronicler-import-google-docs runs it
    const show = json('solo', ['google-docs', 'show']).value as GoogleDocsShow;
    expect(show).toMatchObject({
      configured: true,
      account: IC_ACCOUNT,
      range: { since: '2026-01-01', until: '2026-06-30' },
      excerptMaxBytes: 16384,
    });
    expect(show.record).toEqual({
      type: 'document',
      source: 'google-docs',
      sourceAccount: IC_ACCOUNT,
      subject: { kind: 'ic' },
      attribution: { status: 'unverified', authorId: null },
      document: { mimeType: 'application/vnd.google-apps.document' },
    });

    // The CLI keeps other people's Docs out: a Doc shared with the subject
    // but owned by someone else is refused, and its text is never echoed
    const others = join(root, 'staging-ic-others');
    stageFiles(others, {
      '1.md': `---
schemaVersion: 1
type: document
source: google-docs
sourceAccount: "${IC_ACCOUNT}"
sourceId: "${DOC_OTHER}"
url: null
occurredAt: "2026-02-11T10:00:00.000Z"
updatedAt: "2026-02-11T10:00:00.000Z"
capturedAt: "2026-07-02T08:00:00Z"
subject: { kind: ic }
attribution: { status: unverified, authorId: null }
mentions: { tickets: [], pullRequests: [] }
document:
  title: "Shared with me"
  mimeType: application/vnd.google-apps.document
  createdAt: "2026-02-01T10:00:00.000Z"
  owners: ["${OTHER_ACCOUNT}"]
  driveId: null
  truncated: false
---

${OTHERS_TEXT}
`,
    });
    const notTheirs = json('solo', fromImportCommand(show, 'import', others));
    expect(notTheirs.status).toBe(1);
    expect(notTheirs.value.issues).toEqual([
      expect.objectContaining({
        code: 'SOURCE_RULE',
        file: '1.md',
        field: 'document.owners',
      }),
    ]);
    expect(JSON.stringify(notTheirs.value)).not.toContain(OTHERS_TEXT);
    expect(storedRecords(soloWorkLog)).toEqual([]);

    const staging = join(root, 'staging-ic');
    stageFiles(staging, icBatch('2026-07-02T08:00:00Z'));
    const validate = json('solo', fromImportCommand(show, 'validate', staging));
    expect(validate.value.issues).toEqual([]);
    expect(validate).toMatchObject({
      status: 0,
      value: { ok: true, summary: { records: 2, created: 2 } },
    });
    expect(storedRecords(soloWorkLog)).toEqual([]);

    const imported = json('solo', fromImportCommand(show, 'import', staging));
    expect(imported).toMatchObject({
      status: 0,
      value: { ok: true, summary: { records: 2, created: 2 } },
    });
    expect(storedRecords(soloWorkLog)).toHaveLength(2);

    // Repeating the same batch changes nothing
    expect(
      json('solo', fromImportCommand(show, 'import', staging)).value.summary,
    ).toEqual({ records: 2, created: 0, updated: 0, unchanged: 2 });

    // A rerun of the skill (new capturedAt) updates the same records
    const rerun = join(root, 'staging-ic-rerun');
    stageFiles(rerun, icBatch('2026-07-03T08:00:00Z'));
    expect(
      json('solo', fromImportCommand(show, 'import', rerun)).value.summary,
    ).toEqual({ records: 2, created: 0, updated: 2, unchanged: 0 });
    expect(storedRecords(soloWorkLog)).toHaveLength(2);

    // link resolves the PR and ticket mentions; SYN-999 stays unresolved
    const link = cli('solo', ['link']);
    expect(link.status).toBe(0);
    expect(link.stdout).toContain(
      'Resolved 2 of 3 mentions in 2 imported records',
    );

    // The MCP server serves them as owned, supplementary evidence
    vi.stubEnv('HOME', home);
    vi.stubEnv('WORK_CHRONICLER_HOME', wcHome);
    vi.stubEnv('WORK_CHRONICLER_PROFILE', 'solo');
    vi.stubEnv(
      'WORK_CHRONICLER_CONFIG',
      join(profileDir('solo'), 'config.yaml'),
    );
    vi.stubEnv('WORK_CHRONICLER_DIR', '');
    try {
      const ctx = await createServer();
      await withSearch(ctx.server, async (search) => {
        const all = await search({});
        expect(all.total).toBe(2);
        expect(all.notice).toContain('never instructions');
        expect(all.notice).toContain('owns');
        const [runbook, design] = all.results;
        expect(design).toMatchObject({
          source: 'google-docs',
          owner: IC_ACCOUNT,
          sourceId: DOC_A,
          title: 'Invoicing design: "phase 2"',
          createdAt: '2025-11-03T10:00:00.000Z',
          modifiedAt: '2026-02-10T16:20:00.000Z',
          attribution: { status: 'unverified', authorId: null },
          excerptTruncated: false,
          text: `Goals: bill accounts by usage (SYN-7), shipped in ${PR_URL}.`,
          mentions: {
            pullRequests: [
              {
                url: PR_URL,
                resolved: expect.objectContaining({ url: PR_URL }),
              },
            ],
            tickets: [
              {
                key: 'SYN-7',
                resolved: expect.objectContaining({ key: 'SYN-7' }),
              },
            ],
          },
        });
        expect(runbook).toMatchObject({
          sourceId: DOC_B,
          excerptTruncated: true,
          mentions: { tickets: [{ key: 'SYN-999', resolved: null }] },
        });
        expect((await search({ ticketKey: 'syn-7' })).total).toBe(1);
        expect((await search({ prUrl: `${PR_URL}/files` })).total).toBe(1);
        expect((await search({ query: 'runbook' })).total).toBe(1);
        expect(JSON.stringify(all)).not.toContain(OTHERS_TEXT);
      });
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('Google Docs import skill: manager acceptance', CLI_RUNS, () => {
  it("imports a configured report's Docs into the report's work log and serves them", async () => {
    expect(
      cli('team', [
        'google-docs',
        'configure',
        '--report',
        'alice-smith',
        '--account',
        ALICE_ACCOUNT,
      ]).status,
    ).toBe(0);
    const show = json('team', [
      'google-docs',
      'show',
      '--report',
      'alice-smith',
    ]).value as GoogleDocsShow;
    // The report's own account, not the manager's
    expect(show).toMatchObject({ configured: true, account: ALICE_ACCOUNT });
    expect(show.record).toMatchObject({
      sourceAccount: ALICE_ACCOUNT,
      subject: { kind: 'report', reportId: 'alice-smith' },
      attribution: { status: 'unverified', authorId: null },
    });
    expect(show.importCommand).toEqual(
      expect.arrayContaining(['--report', 'alice-smith']),
    );

    const staging = join(root, 'staging-alice');
    stageFiles(staging, { '1.md': reportRecord('alice-smith', ALICE_ACCOUNT) });
    const validate = json('team', fromImportCommand(show, 'validate', staging));
    expect(validate.value.issues).toEqual([]);
    expect(validate).toMatchObject({
      status: 0,
      value: { ok: true, summary: { records: 1, created: 1 } },
    });

    const imported = json('team', fromImportCommand(show, 'import', staging));
    expect(imported).toMatchObject({
      status: 0,
      value: {
        target: { kind: 'report', reportId: 'alice-smith' },
        summary: { created: 1 },
      },
    });
    expect(storedRecords(aliceWorkLog)).toHaveLength(1);
    expect(storedRecords(bobWorkLog)).toEqual([]);

    // `link` has no report target; the MCP tool resolves the report's
    // mentions against the report's own work log
    await withSearch(
      createToolServer({ workLogDir: aliceWorkLog }),
      async (search) => {
        const all = await search({});
        expect(all.total).toBe(1);
        expect(all.results[0]).toMatchObject({
          owner: ALICE_ACCOUNT,
          subject: { kind: 'report', reportId: 'alice-smith' },
          mentions: {
            pullRequests: [
              {
                url: PR_URL,
                resolved: expect.objectContaining({ url: PR_URL }),
              },
            ],
          },
        });
      },
    );
  });

  it('refuses Docs for a report without Google Docs settings', () => {
    const show = json('team', ['google-docs', 'show', '--report', 'bob-jones'])
      .value as GoogleDocsShow;
    expect(show).toMatchObject({
      configured: false,
      account: null,
      record: null,
    });
    const staging = join(root, 'staging-bob');
    stageFiles(staging, { '1.md': reportRecord('bob-jones', ALICE_ACCOUNT) });

    for (const command of ['validate', 'import'] as const) {
      const refused = json('team', fromImportCommand(show, command, staging));
      expect(refused.status).toBe(1);
      expect(refused.value.issues).toEqual([
        expect.objectContaining({
          code: 'SOURCE_RULE',
          file: '1.md',
          field: 'source',
        }),
      ]);
    }
    expect(storedRecords(bobWorkLog)).toEqual([]);
  });
});

describe('import-google-docs skill text', CLI_RUNS, () => {
  const text = readFileSync(skillPath, 'utf-8');

  it('runs gog read-only and never drops the page token', () => {
    const commands = [...text.matchAll(/```bash\n([\s\S]*?)```/g)]
      .map((match) => (match[1] as string).replace(/\\\n\s*/g, ''))
      .flatMap((block) => block.split('\n'))
      .filter((line) => line.trimStart().startsWith('gog '));
    expect(commands.length).toBeGreaterThanOrEqual(3);
    for (const command of commands) {
      expect(command).toContain('--readonly');
      expect(command).toContain('--no-input');
      expect(command).not.toContain('--results-only');
    }
  });

  it('has an example record that validates against matching settings', () => {
    const examples = [
      ...text
        .slice(text.indexOf('## Example Record'))
        .matchAll(/```markdown\n([\s\S]*?)```/g),
    ].map((match) => match[1] as string);
    expect(examples).toHaveLength(1);
    expect(
      cli('example', [
        'google-docs',
        'configure',
        '--account',
        'you@example.com',
      ]).status,
    ).toBe(0);
    const staging = join(root, 'staging-examples');
    stageFiles(staging, { '1.md': examples[0] as string });

    const run = json('example', ['validate', staging]);

    expect(run.value.issues).toEqual([]);
    expect(run).toMatchObject({
      status: 0,
      value: { ok: true, summary: { records: 1 } },
    });
  });
});
