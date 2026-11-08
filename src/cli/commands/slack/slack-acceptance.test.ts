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

// Acceptance for the Slack import skills: a batch staged exactly as
// work-chronicler-import-slack instructs (read `slack show --json`, keep only
// the subject's own messages in configured channels and in range, one record
// per message in the template's layout, with Slack markup rewritten) goes
// through the real CLI:
// validate → import → link → the MCP server's search_messages. The CLI runs
// in a child process with HOME and the workspace in a temporary directory.
// Every ID, name and text is synthetic. Per-rule refusals are covered in
// @core/import/slack-rules.test.ts and the import and slack command tests.

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
  record: { sourceAccount: string; subject: unknown; attribution: unknown };
  importCommand: string[];
}

/** One Slack search result, as the connector renders it */
interface SearchResult {
  channelId: string;
  authorId: string;
  messageTs: string;
  permalink: string;
  text: string;
}

const DAY = 24 * 60 * 60 * 1000;
const tsDigits = (ts: string) => ts.replace('.', '');
const tsToIso = (ts: string) =>
  new Date(Number(ts.split('.')[0]) * 1000).toISOString().replace('.000', '');

/**
 * Steps 5 and 6 of the import skill for one searched channel: keep a result
 * only when it is in that channel, by the configured user, in range and has
 * text, then write it in the template's layout.
 */
