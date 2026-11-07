import type { PullRequest, PullRequestFile } from '@core/index';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { generateTimeline } from './timeline';

function prFile(mergedAt: string): PullRequestFile {
  const frontmatter: PullRequest = {
    title: 'Ship it',
    prNumber: 1,
    repository: 'app',
    org: 'acme',
    author: 'alice',
    state: 'merged',
    createdAt: mergedAt,
    mergedAt,
    closedAt: mergedAt,
    url: 'https://github.com/acme/app/pull/1',
    additions: 50,
    deletions: 0,
    changedFiles: 4,
    jiraTickets: [],
    labels: [],
    impact: 'standard',
  };
  return { frontmatter, body: '', filePath: '/work-log/pr.md' };
}

// Timelines feed manager reviews and the team rollup, which keys weeks and
// months by these strings. The local timezone of whoever ran `analyze` must
// not move a PR into another week or a week into another month.
describe('generateTimeline period keys', () => {
  beforeEach(() => {
    // UTC-4 in September: local and UTC dates differ for part of each day.
    vi.stubEnv('TZ', 'America/New_York');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('files a PR by its UTC date even when the local date is a day earlier', () => {
    // Monday 2025-09-01 02:00 UTC is Sunday 2025-08-31 22:00 in New York.
    const timeline = generateTimeline(
      [prFile('2025-09-01T02:00:00Z')],
      [],
      '2025-08-01',
      '2025-09-30',
    );

    expect(timeline.months).toHaveLength(1);
    const [month] = timeline.months;
    expect(month).toMatchObject({
      month: '2025-09',
      monthName: 'September 2025',
    });
    expect(month?.weeks).toHaveLength(1);
    expect(month?.weeks[0]).toMatchObject({
      weekStart: '2025-09-01',
      weekEnd: '2025-09-07',
      // ISO week 1 of 2025 starts Monday 2024-12-30; 2025-09-01 is 35 weeks later.
      weekNumber: 36,
      year: 2025,
    });
    expect(month?.weeks[0]?.prs[0]?.date).toBe('2025-09-01');
  });

  it('files a week that starts on the 1st under that month', () => {
    // Tuesday 2025-09-02 12:00 UTC: the same calendar day in New York.
    const timeline = generateTimeline(
      [prFile('2025-09-02T12:00:00Z')],
      [],
      '2025-08-01',
      '2025-09-30',
    );

    expect(timeline.months.map((m) => m.month)).toEqual(['2025-09']);
    expect(timeline.months[0]?.weeks[0]?.weekStart).toBe('2025-09-01');
  });
});
