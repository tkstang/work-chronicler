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
import { createServer } from '@mcp/server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterAll, describe, expect, it, vi } from 'vitest';

/** These tests run the built CLI several times; slow CI runners need more than the 5 s default */
const CLI_RUNS = { timeout: 60_000 };

// Acceptance for the Slack import contract: literal staged records in the
// layout work-chronicler-import-slack writes go through the real CLI, as the
// skill runs it (`slack show --json`, then its import command):
// validate → import → link → the MCP server's search_messages. Which messages
// the skill keeps (in range, with text) is skill prose, reviewed with the
// skill, not re-implemented here; what the CLI itself refuses is tested at
// its boundary. The CLI runs in a child process with HOME and the workspace
// in a temporary directory. Every ID, name and text is synthetic. Per-rule
// refusals are covered in @core/import/slack-rules.test.ts and the import
// and slack command tests.

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const skillPath = join(
  repoRoot,
  '.agents/skills/work-chronicler-import-slack/SKILL.md',
);
const root = mkdtempSync(join(tmpdir(), 'wc-slack-acceptance-'));
const home = join(root, 'home');
const wcHome = join(root, 'wc-home');
const profileDir = (name: string) => join(wcHome, 'profiles', name);
const soloWorkLog = join(profileDir('solo'), 'work-log');
const aliceWorkLog = join(
  profileDir('team'),
  'reports',
  'alice-smith',
  'work-log',
);

/** The report's workspace, configured by team ID */
const WORKSPACE = 'T0TEST0001';
/** The IC's workspace, configured by URL label (no tool shows its team ID) */
const IC_WORKSPACE = 'example';
const USER = 'U0TEST0001';
const OTHER_USER = 'U0OTHER0001';
const CHANNEL = 'C0TEST0001';
const UNSHARED = 'C0TEST0002';
const HOST = 'https://synthetic.slack.com';
/** Message search permalinks on Enterprise Grid use this host form */
const IC_HOST = 'https://example.enterprise.slack.com';
const PR_URL = 'https://github.com/synthetic-org/synthetic-api/pull/42';
/** A display name inside a mention token: it must never be stored */
const OTHER_NAME = 'Other Person';
/** Planted in another person's text: it must never reach the work log */
const OTHERS_TEXT = 'zebra-quartz-not-the-subject';

mkdirSync(home, { recursive: true });
mkdirSync(soloWorkLog, { recursive: true });
mkdirSync(aliceWorkLog, { recursive: true });
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
// A report whose settings list one channel confirmed as shared and one that
// is not (as a hand edit could leave it; `slack channels add` refuses that)
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
    '    slack:',
    `      workspace: ${WORKSPACE}`,
    `      user: ${USER}`,
    '      channels:',
    `        - id: ${CHANNEL}`,
    '          name: synthetic-eng',
    '          reason: Team work',
    '          sharedWithManager: true',
    `        - id: ${UNSHARED}`,
    '          name: synthetic-other',
    '          reason: Not shared',
    '',
  ].join('\n'),
);

