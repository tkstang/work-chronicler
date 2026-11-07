import { z } from 'zod';

/**
 * Normalize a GitHub org or user name.
 *
 * Trims whitespace and strips one leading `@`, so a handle written the way
 * GitHub displays it (`@voxmedia`) becomes the name the API expects
 * (`voxmedia`).
 *
 * @example
 * ```ts
 * normalizeGitHubName(' @voxmedia '); // 'voxmedia'
 * ```
 */
export function normalizeGitHubName(name: string): string {
  const trimmed = name.trim();
  return trimmed.startsWith('@') ? trimmed.slice(1).trim() : trimmed;
}

/**
 * Describe why a normalized GitHub name is unusable, or return null.
 *
 * GitHub names never contain `@`, so one that survives normalization
 * (e.g. `@@voxmedia`) is a typo that would 404 every request.
 */
export function getGitHubNameProblem(normalized: string): string | null {
  if (!normalized) return 'GitHub name is required';
  if (normalized.includes('@')) {
    return `"${normalized}" is not a valid GitHub name (it contains "@")`;
  }
  return null;
}

/**
 * A GitHub name that may be empty (e.g. the IC username of a JIRA-only
 * profile), normalized at parse time. Callers that need a value must check
 * for emptiness themselves.
 */
export const OptionalGitHubNameSchema = z
  .string()
  .transform(normalizeGitHubName)
  .superRefine((name, ctx) => {
    const problem = name ? getGitHubNameProblem(name) : null;
    if (problem)
      ctx.addIssue({ code: 'custom', message: problem });
  });

/**
 * A required GitHub org or user name, normalized at parse time.
 */
export const GitHubNameSchema = OptionalGitHubNameSchema.refine(
  (name) => name.length > 0,
  'GitHub name is required',
);