function stageAsTheSkillDoes(
  show: SlackShow,
  searched: string,
  results: SearchResult[],
  dir: string,
  capturedAt: string,
): { kept: number; skipped: number } {
  const channel = show.channels.find((c) => c.id === searched);
  if (!channel?.importable) throw new Error('never search this channel');
  const since = new Date(`${show.range.since}T00:00:00Z`).getTime();
  const until = show.range.until
    ? new Date(`${show.range.until}T00:00:00Z`).getTime() + DAY
    : Number.POSITIVE_INFINITY;
  mkdirSync(dir, { recursive: true });
  let kept = 0;
  let skipped = 0;
  for (const result of results) {
    const time = Number(result.messageTs) * 1000;
    if (
      result.channelId !== searched ||
      result.authorId !== show.user ||
      time < since ||
      time >= until ||
      result.text.trim() === ''
    ) {
      skipped++;
      continue;
    }
    const link = new URL(result.permalink);
    const threadTs = link.searchParams.get('thread_ts');
    const isReply = threadTs !== null && threadTs !== result.messageTs;
    const url = `${link.origin}/archives/${searched}/p${tsDigits(result.messageTs)}${
      isReply ? `?thread_ts=${threadTs}&cid=${searched}` : ''
    }`;
    const thread = isReply
      ? `{ parentId: "${threadTs}", parentUrl: "${link.origin}/archives/${searched}/p${tsDigits(threadTs)}" }`
      : 'null';
    // Slack markup: mentions lose the name and ID, links keep only the URL
    const body = result.text
      .replace(/<@[UW][A-Z0-9]+(?:\|[^>]*)?>/g, '@someone')
      .replace(/<#C[A-Z0-9]+(?:\|[^>]*)?>/g, '#channel')
      .replace(/<!(here|channel|everyone)>/g, '@$1')
      .replace(/<(https?:\/\/[^|>\s]+)(?:\|[^>]*)?>/g, '$1');
    const tickets = [
      ...new Set(body.match(/\b[A-Z][A-Z0-9_]*-[1-9]\d*\b/g) ?? []),
    ];
    const prs = [
      ...new Set(
        body.match(/https:\/\/github\.com\/[^\s/]+\/[^\s/]+\/pull\/\d+/g) ?? [],
      ),
    ];
    const q = JSON.stringify;
    const file = [
      '---',
      'schemaVersion: 1',
      'type: message',
      'source: slack',
      `sourceAccount: ${q(show.record.sourceAccount)}`,
      `sourceId: ${q(`${searched}/${result.messageTs}`)}`,
      `url: ${q(url)}`,
      `occurredAt: ${q(tsToIso(result.messageTs))}`,
      'updatedAt: null',
      `capturedAt: ${q(capturedAt)}`,
      `subject: ${q(show.record.subject)}`,
      `attribution: ${q(show.record.attribution)}`,
      `mentions: { tickets: ${q(tickets)}, pullRequests: ${q(prs)} }`,
      'message:',
      `  container: { id: ${q(searched)}, name: ${q(channel.name)} }`,
      `  thread: ${thread}`,
      '  replyCount: 0',
      '  replyParticipantCount: 0',
      '---',
      '',
      body,
      '',
    ].join('\n');
    writeFileSync(join(dir, `${++kept}.md`), file);
  }
  return { kept, skipped };
}

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

const ts = (iso: string, micro: string) =>
  `${new Date(iso).getTime() / 1000}.${micro}`;

/** Synthetic search results for `from:<@USER> in:<#CHANNEL>` */
function searchResults(): SearchResult[] {
  const starter = ts('2026-01-05T10:00:00Z', '000100');
  const parent = ts('2026-01-06T09:00:00Z', '000100');
  const reply = ts('2026-01-06T09:30:00Z', '000200');
  const plain = ts('2026-02-01T12:00:00Z', '000300');
  const before = ts('2025-12-31T12:00:00Z', '000400');
  const after = ts('2026-07-01T12:00:00Z', '000500');
  const others = ts('2026-01-06T09:10:00Z', '000600');
  const at = (t: string, query = '') =>
    `${IC_HOST}/archives/${CHANNEL}/p${tsDigits(t)}${query}`;
  return [
    // A thread the subject started: its permalink names itself as thread
    {
      channelId: CHANNEL,
      authorId: USER,
      messageTs: starter,
      permalink: at(starter, `?thread_ts=${starter}&cid=${CHANNEL}`),
      text: `Invoices are live: <${PR_URL}|${PR_URL.replace('https://', '')}> thanks <@${OTHER_USER}|${OTHER_NAME}>`,
    },
    // The subject's reply in a thread someone else started
    {
      channelId: CHANNEL,
      authorId: USER,
      messageTs: reply,
      permalink: at(reply, `?thread_ts=${parent}&cid=${CHANNEL}`),
      text: 'I will take the retry fix in SYN-7',
    },
    // A top-level message whose ticket is not in the work log
    {
      channelId: CHANNEL,
      authorId: USER,
      messageTs: plain,
      permalink: at(plain),
      text: 'Planning SYN-999 next',
    },
    // Skipped: outside the range, by someone else, or without text
    {
      channelId: CHANNEL,
      authorId: USER,
      messageTs: before,
      permalink: at(before),
      text: 'Before the range',
    },
    {
      channelId: CHANNEL,
      authorId: USER,
      messageTs: after,
      permalink: at(after),
      text: 'After the range',
    },
    {
      channelId: CHANNEL,
      authorId: OTHER_USER,
      messageTs: others,
      permalink: at(others, `?thread_ts=${parent}&cid=${CHANNEL}`),
      text: OTHERS_TEXT,
    },
    {
      channelId: CHANNEL,
      authorId: USER,
      messageTs: ts('2026-01-07T09:00:00Z', '000700'),
      permalink: at(ts('2026-01-07T09:00:00Z', '000700')),
      text: '',
    },
  ];
}

function storedRecords(workLog: string): string[] {
  const dir = join(workLog, 'messages', 'slack');
  return existsSync(dir)
    ? readdirSync(dir).map((name) => readFileSync(join(dir, name), 'utf-8'))
    : [];
}

describe('Slack import skill: IC acceptance', () => {
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

    // Import, as work-chronicler-import-slack runs it
    const show = json('solo', ['slack', 'show']).value as SlackShow;
    expect(show.configured).toBe(true);
    const staging = join(root, 'staging-ic');
    const staged = stageAsTheSkillDoes(
      show,
      CHANNEL,
      searchResults(),
      staging,
      '2026-07-02T08:00:00Z',
    );
    expect(staged).toEqual({ kept: 3, skipped: 4 });

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
    stageAsTheSkillDoes(
      show,
      CHANNEL,
      searchResults(),
      rerun,
      '2026-07-03T08:00:00Z',
    );
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

describe('Slack import skill: manager acceptance', () => {
  const aliceResult = (channel: string, micro: string): SearchResult => {
    const t = ts('2026-03-02T10:00:00Z', micro);
    return {
      channelId: channel,
      authorId: USER,
      messageTs: t,
      permalink: `${HOST}/archives/${channel}/p${tsDigits(t)}`,
      text: 'Report message',
    };
  };

  it('lists a channel not shared with the manager as not importable', () => {
    const show = json('team', ['slack', 'show', '--report', 'alice-smith'])
      .value as SlackShow;
    expect(show.channels).toEqual([
      expect.objectContaining({ id: CHANNEL, importable: true }),
      expect.objectContaining({ id: UNSHARED, importable: false }),
    ]);
    // The skill never searches it
    expect(() =>
      stageAsTheSkillDoes(show, UNSHARED, [], join(root, 'never'), ''),
    ).toThrow('never search this channel');
  });

  it('refuses a batch holding a record from a channel the manager and report do not share', () => {
    const show = json('team', ['slack', 'show', '--report', 'alice-smith'])
      .value as SlackShow;
    const staging = join(root, 'staging-alice-unshared');
    stageAsTheSkillDoes(
      show,
      CHANNEL,
      [aliceResult(CHANNEL, '000100')],
      staging,
      '2026-03-05T09:00:00Z',
    );
    // A record from the unshared channel, written as if it had been searched
    const shared = readFileSync(join(staging, '1.md'), 'utf-8');
    writeFileSync(
      join(staging, '2.md'),
      shared
        .replaceAll(CHANNEL, UNSHARED)
        .replace('synthetic-eng', 'synthetic-other'),
    );

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
    stageAsTheSkillDoes(
      show,
      CHANNEL,
      [aliceResult(CHANNEL, '000200')],
      staging,
      '2026-03-05T09:00:00Z',
    );

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

describe('import-slack skill text', () => {
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
