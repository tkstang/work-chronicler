import type { AnalysisConfig, PullRequest } from '@core/index';
import { describe, expect, it } from 'vitest';

import { classifyPRImpact } from './classifier';

// Impact labels end up on resumes and in performance reviews, so these tests
// pin each tier boundary and the title/label signals that move a PR between
// tiers. Expected values come from the documented defaults: minor <= 20 lines
// and <= 3 files, major >= 200 lines or >= 8 files, flagship >= 500 lines or
// >= 15 files.
function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    title: 'Tweak search ranking',
    prNumber: 1,
    repository: 'app',
    org: 'acme',
    author: 'alice',
    state: 'merged',
    createdAt: '2025-01-01T12:00:00Z',
    mergedAt: '2025-01-02T12:00:00Z',
    closedAt: '2025-01-02T12:00:00Z',
    url: 'https://github.com/acme/app/pull/1',
    additions: 50,
    deletions: 0,
    changedFiles: 4,
    jiraTickets: [],
    labels: [],
    ...overrides,
  };
}

describe('classifyPRImpact size tiers', () => {
  it.each([
    // [additions + deletions, files, expected]
    [499, 4, 'major'],
    [500, 4, 'flagship'],
    [50, 14, 'major'],
    [50, 15, 'flagship'],
    [199, 7, 'standard'],
    [200, 7, 'major'],
    [50, 8, 'major'],
    [11, 2, 'standard'],
    [10, 2, 'minor'],
    [10, 3, 'standard'],
  ] as const)('%i lines across %i files is %s', (lines, files, expected) => {
    expect(
      classifyPRImpact(
        pr({ additions: lines, deletions: 0, changedFiles: files }),
      ),
    ).toBe(expected);
  });

  it('counts deletions toward size', () => {
    expect(
      classifyPRImpact(pr({ additions: 250, deletions: 250, changedFiles: 4 })),
    ).toBe('flagship');
  });

  it('applies configured thresholds instead of the defaults', () => {
    const config: AnalysisConfig = {
      thresholds: {
        minor: { maxLines: 20, maxFiles: 3 },
        major: { minLines: 100, minFiles: 50 },
        flagship: { minLines: 1000, minFiles: 50 },
      },
    };
    const midSize = pr({ additions: 600, changedFiles: 4 });

    expect(classifyPRImpact(midSize)).toBe('flagship');
    expect(classifyPRImpact(midSize, config)).toBe('major');
    expect(classifyPRImpact(pr({ additions: 150 }), config)).toBe('major');
  });
});

