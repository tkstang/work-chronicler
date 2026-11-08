import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getPRDirectory, getPRFilePath, getPRReviewFilePath } from './paths';

describe('PR storage paths', () => {
  it('never writes an org directory with a leading @', () => {
    const date = new Date('2025-03-04T12:00:00Z');

    expect(getPRFilePath('/wl', '@voxmedia', 'chorus', date, 42)).toBe(
      join('/wl', 'pull-requests', 'voxmedia', 'chorus', '2025-03-04_42.md'),
    );
    expect(getPRDirectory('/wl', '@voxmedia')).toBe(
      join('/wl', 'pull-requests', 'voxmedia'),
    );
    expect(() => getPRDirectory('/wl', '@@voxmedia')).toThrow(/@/);
  });
});

describe('review record paths', () => {
  it('keys each record by org, repo and PR number', () => {
    expect(getPRReviewFilePath('/wl', '@acme', 'api', 7)).toBe(
      join('/wl', 'pr-reviews', 'acme', 'api', '7.md'),
    );
    expect(getPRReviewFilePath('/wl', 'acme', 'web', 7)).not.toBe(
      getPRReviewFilePath('/wl', 'acme', 'api', 7),
    );
  });

  it.each(['..', '.', 'a/b', ''])(
    'refuses repository name %j that would leave the org directory',
    (repo) => {
      expect(() => getPRReviewFilePath('/wl', 'acme', repo, 7)).toThrow(
        /repository/,
      );
    },
  );
});
