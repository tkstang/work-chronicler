import type { AnalysisConfig, PRImpact, PullRequest } from '@core/index';

/**
 * Default thresholds for impact classification
 */
export const DEFAULT_THRESHOLDS = {
  minor: { maxLines: 20, maxFiles: 3 },
  major: { minLines: 200, minFiles: 8 },
  flagship: { minLines: 500, minFiles: 15 },
};

/**
 * Conventional commit prefixes and their default impact
 */
const CONVENTIONAL_COMMIT_MAP: Record<string, PRImpact> = {
  // Minor by default; major or flagship size still promotes them, except
  // dependency updates (see isDependencyUpdate)
  chore: 'minor',
  docs: 'minor',
  style: 'minor',
  ci: 'minor',
  build: 'minor',
  // Standard by default
  fix: 'standard',
  test: 'standard',
  perf: 'standard',
  // Major by default (can be upgraded to flagship by size)
  feat: 'major',
  refactor: 'major',
};

/**
 * Patterns that indicate minor/low-value PRs (checked after conventional commits)
 */
const MINOR_PATTERNS = [
  /^fix\s*typo/i,
  /^typo/i,
  /^update\s+deps?/i,
  /^bump\s+/i,
  /^\[chore\]/i,
  /^update\s+dependencies/i,
  /^dependency\s+update/i,
  /^renovate/i,
  /^dependabot/i,
];

/** Labels that mark a dependency update (minor at any size) */
const DEPENDENCY_LABELS = ['dependencies', 'renovate', 'dependabot'];

/** Conventional types whose `deps` scope marks a dependency update */
const DEPENDENCY_TYPES = new Set(['chore', 'build']);
const DEPENDENCY_SCOPES = new Set(['deps', 'deps-dev']);

const MINOR_LABELS = [
  'dependencies',
  'chore',
  'maintenance',
  'renovate',
  'dependabot',
];

/**
 * Patterns that indicate major work (checked after conventional commits)
 */
const MAJOR_PATTERNS = [/^\[feat\]/i, /^add\s+/i, /^implement\s+/i, /^new\s+/i];

/**
 * Patterns that indicate flagship/breaking work
 */
const FLAGSHIP_PATTERNS = [
  /breaking/i,
  /platform/i,
  /architect/i,
  /migration/i,
  /redesign/i,
  /overhaul/i,
  /rewrite/i,
];

interface ConventionalPrefix {
  type: string;
  scope: string | null;
  breaking: boolean;
}

/**
 * Parse the conventional commit prefix of a PR title.
 * Handles: "feat: message", "feat(scope): message", "feat!: message",
 * "feat(scope)!: message" and "[feat] message".
 */
function parseConventionalPrefix(title: string): ConventionalPrefix | null {
  const conventionalMatch = title.match(/^(\w+)(?:\(([^)]*)\))?(!)?:\s*/i);
  if (conventionalMatch?.[1]) {
    return {
      type: conventionalMatch[1].toLowerCase(),
      scope: conventionalMatch[2]?.trim().toLowerCase() ?? null,
      breaking: conventionalMatch[3] === '!',
    };
  }

  const bracketMatch = title.match(/^\[(\w+)\]/i);
  if (bracketMatch?.[1]) {
    return {
      type: bracketMatch[1].toLowerCase(),
      scope: null,
      breaking: false,
    };
  }

  return null;
}

/**
 * Whether a PR is a dependency update: a dependency label, or a
 * `chore(deps)` / `build(deps)` title. Lockfile bumps can be any size, so
 * these stay minor regardless of lines or files.
 */
function isDependencyUpdate(
  pr: PullRequest,
  prefix: ConventionalPrefix | null,
): boolean {
  if (
    pr.labels.some((label) => DEPENDENCY_LABELS.includes(label.toLowerCase()))
  ) {
    return true;
  }
  return (
    prefix !== null &&
    DEPENDENCY_TYPES.has(prefix.type) &&
    prefix.scope !== null &&
    DEPENDENCY_SCOPES.has(prefix.scope)
  );
}

/**
 * Classify a PR's impact level based on its characteristics
 */