describe('classifyPRImpact title and label signals', () => {
  it.each([
    ['feat: add saved searches', 'major'],
    ['feat(search): add saved searches', 'major'],
    ['[feat] add saved searches', 'major'],
    ['refactor: split search service', 'major'],
    ['Add saved searches', 'major'],
    ['Implement saved searches', 'major'],
    ['fix: handle empty query', 'standard'],
    ['perf: cache ranking weights', 'standard'],
    ['test: cover ranking', 'standard'],
    ['docs: explain ranking', 'minor'],
    ['chore: tidy scripts', 'minor'],
    ['ci: cache pnpm store', 'minor'],
    ['build: bump target', 'minor'],
    ['style: reformat', 'minor'],
  ] as const)('"%s" at standard size is %s', (title, expected) => {
    expect(classifyPRImpact(pr({ title }))).toBe(expected);
  });

  it.each([
    'Rewrite the billing pipeline',
    'Platform: shared auth client',
    'Breaking change to the events API',
    'Database migration to Postgres 16',
    'Redesign the settings page',
  ])('flagship keyword in "%s" promotes a standard-size PR', (title) => {
    expect(classifyPRImpact(pr({ title }))).toBe('flagship');
  });

  it('keeps a minor conventional type minor below major size', () => {
    expect(
      classifyPRImpact(
        pr({ title: 'chore: vendor sdk', additions: 199, changedFiles: 7 }),
      ),
    ).toBe('minor');
    // Changed by the owner-approved relabel: was 'minor' (a minor type stayed
    // minor until flagship size); major size now promotes it.
    expect(
      classifyPRImpact(
        pr({ title: 'chore: vendor sdk', additions: 499, changedFiles: 14 }),
      ),
    ).toBe('major');
    expect(
      classifyPRImpact(
        pr({
          title: 'chore: reorganize folders',
          additions: 300,
          changedFiles: 10,
        }),
      ),
    ).toBe('major');
    expect(
      classifyPRImpact(pr({ title: 'chore: vendor sdk', additions: 500 })),
    ).toBe('flagship');
  });

  it('promotes a feat to flagship by size', () => {
    expect(
      classifyPRImpact(pr({ title: 'feat: new editor', additions: 800 })),
    ).toBe('flagship');
  });

  it('treats a small dependency bump as minor by title or label', () => {
    expect(
      classifyPRImpact(
        pr({ title: 'Bump lodash to 4.17.21', additions: 20, changedFiles: 3 }),
      ),
    ).toBe('minor');
    expect(
      classifyPRImpact(
        pr({
          title: 'Lodash 4.17.21',
          labels: ['Dependencies'],
          additions: 20,
          changedFiles: 3,
        }),
      ),
    ).toBe('minor');
  });

  it('does not let a minor title or label demote a larger PR', () => {
    expect(
      classifyPRImpact(
        pr({ title: 'Bump lodash to 4.17.21', additions: 21, changedFiles: 3 }),
      ),
    ).toBe('standard');
    expect(
      classifyPRImpact(
        pr({
          title: 'Search tweaks',
          labels: ['chore'],
          additions: 300,
          changedFiles: 4,
        }),
      ),
    ).toBe('major');
  });

  it('labels a very small feat minor regardless of type', () => {
    expect(
      classifyPRImpact(
        pr({ title: 'feat: toggle', additions: 5, changedFiles: 1 }),
      ),
    ).toBe('minor');
  });

  it.each([
    ['fix typo in migration guide', 2, 1],
    ['docs: platform setup guide', 5, 1],
    ['docs: rewrite the platform guide', 150, 6],
    ['Bump the migration runner', 12, 2],
  ] as const)(
    'a minor signal stops the keyword in "%s" (%i lines, %i files) promoting to flagship',
    (title, lines, files) => {
      expect(
        classifyPRImpact(
          pr({ title, additions: lines, deletions: 0, changedFiles: files }),
        ),
      ).toBe('minor');
    },
  );

  it.each([
    ['chore(deps): bump lodash', []],
    ['build(deps): bump esbuild', []],
    ['chore(deps-dev): bump vitest', []],
    ['Update lockfile', ['dependencies']],
    ['Lock file maintenance', ['renovate']],
  ] as const)(
    'keeps the dependency update "%s" minor at any size',
    (title, labels) => {
      expect(
        classifyPRImpact(
          pr({ title, labels: [...labels], additions: 3000, changedFiles: 2 }),
        ),
      ).toBe('minor');
    },
  );

  it('does not exempt other chores or scopes from size promotion', () => {
    expect(
      classifyPRImpact(
        pr({ title: 'chore(ci): bump runners', additions: 3000 }),
      ),
    ).toBe('flagship');
    expect(
      classifyPRImpact(
        pr({ title: 'chore: tidy', labels: ['maintenance'], additions: 3000 }),
      ),
    ).toBe('flagship');
  });

  it.each([
    'feat!: drop Node 18',
    'feat(api)!: remove v1 endpoints',
    'chore(deps)!: require Node 22',
  ])('treats the breaking marker in "%s" as flagship', (title) => {
    expect(classifyPRImpact(pr({ title, additions: 5, changedFiles: 1 }))).toBe(
      'flagship',
    );
  });
});
