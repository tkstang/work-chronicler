import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';

import {
  crashAfterFs,
  messageFrontmatter,
  recordFile,
  snapshot,
  stage,
  SYNTH_SOURCES,
} from '@core/import/import.test-support';
import {
  parseImportedRecordFile,
  serializeImportedRecord,
} from '@core/import/record-file';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Review records (reviews the user gave) share the work log with authored
// PRs. Every authored-PR consumer must give the same answer with or without
// them. Isolate HOME and the workspace before any module computes a path.
const root = mkdtempSync(join(tmpdir(), 'wc-mixed-'));
vi.stubEnv('HOME', join(root, 'home'));
vi.stubEnv('WORK_CHRONICLER_HOME', join(root, 'wc-home'));

const { Command } = await import('commander');
const core = await import('@core/index');
const tools = await import('@mcp/tools/index');
const { analyzeCommand } = await import('./analyze');
const { filterCommand } = await import('./filter/index');
const { writeFilteredSubset } = await import('./filter/filter.utils');
const { statusCommand } = await import('./status');
const importer = await import('@core/import/index');

const configPath = join(root, 'work-chronicler.yaml');
const workLog = join(root, 'work-log');
const filteredDir = join(workLog, 'filtered');

function authoredPR(
  org: string,
  repo: string,
  prNumber: number,
  overrides: Partial<import('@core/index').PullRequest> = {},
) {
  const frontmatter = {
    title: `feat: authored ${org}/${repo}#${prNumber}`,
    prNumber,
    repository: repo,
    org,
    author: 'me',
    state: 'merged' as const,
    createdAt: '2025-02-10T09:00:00Z',
    mergedAt: '2025-02-11T09:00:00Z',
    closedAt: '2025-02-11T09:00:00Z',
    url: `https://github.com/${org}/${repo}/pull/${prNumber}`,
    additions: 120,
    deletions: 30,
    changedFiles: 5,
    jiraTickets: [] as string[],
    labels: [] as string[],
    ...overrides,
  };
  core.writeMarkdownFile(
    core.getPRFilePath(
      workLog,
      org,
      repo,
      new Date(frontmatter.createdAt),
      prNumber,
    ),
    frontmatter,
    'Implements BILL-1.',
  );
}

function reviewRecord(
  org: string,
  repo: string,
  prNumber: number,
  reviewer = 'me',
) {
  const record: import('@core/index').PRReviewRecord = {
    type: 'pr-review',
    reviewer,
    pr: {
      url: `https://github.com/${org}/${repo}/pull/${prNumber}`,
      org,
      repository: repo,
      prNumber,
      // Text an authored-PR consumer would pick up if it read the record
      title: 'feat!: platform migration BILL-1',
      author: 'alice',
      state: 'merged',
    },
    prUpdatedAt: '2025-03-02T00:00:00Z',
    reviews: [
      {
        reviewId: 900 + prNumber,
        state: 'APPROVED',
        submittedAt: '2025-03-01T00:00:00Z',
        url: `https://github.com/${org}/${repo}/pull/${prNumber}#pullrequestreview-${900 + prNumber}`,
        body: 'Approved BILL-1 work',
      },
    ],
    comments: [],
  };
  core.writeMarkdownFile(
    core.getPRReviewFilePath(workLog, org, repo, prNumber),
    record,
    'Review work',
  );
}

async function run(command: InstanceType<typeof Command>, args: string[]) {
  await new Command('work-chronicler')
    .addCommand(command)
    .parseAsync([command.name(), ...args, '-c', configPath], { from: 'user' });
}

function parse(result: CallToolResult) {
  const [first] = result.content;
  if (first?.type !== 'text') throw new Error('expected a text result');
  return JSON.parse(first.text);
}

function withoutGeneratedAt<T>(value: T): T {
  return JSON.parse(JSON.stringify(value), (key, v) =>
    key === 'generatedAt' ? undefined : v,
  );
}

function readAnalysis(dir: string) {
  return Object.fromEntries(
    ['stats', 'projects', 'timeline'].map((name) => [
      name,
      withoutGeneratedAt(
        JSON.parse(readFileSync(core.getAnalysisFilePath(dir, name), 'utf-8')),
      ),
    ]),
  );
}

