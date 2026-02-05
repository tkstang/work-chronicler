/**
 * Shared fetch utilities
 *
 * Common utilities used across fetch subcommands.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { DIRECTORIES } from '@core/index';
import { promptUseCache } from '@prompts';

export interface ResolveCacheParams {
  outputDir: string;
  cacheFlag: boolean | undefined;
  checkDirectories: ('github' | 'jira')[];
}

/**
 * Resolve cache behavior based on flags and existing data
 *
 * If --cache flag is set, use it. Otherwise, prompt if data exists.
 *
 * @param params - Parameters for cache resolution
 * @returns Whether to use cache mode
 */
export async function resolveCacheBehavior(
  params: ResolveCacheParams,
): Promise<boolean> {
  const { outputDir, cacheFlag, checkDirectories } = params;

  // If --cache flag explicitly set, use it
  if (cacheFlag !== undefined) {
    return cacheFlag;
  }

  // Check if any of the specified directories exist
  const directoryMap = {
    github: DIRECTORIES.PULL_REQUESTS,
    jira: DIRECTORIES.JIRA,
  };

  const hasExistingData = checkDirectories.some((dir) => {
    const dirPath = join(outputDir, directoryMap[dir]);
    return existsSync(dirPath);
  });

  // Prompt user if data exists
  if (hasExistingData) {
    return promptUseCache();
  }

  return false;
}
