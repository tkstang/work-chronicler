import type {
  AnalysisConfig,
  PRImpact,
  PullRequest,
} from '@work-chronicler/core';

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
  // Minor by default (can be upgraded by size)
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

/**
 * Extract conventional commit type from PR title
 * Handles: "feat: message", "feat(scope): message", "[feat] message"
 */
function extractConventionalType(title: string): string | null {
  // Match "type:" or "type(scope):"
  const conventionalMatch = title.match(/^(\w+)(?:\([^)]*\))?:\s*/i);
  if (conventionalMatch?.[1]) {
    return conventionalMatch[1].toLowerCase();
  }

  // Match "[type]"
  const bracketMatch = title.match(/^\[(\w+)\]/i);
  if (bracketMatch?.[1]) {
    return bracketMatch[1].toLowerCase();
  }

  return null;
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

  // Check size thresholds first for flagship
  const isFlagshipSize =
    (thresholds.flagship.minLines &&
      totalLines >= thresholds.flagship.minLines) ||
    (thresholds.flagship.minFiles &&
      pr.changedFiles >= thresholds.flagship.minFiles);

  // Check flagship patterns
  const hasFlagshipPattern = FLAGSHIP_PATTERNS.some((p) => p.test(title));

  if (isFlagshipSize || hasFlagshipPattern) {
    return 'flagship';
  }

  // Check conventional commit type
  const conventionalType = extractConventionalType(title);
  let baseImpact: PRImpact | null = null;

  if (conventionalType && conventionalType in CONVENTIONAL_COMMIT_MAP) {
    baseImpact = CONVENTIONAL_COMMIT_MAP[conventionalType] ?? null;
  }

  // Check for minor patterns and labels
  const hasMinorPattern = MINOR_PATTERNS.some((p) => p.test(title));
  const hasMinorLabel = pr.labels.some((label) =>
    MINOR_LABELS.includes(label.toLowerCase()),
  );

  // Check size for minor
  const isMinorSize =
    thresholds.minor.maxLines &&
    totalLines <= thresholds.minor.maxLines &&
    thresholds.minor.maxFiles &&
    pr.changedFiles <= thresholds.minor.maxFiles;

  // If conventional commit says minor, or patterns say minor with small size
  if (
    baseImpact === 'minor' ||
    ((hasMinorPattern || hasMinorLabel) && isMinorSize)
  ) {
    return 'minor';
  }

  // Very small changes are minor regardless
  if (totalLines <= 10 && pr.changedFiles <= 2) {
    return 'minor';
  }

  // Check for major size
  const isMajorSize =
    (thresholds.major.minLines && totalLines >= thresholds.major.minLines) ||
    (thresholds.major.minFiles && pr.changedFiles >= thresholds.major.minFiles);

  // Check for major patterns
  const hasMajorPattern = MAJOR_PATTERNS.some((p) => p.test(title));

  // If conventional commit says major, or patterns/size indicate major
  if (baseImpact === 'major' || isMajorSize || hasMajorPattern) {
    return 'major';
  }

  // If conventional commit gave us a base impact, use it
  if (baseImpact) {
    return baseImpact;
  }

  // Everything else is standard
  return 'standard';
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