/**
 * Everything authored-PR consumers report for the current work log:
 * `analyze` output (stats, project detection, timeline), the MCP tools over
 * that output, and `filter`'s subset and its analysis.
 */
async function authoredResults() {
  await run(analyzeCommand, ['--all', '--full']);
  const ctx = { outputDir: workLog };
  const mcp = {
    searchPrs: parse(await tools.searchPrsTool.handler({}, ctx)),
    statsFile: parse(await tools.getStatsTool.handler({}, ctx)),
    statsRange: parse(
      await tools.getStatsTool.handler(
        { since: '2025-01-01', until: '2025-12-31' },
        ctx,
      ),
    ),
    timeline: parse(
      await tools.getTimelineTool.handler({ granularity: 'month' }, ctx),
    ),
    projects: parse(await tools.getProjectsTool.handler({}, ctx)),
    repos: parse(await tools.listReposTool.handler({}, ctx)),
    linked: parse(
      await tools.getLinkedWorkTool.handler({ ticketKey: 'BILL-1' }, ctx),
    ),
  };

  await run(filterCommand, ['--org', 'acme']);
  const filtered = {
    prs: (await core.readAllPRs(filteredDir)).map((pr) => pr.frontmatter),
    analysis: readAnalysis(filteredDir),
  };

  return withoutGeneratedAt({
    analysis: readAnalysis(workLog),
    mcp,
    filtered,
  });
}

afterAll(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

function writeConfig() {
  writeFileSync(
    configPath,
    [
      'github:',
      '  username: me',
      'output:',
      '  directory: ./work-log',
      'fetch:',
      '  since: "2025-01-01"',
      '  until: "2025-12-31"',
      '',
    ].join('\n'),
  );
}

describe('a work log with authored PRs and review records', () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
  });

  // Same repo as an authored PR, the same PR number in another repo, and an
  // org with no authored work
  function writeBaselineReviews() {
    reviewRecord('acme', 'api', 8);
    reviewRecord('acme', 'web', 7);
    reviewRecord('external', 'lib', 1);
  }

  it('gives the same authored-PR results with and without review records', async () => {
    writeConfig();
    authoredPR('acme', 'api', 7, { jiraTickets: ['BILL-1'] });
    authoredPR('acme', 'web', 3, { createdAt: '2025-04-01T09:00:00Z' });
    authoredPR('other', 'api', 4, { createdAt: '2025-05-01T09:00:00Z' });
    core.writeMarkdownFile(
      core.getTicketFilePath(workLog, 'acme-jira', 'BILL', 'BILL-1'),
      {
        key: 'BILL-1',
        summary: 'Billing export',
        project: 'BILL',
        org: 'acme-jira',
        issueType: 'Story',
        status: 'Done',
        storyPoints: 3,
        url: 'https://acme.atlassian.net/browse/BILL-1',
        createdAt: '2025-02-01T10:00:00.000+0000',
        resolvedAt: null,
        linkedPRs: ['https://github.com/acme/api/pull/7'],
      },
      '',
    );

    const before = await authoredResults();
    expect(before.mcp.searchPrs.total).toBe(3);
    // filter writes every record directory, even before any review fetch
    expect(existsSync(join(filteredDir, 'pr-reviews'))).toBe(true);

    writeBaselineReviews();

    const after = await authoredResults();

    expect(after).toEqual(before);
    expect(
      (await core.readAllPRReviews(filteredDir))
        .map((r) => r.frontmatter.pr.url)
        .sort(),
    ).toEqual([
      'https://github.com/acme/api/pull/8',
      'https://github.com/acme/web/pull/7',
    ]);

    logs = [];
    await run(statusCommand, []);
    expect(logs).toContain('\nPull Requests: 3 files');
    expect(
      logs.some((line) =>
        line.startsWith('PR Reviews:    3 reviewed PRs (3 reviews'),
      ),
    ).toBe(true);

    // A filtered subset from before reviews were fetched is flagged
    expect(
      logs.some((line) => line.includes('Re-run `work-chronicler filter`')),
    ).toBe(false);
    rmSync(join(filteredDir, 'pr-reviews'), { recursive: true });
    logs = [];
    await run(statusCommand, []);
    expect(
      logs.some((line) => line.includes('Re-run `work-chronicler filter`')),
    ).toBe(true);

    // filter always writes pr-reviews/, even when no review record matches
    await run(filterCommand, ['--org', 'other']);
    expect(existsSync(join(filteredDir, 'pr-reviews'))).toBe(true);
  });

  it('does not count review records in status when the GitHub username is not set', async () => {
    writeConfig();
    writeBaselineReviews();
    writeFileSync(
      configPath,
      readFileSync(configPath, 'utf-8').replace(
        '  username: me\n',
        '  username: ""\n',
      ),
    );

    logs = [];
    await run(statusCommand, []);

    expect(
      logs.some((line) => line.startsWith('PR Reviews:    0 reviewed PRs')),
    ).toBe(true);
    expect(logs).toContainEqual(
      expect.stringContaining(
        'review record(s) in pr-reviews/ (reviewer: me) are not counted: github.username is not set',
      ),
    );
    writeConfig();
  });

  it('does not count review records written for another GitHub user in status', async () => {
    writeConfig();
    writeBaselineReviews();
    reviewRecord('acme', 'api', 50, 'alice');
    reviewRecord('acme', 'api', 51, 'ME');

    logs = [];
    await run(statusCommand, []);

    expect(
      logs.some((line) =>
        line.startsWith('PR Reviews:    4 reviewed PRs (4 reviews'),
      ),
    ).toBe(true);
    expect(logs).toContainEqual(
      expect.stringContaining(
        '1 review record(s) in pr-reviews/ belong to another GitHub user (alice), not me, and are not counted',
      ),
    );

    // Nor in the filtered subset's counts
    await run(filterCommand, ['--org', 'acme']);
    expect(
      readFileSync(
        join(filteredDir, 'pr-reviews', 'acme', 'api', '50.md'),
        'utf-8',
      ),
    ).toContain('reviewer: "alice"');
    logs = [];
    await run(statusCommand, []);
    expect(logs).toContainEqual(
      expect.stringMatching(/^Filtered subset: in use .* 3 reviewed PRs, /),
    );
  });
});