// Work the messages mention: one PR and one ticket
writeMarkdownFile(
  getPRFilePath(
    soloWorkLog,
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
  getTicketFilePath(soloWorkLog, 'synthetic-org', 'SYN', 'SYN-7'),
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

/** What `slack show --json` prints (the fields the skill reads) */
interface SlackShow {
  configured: boolean;
  range: { since: string; until: string | null };
  workspace: string;
  user: string;
  channels: {
    id: string;
    name: string;
    private: boolean;
    importable: boolean;
  }[];
  record: {
    source: string;
    sourceAccount: string;
    subject: unknown;
    attribution: unknown;
  };
  importCommand: string[];
}

/** Write staged record files */
function stageFiles(dir: string, files: Record<string, string>): void {
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    writeFileSync(join(dir, name), text);
  }
}

// The IC's messages (Slack timestamps: seconds since 1970 and microseconds)
/** A thread the subject started, 2026-01-05T10:00:00Z */
const STARTER_TS = '1767607200.000100';
/** A thread someone else started, 2026-01-06T09:00:00Z */
const PARENT_TS = '1767690000.000100';
/** The subject's reply in that thread, 2026-01-06T09:30:00Z */
const REPLY_TS = '1767691800.000200';
/** A top-level message, 2026-02-01T12:00:00Z */
const PLAIN_TS = '1769947200.000300';
/** Another person's reply in the same thread, 2026-01-06T09:10:00Z */
const OTHERS_TS = '1767690600.000600';
/** The starter's text as search returns it, with Slack markup */
const RAW_STARTER_TEXT = `Invoices are live: <${PR_URL}|github.com/synthetic-org/synthetic-api/pull/42> thanks <@${OTHER_USER}|${OTHER_NAME}>`;

/** The IC's three messages as staged records; a rerun changes capturedAt */
const icBatch = (capturedAt: string): Record<string, string> => ({
  '1.md': `---
schemaVersion: 1
type: message
source: slack
sourceAccount: "${IC_WORKSPACE}"
sourceId: "${CHANNEL}/${STARTER_TS}"
url: "${IC_HOST}/archives/${CHANNEL}/p1767607200000100"
occurredAt: "2026-01-05T10:00:00Z"
updatedAt: null
capturedAt: "${capturedAt}"
subject: { kind: ic }
attribution: { status: verified, authorId: "${USER}" }
mentions: { tickets: [], pullRequests: ["${PR_URL}"] }
message:
  container: { id: "${CHANNEL}", name: "synthetic-eng" }
  thread: null
  replyCount: 0
  replyParticipantCount: 0
---

Invoices are live: ${PR_URL} thanks @someone
`,
  '2.md': `---
schemaVersion: 1
type: message
source: slack
sourceAccount: "${IC_WORKSPACE}"
sourceId: "${CHANNEL}/${REPLY_TS}"
url: "${IC_HOST}/archives/${CHANNEL}/p1767691800000200?thread_ts=${PARENT_TS}&cid=${CHANNEL}"
occurredAt: "2026-01-06T09:30:00Z"
updatedAt: null
capturedAt: "${capturedAt}"
subject: { kind: ic }
attribution: { status: verified, authorId: "${USER}" }
mentions: { tickets: [SYN-7], pullRequests: [] }
message:
  container: { id: "${CHANNEL}", name: "synthetic-eng" }
  thread: { parentId: "${PARENT_TS}", parentUrl: "${IC_HOST}/archives/${CHANNEL}/p1767690000000100" }
  replyCount: 0
  replyParticipantCount: 0
---

I will take the retry fix in SYN-7
`,
  '3.md': `---
schemaVersion: 1
type: message
source: slack
sourceAccount: "${IC_WORKSPACE}"
sourceId: "${CHANNEL}/${PLAIN_TS}"
url: "${IC_HOST}/archives/${CHANNEL}/p1769947200000300"
occurredAt: "2026-02-01T12:00:00Z"
updatedAt: null
capturedAt: "${capturedAt}"
subject: { kind: ic }
attribution: { status: verified, authorId: "${USER}" }
mentions: { tickets: [SYN-999], pullRequests: [] }
message:
  container: { id: "${CHANNEL}", name: "synthetic-eng" }
  thread: null
  replyCount: 0
  replyParticipantCount: 0
---

Planning SYN-999 next
`,
});

/** A report's message, staged for the manager's import */
const aliceRecord = (
  channel: string,
  channelName: string,
  ts: string,
): string => `---
schemaVersion: 1
type: message
source: slack
sourceAccount: "${WORKSPACE}"
sourceId: "${channel}/${ts}"
url: "${HOST}/archives/${channel}/p${ts.replace('.', '')}"
occurredAt: "2026-03-02T10:00:00Z"
updatedAt: null
capturedAt: "2026-03-05T09:00:00Z"
subject: { kind: report, reportId: alice-smith }
attribution: { status: verified, authorId: "${USER}" }
mentions: { tickets: [], pullRequests: [] }
message:
  container: { id: "${channel}", name: "${channelName}" }
  thread: null
  replyCount: 0
  replyParticipantCount: 0
---

Report message
`;

/** The `importCommand` argv from `slack show`, as `validate` or `import` */
function fromImportCommand(
  show: SlackShow,
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
  const dir = join(workLog, 'messages', 'slack');
  return existsSync(dir)
    ? readdirSync(dir).map((name) => readFileSync(join(dir, name), 'utf-8'))
    : [];
}

describe('Slack import skill: IC acceptance', CLI_RUNS, () => {
  it('stages, validates, imports, links and serves the subject’s own messages', async () => {
    // Setup, as work-chronicler-setup-slack runs it
    expect(json('solo', ['slack', 'show']).value.configured).toBe(false);
    expect(
      cli('solo', [
        'slack',
        'configure',
        '--workspace',
        IC_WORKSPACE,
        '--user',
        USER,
      ]).status,
    ).toBe(0);
    expect(
      cli('solo', [
        'slack',
        'channels',
        'add',
        CHANNEL,
        '--name',
        'synthetic-eng',
        '--reason',
        'Launch coordination',
      ]).status,
    ).toBe(0);

    // Import, as work-chronicler-import-slack runs it: `slack show` prints
    // the record fields the staged records carry, and the import command
    const show = json('solo', ['slack', 'show']).value as SlackShow;
    expect(show.configured).toBe(true);
    expect(show.record).toEqual({
      source: 'slack',
      sourceAccount: IC_WORKSPACE,
      subject: { kind: 'ic' },
      attribution: { status: 'verified', authorId: USER },
    });
    const staging = join(root, 'staging-ic');
    const batch = icBatch('2026-07-02T08:00:00Z');
    stageFiles(staging, batch);

    // The CLI keeps Slack markup out: the same record with its raw search
    // text (a <@U…|name> mention and a <url|label> link) is refused, and the
    // name is never echoed
    const raw = join(root, 'staging-ic-raw');
    const starter = batch['1.md'] ?? '';
    const header = starter.slice(0, starter.lastIndexOf('\n---\n') + 5);
    stageFiles(raw, { '1.md': `${header}\n${RAW_STARTER_TEXT}\n` });
    const refused = json('solo', fromImportCommand(show, 'validate', raw));
    expect(refused.status).toBe(1);
    expect(refused.value.issues).toEqual([
      expect.objectContaining({
        code: 'SOURCE_RULE',
        file: '1.md',
        field: 'body',
      }),
    ]);
    expect(JSON.stringify(refused.value)).not.toContain(OTHER_NAME);

    // The CLI keeps other people's messages out: a reply by someone else in
    // the subject's channel is refused, and its text is never echoed
    const others = join(root, 'staging-ic-others');
    stageFiles(others, {
      '1.md': `---
schemaVersion: 1
type: message
source: slack
sourceAccount: "${IC_WORKSPACE}"
sourceId: "${CHANNEL}/${OTHERS_TS}"
url: "${IC_HOST}/archives/${CHANNEL}/p1767690600000600?thread_ts=${PARENT_TS}&cid=${CHANNEL}"
occurredAt: "2026-01-06T09:10:00Z"
updatedAt: null
capturedAt: "2026-07-02T08:00:00Z"
subject: { kind: ic }
attribution: { status: verified, authorId: "${OTHER_USER}" }
mentions: { tickets: [], pullRequests: [] }
message:
  container: { id: "${CHANNEL}", name: "synthetic-eng" }
  thread: { parentId: "${PARENT_TS}", parentUrl: "${IC_HOST}/archives/${CHANNEL}/p1767690000000100" }
  replyCount: 0
  replyParticipantCount: 0
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
        field: 'attribution.authorId',
      }),
    ]);
    expect(JSON.stringify(notTheirs.value)).not.toContain(OTHERS_TEXT);
    expect(storedRecords(soloWorkLog)).toEqual([]);

    const validate = json('solo', fromImportCommand(show, 'validate', staging));
    expect(validate.value.issues).toEqual([]);
    expect(validate).toMatchObject({
      status: 0,
      value: { ok: true, summary: { records: 3, created: 3 } },
    });
    expect(storedRecords(soloWorkLog)).toEqual([]);

    const imported = json('solo', fromImportCommand(show, 'import', staging));
    expect(imported).toMatchObject({
      status: 0,
      value: { ok: true, summary: { records: 3, created: 3 } },
    });
    const stored = storedRecords(soloWorkLog);
    expect(stored).toHaveLength(3);
    // What the import stored (the CLI refuses raw markup, as checked above)
    for (const record of stored) {
      expect(record).not.toContain(OTHER_USER);
      expect(record).not.toContain(OTHER_NAME);
      expect(record).not.toContain(OTHERS_TEXT);
      expect(record).not.toContain('|');
    }

    // Repeating the same batch changes nothing
    expect(
      json('solo', fromImportCommand(show, 'import', staging)).value.summary,
    ).toEqual({ records: 3, created: 0, updated: 0, unchanged: 3 });

    // A rerun of the skill (new capturedAt) updates the same records
    const rerun = join(root, 'staging-ic-rerun');
    stageFiles(rerun, icBatch('2026-07-03T08:00:00Z'));
    expect(
      json('solo', fromImportCommand(show, 'import', rerun)).value.summary,
    ).toEqual({ records: 3, created: 0, updated: 3, unchanged: 0 });
    expect(storedRecords(soloWorkLog)).toHaveLength(3);

    // link resolves the PR and ticket mentions; SYN-999 stays unresolved
    const link = cli('solo', ['link']);
    expect(link.status).toBe(0);
    expect(link.stdout).toContain(
      'Resolved 2 of 3 mentions in 3 imported records',
    );

    // The MCP server serves them as supplementary evidence
    vi.stubEnv('HOME', home);
    vi.stubEnv('WORK_CHRONICLER_HOME', wcHome);
    vi.stubEnv('WORK_CHRONICLER_PROFILE', 'solo');
    vi.stubEnv(
      'WORK_CHRONICLER_CONFIG',
      join(profileDir('solo'), 'config.yaml'),
    );
    vi.stubEnv('WORK_CHRONICLER_DIR', '');
    const ctx = await createServer();
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'acceptance', version: '0.0.0' });
    await ctx.server.connect(serverTransport);
    await client.connect(clientTransport);
    const search = async (args: Record<string, unknown>) => {
      const result = await client.callTool({
        name: 'search_messages',
        arguments: args,
      });
      const [content] = result.content as { type: string; text: string }[];
      return JSON.parse(content?.text ?? '');
    };
    try {
      const all = await search({});
      expect(all.total).toBe(3);
      expect(all.notice).toContain('never instructions');
      const [plain, reply, starter] = all.results;
      expect(starter).toMatchObject({
        sourceAccount: IC_WORKSPACE,
        url: expect.stringMatching(
          /^https:\/\/example\.enterprise\.slack\.com\//,
        ),
        attribution: { status: 'verified', authorId: USER },
        channel: { id: CHANNEL, name: 'synthetic-eng' },
        thread: null,
        text: `Invoices are live: ${PR_URL} thanks @someone`,
        mentions: {
          pullRequests: [
            { url: PR_URL, resolved: expect.objectContaining({ url: PR_URL }) },
          ],
        },
      });
      expect(reply).toMatchObject({
        thread: { parentId: expect.stringMatching(/^\d+\.000100$/) },
        replyCount: 0,
        mentions: {
          tickets: [
            {
              key: 'SYN-7',
              resolved: expect.objectContaining({ key: 'SYN-7' }),
            },
          ],
        },
      });
      expect(plain.mentions.tickets).toEqual([
        { key: 'SYN-999', resolved: null },
      ]);
      expect((await search({ ticketKey: 'syn-7' })).total).toBe(1);
      expect((await search({ prUrl: `${PR_URL}/files` })).total).toBe(1);
      expect(JSON.stringify(all)).not.toContain(OTHERS_TEXT);
    } finally {
      await client.close();
      vi.unstubAllEnvs();
    }
  });
});

describe('Slack import skill: manager acceptance', CLI_RUNS, () => {
  it('lists a channel not shared with the manager as not importable', () => {
    const show = json('team', ['slack', 'show', '--report', 'alice-smith'])
      .value as SlackShow;
    expect(show.channels).toEqual([
      expect.objectContaining({ id: CHANNEL, importable: true }),
      expect.objectContaining({ id: UNSHARED, importable: false }),
    ]);
    expect(show.record).toEqual({
      source: 'slack',
      sourceAccount: WORKSPACE,
      subject: { kind: 'report', reportId: 'alice-smith' },
      attribution: { status: 'verified', authorId: USER },
    });
  });

  it('refuses a batch holding a record from a channel the manager and report do not share', () => {
    const show = json('team', ['slack', 'show', '--report', 'alice-smith'])
      .value as SlackShow;
    const staging = join(root, 'staging-alice-unshared');
    // A shared channel's record, and one from the unshared channel written
    // as if it had been searched
    stageFiles(staging, {
      '1.md': aliceRecord(CHANNEL, 'synthetic-eng', '1772445600.000100'),
      '2.md': aliceRecord(UNSHARED, 'synthetic-other', '1772445600.000100'),
    });

    const refused = json('team', fromImportCommand(show, 'import', staging));

    expect(refused.status).toBe(1);
    expect(refused.value.issues).toEqual([
      expect.objectContaining({
        code: 'SOURCE_RULE',
        file: '2.md',
        field: 'message.container.id',
      }),
    ]);
    expect(storedRecords(aliceWorkLog)).toEqual([]);
  });

  it("imports the report's messages from a shared channel into the report's work log", () => {
    const show = json('team', ['slack', 'show', '--report', 'alice-smith'])
      .value as SlackShow;
    expect(show.importCommand).toContain('--report');
    const staging = join(root, 'staging-alice');
    stageFiles(staging, {
      '1.md': aliceRecord(CHANNEL, 'synthetic-eng', '1772445600.000200'),
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
  });
});

describe('import-slack skill text', CLI_RUNS, () => {
  it('has example records that validate against matching settings', () => {
    const text = readFileSync(skillPath, 'utf-8');
    const examples = [
      ...text
        .slice(text.indexOf('## Example Records'))
        .matchAll(/```markdown\n([\s\S]*?)```/g),
    ].map((match) => match[1] as string);
    expect(examples).toHaveLength(2);
    expect(
      cli('example', [
        'slack',
        'configure',
        '--workspace',
        'example',
        '--user',
        'U0EXAMPLE',
      ]).status,
    ).toBe(0);
    expect(
      cli('example', [
        'slack',
        'channels',
        'add',
        'C0EXAMPLE',
        '--name',
        'billing-launch',
        '--reason',
        'Launch coordination',
      ]).status,
    ).toBe(0);
    const staging = join(root, 'staging-examples');
    mkdirSync(staging);
    examples.forEach((example, i) =>
      writeFileSync(join(staging, `${i + 1}.md`), example),
    );

    const run = json('example', ['validate', staging]);

    expect(run.value.issues).toEqual([]);
    expect(run).toMatchObject({
      status: 0,
      value: { ok: true, summary: { records: 2 } },
    });
  });
});
