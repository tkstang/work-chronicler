import { describe, expect, it } from 'vitest';

import { PullRequestSchema } from './pr';

const basePR = {
  title: 'Add retry to webhook sender',
  prNumber: 42,
  repository: 'chorus',
  org: 'voxmedia',
  author: 'octocat',
  state: 'merged',
  url: 'https://github.com/voxmedia/chorus/pull/42',
  additions: 10,
  deletions: 2,
  changedFiles: 1,
};

describe('PullRequestSchema timestamps', () => {
  // Work-log files written under Zod 3 may carry minute-precision timestamps.
  // Rejecting them would make those PRs vanish from every reader.
  it('keeps accepting minute-precision timestamps from older work logs', () => {
    const result = PullRequestSchema.safeParse({
      ...basePR,
      createdAt: '2025-01-01T12:00Z',
      mergedAt: '2025-01-02T09:30Z',
      closedAt: '2025-01-02T09:30Z',
    });

    expect(result.success).toBe(true);
  });

  it('accepts second and millisecond precision and rejects non-ISO strings', () => {
    expect(
      PullRequestSchema.safeParse({
        ...basePR,
        createdAt: '2025-01-01T12:00:05.123Z',
        mergedAt: '2025-01-02T09:30:00Z',
        closedAt: null,
      }).success,
    ).toBe(true);
    expect(
      PullRequestSchema.safeParse({
        ...basePR,
        createdAt: 'January 1, 2025',
        mergedAt: null,
        closedAt: null,
      }).success,
    ).toBe(false);
  });
});
