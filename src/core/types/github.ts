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
 * A GitHub org or user name, normalized at parse time.
 */
export const GitHubNameSchema = z.string().transform(normalizeGitHubName);
