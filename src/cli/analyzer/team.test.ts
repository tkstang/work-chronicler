import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { PRImpact } from '@wc-types/pr';
import type { ProjectGrouping } from '@wc-types/project';
import type {
  TimelineAnalysis,
  TimelinePR,
  TimelineWeek,
} from '@wc-types/timeline';
import { getReportAnalysisDir } from '@workspace/resolver';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  aggregateTeamProjects,
  aggregateTeamTimeline,
  generateContributorMatrix,
  writeTeamAnalysis,
} from './team';

function project(name: string): ProjectGrouping {
  return {
    projectId: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    prUrls: [`https://github.com/acme/app/pull/${name.length}`],
    ticketKeys: [],
    signals: { sharedTickets: [], sharedLabels: [], commonKeywords: [] },
    confidence: 'high',
    dominantSignal: 'tickets',
    stats: {
      prCount: 1,
      ticketCount: 0,
      totalAdditions: 10,
      totalDeletions: 2,
      repos: ['acme/app'],
    },
  };
}

function writeAnalysis(reportId: string, projects: unknown): void {
  const dir = getReportAnalysisDir('manager', reportId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'projects.json'), JSON.stringify({ projects }));
}

function writeProjects(reportId: string, names: string[]): void {
  writeAnalysis(reportId, names.map(project));
}

let home: string;
const originalHome = process.env.WORK_CHRONICLER_HOME;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'wc-team-'));
  process.env.WORK_CHRONICLER_HOME = home;
});

afterEach(() => {
  if (originalHome === undefined) delete process.env.WORK_CHRONICLER_HOME;
  else process.env.WORK_CHRONICLER_HOME = originalHome;
  rmSync(home, { recursive: true, force: true });
});

describe('team contributor matrix', () => {
  // The matrix feeds performance-review material, so crediting a report with
  // a teammate's project would put false evidence in someone's review.
  it('credits each report only with projects from its own analysis', async () => {
    writeProjects('alice', ['Checkout revamp', 'Shared platform']);
    writeProjects('bob', ['Search relevance', 'Shared platform']);

    const matrix = await generateContributorMatrix('manager', [
      'alice',
      'bob',
      'carol',
    ]);

    expect(matrix).toEqual({
      alice: ['Checkout revamp', 'Shared platform'],
      bob: ['Search relevance', 'Shared platform'],
      carol: [],
    });
  });

  it('skips a malformed report instead of aborting the team rollup', async () => {
    writeAnalysis('broken', [null]);
    writeProjects('alice', ['Checkout revamp']);

    const projects = await aggregateTeamProjects('manager', [
      'broken',
      'alice',
    ]);
    const matrix = await generateContributorMatrix('manager', [
      'broken',
      'alice',
    ]);

    expect(projects.map((p) => p.name)).toEqual(['Checkout revamp']);
    expect(matrix).toEqual({ broken: [], alice: ['Checkout revamp'] });
  });
});

function timelinePR(
  prNumber: number,
  impact: PRImpact,
  additions: number,
  date: string,
): TimelinePR {
  return {
    url: `https://github.com/acme/app/pull/${prNumber}`,
    title: `PR ${prNumber}`,
    repository: 'app',
    org: 'acme',
    prNumber,
    state: 'merged',
    impact,
    additions,
    deletions: 1,
    jiraTickets: [],
    date,
  };
}

function week(
  weekStart: string,
  weekEnd: string,
  prs: TimelinePR[],
): TimelineWeek {
  const byImpact = { flagship: 0, major: 0, standard: 0, minor: 0 };
  for (const pr of prs) if (pr.impact) byImpact[pr.impact]++;
  return {
    weekStart,
    weekEnd,
    weekNumber: 10,
    year: 2025,
    prs,
    tickets: [],
    stats: {
      prCount: prs.length,
      ticketCount: 0,
      additions: prs.reduce((sum, pr) => sum + pr.additions, 0),
      deletions: prs.length,
      byImpact,
    },
  };
}

/** Write a report timeline with one week per month, as `analyze reports` would. */
function writeTimeline(
  reportId: string,
  dateRange: { since: string; until: string },
  weeksByMonth: Record<string, TimelineWeek>,
): void {
  const timeline: TimelineAnalysis = {
    generatedAt: '2025-06-01T00:00:00.000Z',
    dateRange,
    months: Object.entries(weeksByMonth).map(([month, w]) => ({
      month,
      monthName: month,
      weeks: [w],
      stats: w.stats,
    })),
    summary: { totalWeeks: 0, totalMonths: 0 },
  };
  const dir = getReportAnalysisDir('manager', reportId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'timeline.json'), JSON.stringify(timeline));
}