export function classifyPRImpact(
  pr: PullRequest,
  config?: AnalysisConfig,
): PRImpact {
  const thresholds = {
    minor: { ...DEFAULT_THRESHOLDS.minor, ...config?.thresholds?.minor },
    major: { ...DEFAULT_THRESHOLDS.major, ...config?.thresholds?.major },
    flagship: {
      ...DEFAULT_THRESHOLDS.flagship,
      ...config?.thresholds?.flagship,
    },
  };

  const totalLines = pr.additions + pr.deletions;
  const title = pr.title;
  const prefix = parseConventionalPrefix(title);

  // 1. An explicit breaking marker (`feat!:`, `feat(api)!:`) is flagship,
  //    ahead of every other rule.
  if (prefix?.breaking) {
    return 'flagship';
  }

  // 2. Dependency updates stay minor at any size.
  if (isDependencyUpdate(pr, prefix)) {
    return 'minor';
  }

  // 3. Flagship size promotes anything else.
  const isFlagshipSize =
    (thresholds.flagship.minLines &&
      totalLines >= thresholds.flagship.minLines) ||
    (thresholds.flagship.minFiles &&
      pr.changedFiles >= thresholds.flagship.minFiles);

  if (isFlagshipSize) {
    return 'flagship';
  }

  let baseImpact: PRImpact | null = null;
  if (prefix && prefix.type in CONVENTIONAL_COMMIT_MAP) {
    baseImpact = CONVENTIONAL_COMMIT_MAP[prefix.type] ?? null;
  }

  const hasMinorPattern = MINOR_PATTERNS.some((p) => p.test(title));
  const hasMinorLabel = pr.labels.some((label) =>
    MINOR_LABELS.includes(label.toLowerCase()),
  );

  const isMinorSize =
    thresholds.minor.maxLines &&
    totalLines <= thresholds.minor.maxLines &&
    thresholds.minor.maxFiles &&
    pr.changedFiles <= thresholds.minor.maxFiles;

  const isMajorSize =
    (thresholds.major.minLines && totalLines >= thresholds.major.minLines) ||
    (thresholds.major.minFiles && pr.changedFiles >= thresholds.major.minFiles);

  const isTinyChange = totalLines <= 10 && pr.changedFiles <= 2;
  const hasMinorTitleOrLabel =
    (hasMinorPattern || hasMinorLabel) && isMinorSize;

  // 4. A flagship keyword ("migration", "platform", ...) promotes only when
  //    nothing marks the PR as minor: "fix typo in migration guide" is not
  //    flagship work.
  const hasMinorSignal =
    baseImpact === 'minor' || hasMinorTitleOrLabel || isTinyChange;
  const hasFlagshipPattern = FLAGSHIP_PATTERNS.some((p) => p.test(title));

  if (hasFlagshipPattern && !hasMinorSignal) {
    return 'flagship';
  }

  // 5. Minor: a minor conventional type below major size, a minor title or
  //    label at minor size, or a very small change of any type.
  if (
    (baseImpact === 'minor' && !isMajorSize) ||
    hasMinorTitleOrLabel ||
    isTinyChange
  ) {
    return 'minor';
  }

  // 6. Major: a major conventional type, major size or a major title pattern.
  const hasMajorPattern = MAJOR_PATTERNS.some((p) => p.test(title));

  if (baseImpact === 'major' || isMajorSize || hasMajorPattern) {
    return 'major';
  }

  // 7. Otherwise the conventional type's tier, or standard.
  return baseImpact ?? 'standard';
}

/**
 * Get a human-readable description of what the impact means
 */
export function getImpactDescription(impact: PRImpact): string {
  switch (impact) {
    case 'flagship':
      return 'Large initiatives, platform changes, or multi-PR efforts';
    case 'major':
      return 'Significant features, larger refactors, or architectural work';
    case 'standard':
      return 'Regular feature work, bug fixes, and moderate changes';
    case 'minor':
      return 'Small fixes, typos, docs, or dependency updates';
    default: {
      const _exhaustive: never = impact;
      return _exhaustive;
    }
  }
}

/**
 * Impact level hierarchy for comparison (higher = more significant)
 */
export const IMPACT_HIERARCHY: Record<PRImpact, number> = {
  minor: 0,
  standard: 1,
  major: 2,
  flagship: 3,
};
