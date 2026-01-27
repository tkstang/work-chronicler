import type { PRImpact } from '@core/index';
import { checkbox, confirm, input, select } from '@inquirer/prompts';

/**
 * Prompt for confirmation
 */
export async function confirmAction(message: string): Promise<boolean> {
  return await confirm({ message, default: false });
}

/**
 * Prompt whether to use cache when fetching data
 */
export async function promptUseCache(): Promise<boolean> {
  return await confirm({
    message:
      'Existing data found. Use cache mode? (Skip items already fetched)',
    default: true,
  });
}

/**
 * Prompt whether to analyze filtered or full data
 */
export async function promptUseFiltered(): Promise<boolean> {
  return await confirm({
    message: 'Filtered data found. Analyze filtered data instead of full?',
    default: true,
  });
}

/**
 * Impact level choices for prompts
 */
const IMPACT_CHOICES: Array<{ name: string; value: PRImpact }> = [
  {
    name: 'Flagship - Large initiatives, migrations, platform changes',
    value: 'flagship',
  },
  { name: 'Major - Significant features, larger refactors', value: 'major' },
  { name: 'Standard - Regular features, bug fixes', value: 'standard' },
  { name: 'Minor - Small fixes, docs, dependency updates', value: 'minor' },
];

/**
 * Prompt for impact levels to exclude (multi-select)
 */
export async function promptExcludeImpact(): Promise<PRImpact[]> {
  return await checkbox({
    message: 'Select impact levels to exclude:',
    choices: IMPACT_CHOICES,
  });
}

/**
 * Prompt for minimum impact level (single-select)
 */
export async function promptMinImpact(): Promise<PRImpact | null> {
  return await select({
    message: 'Select minimum impact level:',
    choices: [
      { name: 'No minimum (include all)', value: null },
      ...IMPACT_CHOICES,
    ],
  });
}

/**
 * Prompt for minimum lines of code
 */
export async function promptMinLoc(): Promise<number | null> {
  const useLoc = await confirm({
    message: 'Filter by minimum lines of code?',
    default: false,
  });

  if (!useLoc) {
    return null;
  }

  const loc = await input({
    message: 'Minimum lines of code (additions + deletions):',
    default: '100',
    validate: (value: string) => {
      const num = Number.parseInt(value, 10);
      if (Number.isNaN(num) || num < 0) {
        return 'Please enter a positive number';
      }
      return true;
    },
  });

  return Number.parseInt(loc, 10);
}

/**
 * Common ticket statuses
 */
const TICKET_STATUS_CHOICES = [
  { name: 'To Do - Not yet started', value: 'To Do' },
  { name: 'Rejected - Declined tickets', value: 'Rejected' },
  { name: 'Blocked - Blocked tickets', value: 'Blocked' },
  { name: 'In Progress - Currently being worked on', value: 'In Progress' },
  { name: 'Code Review - In review', value: 'Code Review' },
  {
    name: 'Ready for Release - Awaiting deployment',
    value: 'Ready for Release',
  },
  { name: 'Done - Completed tickets', value: 'Done' },
];

/**
 * Prompt for ticket statuses to exclude (multi-select)
 */
export async function promptExcludeStatus(): Promise<string[]> {
  return await checkbox({
    message: 'Select ticket statuses to exclude:',
    choices: TICKET_STATUS_CHOICES,
  });
}

/**
 * Prompt for filter options (linked-only, merged-only)
 */
export async function promptFilterOptions(): Promise<{
  linkedOnly: boolean;
  mergedOnly: boolean;
  excludeStatus: string[];
}> {
  const options = await checkbox({
    message: 'Additional filters:',
    choices: [
      { name: 'Only PRs linked to JIRA tickets', value: 'linkedOnly' },
      { name: 'Only merged PRs', value: 'mergedOnly' },
      { name: 'Exclude certain ticket statuses', value: 'excludeStatus' },
    ],
  });

  let excludeStatus: string[] = [];
  if (options.includes('excludeStatus')) {
    excludeStatus = await promptExcludeStatus();
  }

  return {
    linkedOnly: options.includes('linkedOnly'),
    mergedOnly: options.includes('mergedOnly'),
    excludeStatus,
  };
}

/**
 * Analysis options that can be selected
 */
export interface AnalyzeOptions {
  tagPrs: boolean;
  projects: boolean;
  timeline: boolean;
}

/**
 * Prompt for analyze options (what to generate)
 */
export async function promptAnalyzeOptions(): Promise<AnalyzeOptions> {
  const options = await checkbox({
    message: 'What would you like to generate?',
    choices: [
      {
        name: 'Tag PRs with impact levels (updates PR files)',
        value: 'tagPrs',
        checked: true,
      },
      {
        name: 'Detect project groupings',
        value: 'projects',
        checked: true,
      },
      {
        name: 'Generate timeline (weekly/monthly breakdown)',
        value: 'timeline',
        checked: true,
      },
    ],
  });

  return {
    tagPrs: options.includes('tagPrs'),
    projects: options.includes('projects'),
    timeline: options.includes('timeline'),
  };
}

/**
 * Interactive filter prompts - prompts for all filter options
 */
export async function promptFilterInteractive(): Promise<{
  excludeImpact: PRImpact[];
  minImpact: PRImpact | null;
  minLoc: number | null;
  linkedOnly: boolean;
  mergedOnly: boolean;
  excludeStatus: string[];
}> {
  // First, ask what type of filtering they want
  const filterType = await select({
    message: 'How would you like to filter your work log?',
    choices: [
      {
        name: 'By minimum impact level (e.g., major and above)',
        value: 'minImpact',
      },
      { name: 'Exclude specific impact levels', value: 'excludeImpact' },
      {
        name: 'Custom filters (LOC, linked, merged, status)',
        value: 'custom',
      },
      { name: 'All of the above', value: 'all' },
    ],
  });

  let excludeImpact: PRImpact[] = [];
  let minImpact: PRImpact | null = null;
  let minLoc: number | null = null;
  let linkedOnly = false;
  let mergedOnly = false;
  let excludeStatus: string[] = [];

  if (filterType === 'minImpact' || filterType === 'all') {
    minImpact = await promptMinImpact();
  }

  if (filterType === 'excludeImpact' || filterType === 'all') {
    excludeImpact = await promptExcludeImpact();
  }

  if (filterType === 'custom' || filterType === 'all') {
    minLoc = await promptMinLoc();
    const options = await promptFilterOptions();
    linkedOnly = options.linkedOnly;
    mergedOnly = options.mergedOnly;
    excludeStatus = options.excludeStatus;
  }

  return {
    excludeImpact,
    minImpact,
    minLoc,
    linkedOnly,
    mergedOnly,
    excludeStatus,
  };
}