describe('team timeline', () => {
  const alicePR = timelinePR(1, 'major', 300, '2025-03-04');
  const bobPR = timelinePR(2, 'minor', 5, '2025-03-05');
  const bobLaterPR = timelinePR(3, 'flagship', 900, '2025-04-08');

  // Team timelines feed manager reviews, so each PR must stay attributed to
  // the report that did it while the team totals add up.
  it('merges reports by week and month and keeps who did what', async () => {
    writeTimeline(
      'alice',
      { since: '2025-03-01', until: '2025-03-31' },
      { '2025-03': week('2025-03-03', '2025-03-09', [alicePR]) },
    );
    writeTimeline(
      'bob',
      { since: '2025-02-01', until: '2025-04-30' },
      {
        '2025-04': week('2025-04-07', '2025-04-13', [bobLaterPR]),
        '2025-03': week('2025-03-03', '2025-03-09', [bobPR]),
      },
    );

    await writeTeamAnalysis('manager', ['alice', 'bob']);
    const written = JSON.parse(
      readFileSync(
        join(getReportAnalysisDir('manager', ''), 'team-timeline.json'),
        'utf-8',
      ),
    );

    expect(written).toMatchObject({
      reports: ['alice', 'bob'],
      skippedReports: [],
      dateRange: { since: '2025-02-01', until: '2025-04-30' },
      summary: {
        totalWeeks: 2,
        totalMonths: 2,
        busiestWeek: { weekStart: '2025-03-03', prCount: 2 },
        busiestMonth: { month: '2025-03', prCount: 2 },
      },
    });

    const [march, april] = written.months;
    expect(march.month).toBe('2025-03');
    expect(march.stats).toEqual({
      prCount: 2,
      ticketCount: 0,
      additions: 305,
      deletions: 2,
      byImpact: { flagship: 0, major: 1, standard: 0, minor: 1 },
    });
    expect(march.byReport.alice.byImpact.major).toBe(1);
    expect(march.byReport.bob.byImpact.minor).toBe(1);
    expect(march.weeks).toHaveLength(1);
    expect(march.weeks[0].stats.prCount).toBe(2);
    expect(march.weeks[0].byReport.alice.prs).toEqual([alicePR]);
    expect(march.weeks[0].byReport.bob.prs).toEqual([bobPR]);

    expect(april.month).toBe('2025-04');
    expect(Object.keys(april.byReport)).toEqual(['bob']);
    expect(april.weeks[0].byReport.bob.prs).toEqual([bobLaterPR]);
  });

  // Report IDs are user-chosen names, so one must never collide with an
  // inherited object property.
  it('rolls up a report whose ID is an Object.prototype name', async () => {
    const id = 'constructor';
    writeTimeline(
      id,
      { since: '2025-03-01', until: '2025-03-31' },
      { '2025-03': week('2025-03-03', '2025-03-09', [alicePR]) },
    );

    const timeline = await aggregateTeamTimeline('manager', [id]);

    expect(timeline.reports).toEqual([id]);
    const [march] = timeline.months;
    expect(march?.byReport[id]?.prCount).toBe(1);
    expect(march?.weeks[0]?.byReport[id]?.prs).toEqual([alicePR]);
  });

  it('skips reports with a missing or malformed timeline', async () => {
    writeTimeline(
      'alice',
      { since: '2025-03-01', until: '2025-03-31' },
      { '2025-03': week('2025-03-03', '2025-03-09', [alicePR]) },
    );
    const brokenDir = getReportAnalysisDir('manager', 'broken');
    mkdirSync(brokenDir, { recursive: true });
    writeFileSync(
      join(brokenDir, 'timeline.json'),
      JSON.stringify({ months: [null] }),
    );

    const timeline = await aggregateTeamTimeline('manager', [
      'broken',
      'alice',
      'carol',
    ]);

    expect(timeline.reports).toEqual(['alice']);
    expect(timeline.skippedReports).toEqual(['broken', 'carol']);
    expect(timeline.months.map((m) => Object.keys(m.byReport))).toEqual([
      ['alice'],
    ]);
  });

  // Periods are merged and sorted by their key strings, so a key that is not
  // canonical would open a duplicate period or land out of order.
  it('skips reports with an empty date range or non-canonical period keys', async () => {
    writeTimeline(
      'alice',
      { since: '2025-03-01', until: '2025-03-31' },
      { '2025-03': week('2025-03-03', '2025-03-09', [alicePR]) },
    );
    writeTimeline(
      'short-month',
      { since: '2025-03-01', until: '2025-03-31' },
      { '2025-3': week('2025-03-03', '2025-03-09', [bobPR]) },
    );
    writeTimeline(
      'short-week',
      { since: '2025-03-01', until: '2025-03-31' },
      { '2025-03': week('2025-3-3', '2025-03-09', [bobPR]) },
    );
    writeTimeline(
      'no-range',
      { since: '', until: '2025-03-31' },
      { '2025-03': week('2025-03-03', '2025-03-09', [bobPR]) },
    );

    const timeline = await aggregateTeamTimeline('manager', [
      'alice',
      'short-month',
      'short-week',
      'no-range',
    ]);

    expect(timeline.reports).toEqual(['alice']);
    expect(timeline.skippedReports).toEqual([
      'short-month',
      'short-week',
      'no-range',
    ]);
    expect(timeline.months.map((m) => m.month)).toEqual(['2025-03']);
    expect(timeline.summary.totalWeeks).toBe(1);
  });
});