/**
 * A message the subject wrote, stored where `import` would store it.
 */
function importedMessage(
  n: number,
  mentions: { tickets?: string[]; pullRequests?: string[] } = {},
) {
  const parsed = parseImportedRecordFile(
    Buffer.from(
      recordFile(
        messageFrontmatter(n, {
          occurredAt: `2025-03-0${n}T10:00:00Z`,
          capturedAt: '2025-06-01T00:00:00Z',
          mentions: {
            tickets: mentions.tickets ?? [],
            pullRequests: mentions.pullRequests ?? [],
          },
        }),
        `Message ${n} in my own words.`,
      ),
    ),
  );
  if (!parsed.ok) throw new Error('fixture must be valid');
  const path = core.getImportedRecordFilePath(
    workLog,
    core.getImportedRecordIdentity(parsed.record),
  );
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeImportedRecord(parsed.record, parsed.body));
  return path;
}

function ticketRecord(key: string, status: string, linkedPRs: string[] = []) {
  core.writeMarkdownFile(
    core.getTicketFilePath(workLog, 'acme-jira', key.split('-')[0] ?? '', key),
    {
      key,
      summary: `Ticket ${key}`,
      project: key.split('-')[0] ?? '',
      org: 'acme-jira',
      issueType: 'Story',
      status,
      storyPoints: null,
      url: `https://acme.atlassian.net/browse/${key}`,
      createdAt: '2025-02-01T10:00:00.000+0000',
      resolvedAt: null,
      linkedPRs,
    },
    '',
  );
}

/** Relative paths of every record in the subset, by type */
async function subsetRecords() {
  const rel = (path: string) => relative(filteredDir, path);
  return {
    prs: (await core.readAllPRs(filteredDir)).map((r) => rel(r.filePath)),
    tickets: (await core.readAllTickets(filteredDir)).map((r) =>
      rel(r.filePath),
    ),
    reviews: (await core.readAllPRReviews(filteredDir)).map((r) =>
      rel(r.filePath),
    ),
    messages: (await core.readAllImportedRecords(filteredDir))
      .map((r) => r.body)
      .sort(),
  };
}

