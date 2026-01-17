import type { PRImpact } from '@work-chronicler/core';
import inquirer from 'inquirer';

/**
 * Prompt for confirmation
 */
export async function confirmAction(message: string): Promise<boolean> {
  const { confirmed } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmed',
      message,
      default: false,
    },
  ]);
  return confirmed;
}

/**
 * Prompt whether to use cache when fetching data
 */
export async function promptUseCache(): Promise<boolean> {
  const { useCache } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'useCache',
      message:
        'Existing data found. Use cache mode? (Skip items already fetched)',
      default: true,
    },
  ]);
  return useCache;
}

/**
 * Prompt whether to analyze filtered or full data
 */
export async function promptUseFiltered(): Promise<boolean> {
  const { useFiltered } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'useFiltered',
      message: 'Filtered data found. Analyze filtered data instead of full?',
      default: true,
    },
  ]);
  return useFiltered;
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
  const { impacts } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'impacts',
      message: 'Select impact levels to exclude:',
      choices: IMPACT_CHOICES,
    },
  ]);
  return impacts;
}

/**
 * Prompt for minimum impact level (single-select)
 */
export async function promptMinImpact(): Promise<PRImpact | null> {
  const { impact } = await inquirer.prompt([
    {
      type: 'list',
      name: 'impact',
      message: 'Select minimum impact level:',
      choices: [
        { name: 'No minimum (include all)', value: null },
        ...IMPACT_CHOICES,
      ],
    },
  ]);
  return impact;
}

/**
 * Prompt for minimum lines of code
 */
export async function promptMinLoc(): Promise<number | null> {
  const { useLoc } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'useLoc',
      message: 'Filter by minimum lines of code?',
      default: false,
    },
  ]);

  if (!useLoc) {
    return null;
  }

  const { loc } = await inquirer.prompt([
    {
      type: 'number',
      name: 'loc',
      message: 'Minimum lines of code (additions + deletions):',
      default: 100,
      validate: (input) => {
        if (typeof input !== 'number' || input < 0) {
          return 'Please enter a positive number';
        }
        return true;
      },
    },
  ]);
  return loc;
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
  const { statuses } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'statuses',
      message: 'Select ticket statuses to exclude:',
      choices: TICKET_STATUS_CHOICES,
    },
  ]);
  return statuses;
}

/**
 * Prompt for filter options (linked-only, merged-only)
 */
export async function promptFilterOptions(): Promise<{
  linkedOnly: boolean;
  mergedOnly: boolean;
  excludeStatus: string[];
}> {
  const { options } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'options',
      message: 'Additional filters:',
      choices: [
        { name: 'Only PRs linked to JIRA tickets', value: 'linkedOnly' },
        { name: 'Only merged PRs', value: 'mergedOnly' },
        { name: 'Exclude certain ticket statuses', value: 'excludeStatus' },
      ],
    },
  ]);

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
  const { filterType } = await inquirer.prompt([
    {
      type: 'list',
      name: 'filterType',
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
    },
  ]);

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
