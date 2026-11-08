import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  messageFrontmatter,
  recordFile,
} from '@core/import/import.test-support';
import {
  parseImportedRecordFile,
  serializeImportedRecord,
} from '@core/import/record-file';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Isolate HOME and the workspace so nothing here touches ~/.work-chronicler.
let root: string;
let workspace: string;

function writeManagerConfig(analysisYaml: string[]): void {
  const dir = join(workspace, 'profiles', 'team-leads');
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'config.yaml'),
    [
      'mode: manager',
      'github:',
      '  org: acme',
      'fetch:',
      '  since: "2025-01-01"',
      ...analysisYaml,
      'reports:',
      '  - name: Alice Smith',
      '    github: alice',
      '    email: alice@example.com',
    ].join('\n'),
  );
}

describe('analyze reports --tag-prs', () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wc-analyze-reports-'));
    workspace = join(root, 'workspace');
    vi.stubEnv('HOME', join(root, 'home'));
    vi.stubEnv('WORK_CHRONICLER_HOME', workspace);
    vi.stubEnv('WORK_CHRONICLER_PROFILE', 'team-leads');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    rmSync(root, { recursive: true, force: true });
  });

  // 150 lines across 4 files, no conventional prefix: standard under the
  // default thresholds (major from 200 lines or 8 files).
  async function tagAlicesPR(
    args: string[] = ['--tag-prs'],
  ): Promise<string | undefined> {
    const { getPRFilePath, readAllPRs, writeMarkdownFile } =
      await import('@core/index');
    const workLog = join(
      workspace,
      'profiles',
      'team-leads',
      'reports',
      'alice-smith',
      'work-log',
    );
    writeMarkdownFile(
      getPRFilePath(workLog, 'acme', 'app', new Date('2025-03-04'), 7),
      {
        title: 'Tweak search ranking',
        prNumber: 7,
        repository: 'app',
        org: 'acme',
        author: 'alice',
        state: 'merged',
        createdAt: '2025-03-04T12:00:00Z',
        mergedAt: '2025-03-05T12:00:00Z',
        closedAt: '2025-03-05T12:00:00Z',
        url: 'https://github.com/acme/app/pull/7',
        additions: 150,
        deletions: 0,
        changedFiles: 4,
        jiraTickets: [],
        labels: [],
      },
      '',
    );

    const { reportsCommand } = await import('./reports');
    await reportsCommand.parseAsync(['alice-smith', ...args], {
      from: 'user',
    });

    const [pr] = await readAllPRs(workLog);
    return pr?.frontmatter.impact;
  }

  it('classifies with the thresholds in the manager profile config', async () => {
    writeManagerConfig([
      'analysis:',
      '  thresholds:',
      '    major: { minLines: 100, minFiles: 8 }',
    ]);

    expect(await tagAlicesPR()).toBe('major');
  });

  it('spans the messages it counts in the stats.json date range', async () => {
    writeManagerConfig([]);
    const { getImportedRecordFilePath, getImportedRecordIdentity } =
      await import('@core/index');
    const reportDir = join(
      workspace,
      'profiles',
      'team-leads',
      'reports',
      'alice-smith',
    );
    // A message from before the report's only PR (merged 2025-03-05)
    const parsed = parseImportedRecordFile(
      Buffer.from(
        recordFile(
          messageFrontmatter(1, {
            occurredAt: '2025-01-20T10:00:00Z',
            subject: { kind: 'report', reportId: 'alice-smith' },
          }),
        ),
      ),
    );
    if (!parsed.ok) throw new Error('fixture must be valid');
    const path = getImportedRecordFilePath(
      join(reportDir, 'work-log'),
      getImportedRecordIdentity(parsed.record),
    );
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, serializeImportedRecord(parsed.record, parsed.body));

    await tagAlicesPR();

    const stats = JSON.parse(
      readFileSync(join(reportDir, 'analysis', 'stats.json'), 'utf8'),
    );
    expect(stats.messages.total).toBe(1);
    expect(stats.dateRange).toEqual({
      since: '2025-01-20',
      until: '2025-03-05',
    });
  });

  it('uses the default thresholds when the config sets none', async () => {
    writeManagerConfig([]);

    expect(await tagAlicesPR()).toBe('standard');
  });

  // stats.json and timeline.json are read by `analyze team` and the manager-*
  // skills, so they must agree with the impact written to the PR file.
  it('writes the configured impact to the PR file, stats.json and timeline.json alike', async () => {
    writeManagerConfig([
      'analysis:',
      '  thresholds:',
      '    major: { minLines: 100, minFiles: 8 }',
    ]);

    expect(await tagAlicesPR(['--tag-prs', '--timeline'])).toBe('major');

    const analysisDir = join(
      workspace,
      'profiles',
      'team-leads',
      'reports',
      'alice-smith',
      'analysis',
    );
    const stats = JSON.parse(
      readFileSync(join(analysisDir, 'stats.json'), 'utf8'),
    );
    expect(stats.prs.byImpact).toEqual({
      flagship: 0,
      major: 1,
      standard: 0,
      minor: 0,
    });
    const timeline = JSON.parse(
      readFileSync(join(analysisDir, 'timeline.json'), 'utf8'),
    );
    type Week = { prs: Array<{ impact: string }> };
    const timelineImpacts = timeline.months.flatMap(
      (month: { weeks: Week[] }) =>
        month.weeks.flatMap((week) => week.prs.map((pr) => pr.impact)),
    );
    expect(timelineImpacts).toEqual(['major']);
  });
});