function selection() {
  const state = core.getFilteredSubsetState(workLog);
  if (state.status !== 'selected') throw new Error('expected a subset');
  return state.selection;
}

describe('a mixed work log with imported messages', () => {
  let logs: string[];

  beforeEach(() => {
    rmSync(workLog, { recursive: true, force: true });
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.join(' '));
    });
    writeConfig();

    authoredPR('acme', 'api', 7, { jiraTickets: ['BILL-1'] });
    authoredPR('other', 'api', 4, { createdAt: '2025-05-01T09:00:00Z' });
    // Linked through GitHub's capitalization of the PR URL
    ticketRecord('BILL-1', 'Done', ['https://github.com/Acme/API/pull/7']);
    ticketRecord('OPS-2', 'To Do');
    reviewRecord('acme', 'api', 8);
    reviewRecord('external', 'lib', 1);
    importedMessage(1, {
      pullRequests: ['https://github.com/ACME/api/pull/7/files'],
    });
    importedMessage(2, { tickets: ['OPS-9'] }); // mentions nothing fetched
    importedMessage(3);

    // What finished imports leave behind (a released lock, a finished
    // transaction with a staged copy) is not records and blocks nothing. An
    // import in progress blocks `filter`: see the test below.
    mkdirSync(join(workLog, '.import-lock.released-old'));
    writeFileSync(join(workLog, '.import-lock.released-old', 'owner.json'), '');
    mkdirSync(join(workLog, '.import-transaction.done-old', 'staged'), {
      recursive: true,
    });
    writeFileSync(
      join(workLog, '.import-transaction.done-old', 'staged', '0.md'),
      recordFile(messageFrontmatter(9)),
    );
  });

  async function everything() {
    await run(filterCommand, ['--exclude-status', 'Rejected']);
    expect(await subsetRecords()).toEqual({
      prs: [
        'pull-requests/acme/api/2025-02-10_7.md',
        'pull-requests/other/api/2025-05-01_4.md',
      ],
      tickets: ['jira/acme-jira/BILL/BILL-1.md', 'jira/acme-jira/OPS/OPS-2.md'],
      reviews: ['pr-reviews/acme/api/8.md', 'pr-reviews/external/lib/1.md'],
      messages: [
        'Message 1 in my own words.',
        'Message 2 in my own words.',
        'Message 3 in my own words.',
      ],
    });
    return snapshot(filteredDir);
  }

  it('re-filtering removes stale records of every type', async () => {
    await everything();

    await run(filterCommand, ['--org', 'acme', '--linked-only']);

    expect(await subsetRecords()).toEqual({
      prs: ['pull-requests/acme/api/2025-02-10_7.md'],
      tickets: ['jira/acme-jira/BILL/BILL-1.md'],
      reviews: ['pr-reviews/acme/api/8.md'],
      // Only the message whose mention resolves to a PR in the subset
      messages: ['Message 1 in my own words.'],
    });
    expect(selection()).toMatchObject({
      filters: ['Include orgs: acme', 'Linked only'],
      counts: { pullRequests: 1, tickets: 1, prReviews: 1, messages: 1 },
      totals: { pullRequests: 2, tickets: 2, prReviews: 2, messages: 3 },
    });
    // Nothing from the import's working files, nothing left over
    expect(
      Object.keys(snapshot(filteredDir)).filter((p) => p.includes('import')),
    ).toEqual([]);
    expect(
      readdirSync(workLog).filter((name) => name.startsWith('.filter')),
    ).toEqual([]);
  });

  it('publishes an empty result as the selected subset', async () => {
    await everything();

    await run(filterCommand, ['--org', 'nobody', '--linked-only']);

    expect(await subsetRecords()).toEqual({
      prs: [],
      tickets: [],
      reviews: [],
      messages: [],
    });
    expect(core.getEffectiveOutputDir(workLog)).toEqual({
      dir: filteredDir,
      isFiltered: true,
    });
    expect(selection()?.counts).toEqual({
      pullRequests: 0,
      tickets: 0,
      prReviews: 0,
      messages: 0,
    });
    // Read commands get the empty subset, not the full work log
    const results = parse(
      await tools.searchPrsTool.handler({}, { outputDir: filteredDir }),
    );
    expect(results.total).toBe(0);
  });

  it('publishes a result that holds only supplementary evidence', async () => {
    await everything();

    await run(filterCommand, [
      '--org',
      'nobody',
      '--exclude-status',
      'Done',
      'To Do',
    ]);

    expect(await subsetRecords()).toEqual({
      prs: [],
      tickets: [],
      reviews: [],
      messages: [
        'Message 1 in my own words.',
        'Message 2 in my own words.',
        'Message 3 in my own words.',
      ],
    });
    expect(selection()?.counts).toEqual({
      pullRequests: 0,
      tickets: 0,
      prReviews: 0,
      messages: 3,
    });
    expect(core.getEffectiveOutputDir(workLog).isFiltered).toBe(true);
  });

  it('keeps the previous subset when building the new one fails', async () => {
    const before = await everything();
    const config = await core.loadConfig(configPath);

    for (const fs of [
      // Writing the new subset
      {
        ...core.nodeSubsetFs,
        writeFile: (path: string) => {
          throw Object.assign(new Error(`injected failure at ${path}`), {
            code: 'ENOSPC',
          });
        },
      },
      // Swapping it in
      {
        ...core.nodeSubsetFs,
        rename: (from: string, to: string) => {
          if (from.includes('.filter-staging-')) {
            throw Object.assign(new Error('injected failure'), {
              code: 'EIO',
            });
          }
          core.nodeSubsetFs.rename(from, to);
        },
      },
    ]) {
      await expect(
        writeFilteredSubset({
          outputDir: workLog,
          config,
          criteria: { org: ['acme'], linkedOnly: true },
          fs,
        }),
      ).rejects.toThrow('injected failure');

      expect(snapshot(filteredDir)).toEqual(before);
      expect(core.getEffectiveOutputDir(workLog).dir).toBe(filteredDir);
      expect(
        readdirSync(workLog).filter((name) => name.startsWith('.filter-')),
      ).toEqual([]);
    }

    // Records that cannot be read are not mistaken for absent ones
    for (const readFs of [
      {
        ...core.nodeReaderFs,
        readdir: (path: string) => {
          if (path.endsWith(join('messages', 'slack'))) {
            throw Object.assign(new Error('EACCES: injected failure'), {
              code: 'EACCES',
            });
          }
          return core.nodeReaderFs.readdir(path);
        },
      },
      {
        ...core.nodeReaderFs,
        readFile: (path: string) => {
          if (path.endsWith('2025-02-10_7.md')) {
            throw Object.assign(new Error('EIO: injected failure'), {
              code: 'EIO',
            });
          }
          return core.nodeReaderFs.readFile(path);
        },
      },
    ]) {
      await expect(
        writeFilteredSubset({
          outputDir: workLog,
          config,
          criteria: { org: ['acme'] },
          readFs,
        }),
      ).rejects.toThrow(
        /EIO: injected failure|Could not read .*messages.slack; the filtered subset was not changed/,
      );
      expect(snapshot(filteredDir)).toEqual(before);
    }

    // A selector error is reported before anything is written
    await expect(run(filterCommand, ['--org', '@'])).rejects.toThrow(
      /Invalid org selector/,
    );
    expect(snapshot(filteredDir)).toEqual(before);
  });

  it('status counts messages apart from PRs and tickets and ignores import working files', async () => {
    await run(statusCommand, []);

    expect(logs).toContain('\nPull Requests: 2 files');
    expect(logs).toContain(
      'Messages:      3 imported (slack 3; supplementary evidence, not counted as PRs or tickets)',
    );
    expect(logs).not.toContainEqual(
      expect.stringContaining('An import is running or did not finish'),
    );
    expect(logs).toContain(
      'Filtered subset: none (read commands use the full work log)',
    );

    await run(filterCommand, ['--org', 'acme']);
    logs = [];
    await run(statusCommand, []);
    expect(logs).toContainEqual(
      expect.stringContaining(
        'Filtered subset: in use by `analyze` and the MCP server (1 PRs, 2 tickets, 1 reviewed PRs, 3 messages; filters: Include orgs: acme)',
      ),
    );

    // A subset made before messages were imported is flagged
    rmSync(join(filteredDir, 'messages'), { recursive: true });
    logs = [];
    await run(statusCommand, []);
    expect(logs).toContainEqual(
      expect.stringContaining(
        'created before messages were imported and does not include them',
      ),
    );
  });

  it('stats count messages; projects and the timeline stay PR/ticket-only and say so', async () => {
    const analysis = async () => {
      await run(analyzeCommand, ['--all', '--full']);
      return readAnalysis(workLog);
    };

    const withMessages = await analysis();
    expect(withMessages.stats.messages).toMatchObject({
      total: 3,
      bySource: { slack: 3 },
    });
    expect(
      Object.values(
        withMessages.stats.messages.byMonth as Record<string, number>,
      ).reduce((a, b) => a + b, 0),
    ).toBe(3);
    expect(withMessages.stats.prs.total).toBe(2);
    expect(withMessages.stats.tickets.total).toBe(2);
    expect(logs).toContainEqual(
      expect.stringContaining(
        'Projects and the timeline cover PRs and tickets only',
      ),
    );

    rmSync(join(workLog, 'messages'), { recursive: true });
    const withoutMessages = await analysis();

    expect(withoutMessages.projects).toEqual(withMessages.projects);
    expect(withoutMessages.timeline).toEqual(withMessages.timeline);
    expect({ ...withoutMessages.stats, messages: null }).toEqual({
      ...withMessages.stats,
      messages: null,
    });
    expect(withoutMessages.stats.messages.total).toBe(0);
  });

  it('the filtered subset counts its messages in its stats', async () => {
    await run(filterCommand, ['--org', 'acme', '--linked-only']);

    expect(readAnalysis(filteredDir).stats.messages).toMatchObject({
      total: 1,
      bySource: { slack: 1 },
    });
  });

  it('analyze refuses an interrupted subset swap unless asked for the full work log', async () => {
    await run(filterCommand, ['--org', 'acme']);
    // A filter run that stopped after moving the subset aside
    renameSync(filteredDir, join(workLog, '.filter-previous-crash'));

    await expect(run(analyzeCommand, ['--all'])).rejects.toThrow(
      /interrupted while replacing/,
    );
    await run(analyzeCommand, ['--all', '--full']);
    expect(readAnalysis(workLog).stats.prs.total).toBe(2);

    // The next filter puts the previous subset back first
    await run(filterCommand, ['--org', 'other']);
    expect(core.getEffectiveOutputDir(workLog).isFiltered).toBe(true);
    expect(selection()?.filters).toEqual(['Include orgs: other']);
  });

  it('status and filter name a lock left on another machine and how to remove it', async () => {
    await run(filterCommand, ['--org', 'acme']);
    const lockPath = join(workLog, '.filter-lock');
    mkdirSync(lockPath);
    writeFileSync(
      join(lockPath, 'owner.json'),
      JSON.stringify({
        version: 1,
        pid: 4242,
        hostname: 'Old-Hostname.local',
        startedAt: 1,
        runId: 'x',
      }),
    );

    logs = [];
    await run(statusCommand, []);
    expect(logs).toContainEqual(
      expect.stringContaining(
        `Work-log lock: ${lockPath} is held by \`work-chronicler filter\` (process 4242 on Old-Hostname.local, started 1970-01-01T00:00:00.001Z).`,
      ),
    );
    expect(logs).toContainEqual(
      expect.stringContaining(`if you know no filter is running`),
    );
    // filter --clear is refused while the lock is held, so it is not advised
    expect(logs.filter((line) => line.includes('--clear`'))).toEqual([
      expect.stringContaining('`filter --clear` are refused while it is held'),
    ]);

    for (const args of [['--org', 'other'], ['--clear']]) {
      await expect(run(filterCommand, args)).rejects.toThrow(
        `remove ${lockPath} and try again`,
      );
    }

    rmSync(lockPath, { recursive: true });
    await run(filterCommand, ['--clear']);
    expect(core.getEffectiveOutputDir(workLog).isFiltered).toBe(false);
  });

  it('filter finishes an interrupted import before reading, so the subset never holds part of its batch', async () => {
    const staging = mkdtempSync(join(root, 'staging-'));
    // Rewrite message 1 and add message 4; stop right after message 1 is
    // replaced, as a crash would
    stage(
      staging,
      'a.md',
      messageFrontmatter(1, {
        occurredAt: '2025-03-01T10:00:00Z',
        capturedAt: '2025-06-02T00:00:00Z',
      }),
      'Rewritten by an import that stopped.',
    );
    stage(staging, 'b.md', messageFrontmatter(4), 'Added by it too.');
    const crashed = importer.runImport({
      mode: 'import',
      stagingDir: staging,
      workLogRoot: workLog,
      target: { kind: 'ic' },
      sources: SYNTH_SOURCES,
      env: {
        ...importer.createImportEnv(),
        pid: 4_000_001,
        fs: crashAfterFs(
          (await import('@core/import/import-fs')).nodeImportFs,
          (op, args) =>
            op === 'rename' && String(args[1]).includes('messages/slack/'),
        ),
      },
    });
    expect(crashed.ok).toBe(false);
    expect(existsSync(join(workLog, '.import-transaction'))).toBe(true);

    await run(filterCommand, ['--org', 'acme']);

    expect((await subsetRecords()).messages).toEqual([
      'Message 1 in my own words.',
      'Message 2 in my own words.',
      'Message 3 in my own words.',
    ]);
    expect(logs).toContainEqual(
      expect.stringContaining(
        'An interrupted import was rolled back before filtering (2 records in its batch, none kept)',
      ),
    );
    expect(existsSync(join(workLog, '.import-transaction'))).toBe(false);
    rmSync(staging, { recursive: true, force: true });
  });

  it('filter is refused while an import holds the work-log lock, and status names the import', async () => {
    await run(filterCommand, ['--org', 'acme']);
    const before = snapshot(filteredDir);
    // A running import holds both names of the work-log lock
    const owner = JSON.stringify({
      version: 1,
      pid: process.pid,
      hostname: 'this-host-is-elsewhere',
      startedAt: 1,
      runId: 'running-import',
      command: 'import',
    });
    const names = ['.import-lock', '.filter-lock'];
    for (const name of names) {
      mkdirSync(join(workLog, name));
      writeFileSync(join(workLog, name, 'owner.json'), owner);
    }
    const paths = names.map((name) => join(workLog, name));
    // ...and is storing its batch
    mkdirSync(join(workLog, '.import-transaction'));

    logs = [];
    await run(statusCommand, []);
    expect(logs).toContain(
      'Messages:      not counted while an import is running or needs recovery (see below)',
    );
    expect(logs).toContainEqual(
      expect.stringContaining('An import is running or did not finish'),
    );
    expect(logs).toContainEqual(
      expect.stringContaining(
        `Work-log lock: ${paths[0]} and ${paths[1]} are held by \`work-chronicler import\` (process ${process.pid} on this-host-is-elsewhere, started 1970-01-01T00:00:00.001Z).`,
      ),
    );
    expect(logs).toContainEqual(
      expect.stringContaining('if you know no import is running'),
    );

    for (const args of [['--org', 'other'], ['--clear']]) {
      await expect(run(filterCommand, args)).rejects.toThrow(
        /Another `work-chronicler import` run .* holds .*\.import-lock\./,
      );
    }
    expect(snapshot(filteredDir)).toEqual(before);
    // Reading the full work log's imported records waits for the import
    await expect(run(analyzeCommand, ['--all', '--full'])).rejects.toThrow(
      /An import is running in .*, or was interrupted/,
    );

    // An earlier filter was interrupted mid-swap: no filter is running, so
    // status must not say one is replacing the subset, and points at filter
    // once the import holding the lock finishes (no --clear advice while
    // the lock is held)
    renameSync(filteredDir, join(workLog, '.filter-previous-old'));
    logs = [];
    await run(statusCommand, []);
    const subsetLines = logs.filter((line) =>
      line.startsWith('Filtered subset:'),
    );
    expect(subsetLines).toEqual([
      expect.stringContaining(
        'an earlier `work-chronicler filter` run was interrupted while replacing filtered/',
      ),
    ]);
    expect(subsetLines[0]).toContain(
      '`work-chronicler filter` restores it once the `work-chronicler import` holding the work-log lock (see below) finishes',
    );
    expect(subsetLines[0]).not.toContain('is replacing');
    expect(subsetLines[0]).not.toContain('--clear');
  });
});
