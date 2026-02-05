# Manager Mode Fetch Integration - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable fetch commands (github, jira, all) to work in manager mode with report-specific data routing.

**Architecture:** Add manager mode detection to fetch command handlers. When in manager mode, prompt for report selection or use flags. Route data to per-report work-log directories using existing `getReportWorkLogDir()`. Zero changes to fetch utilities - they already accept `outputDir` parameter.

**Tech Stack:**
- Existing Commander.js patterns
- Inquirer prompts for report selection
- Existing workspace resolver functions
- Existing fetch utilities (github.utils.ts, jira.utils.ts)

---

## Task 1: Add Flags to Fetch GitHub Command

**Files:**
- Modify: `src/cli/commands/fetch/github/index.ts`

**Step 1: Add `--report` and `--all-reports` options**

Add after existing options:

```typescript
.option('--report <id>', 'Report ID (manager mode only)')
.option('--all-reports', 'Fetch for all reports (manager mode only)')
```

**Step 2: Commit**

```bash
git add src/cli/commands/fetch/github/index.ts
git commit -m "feat(fetch): add --report and --all-reports flags to github command"
```

---

## Task 2: Add Flags to Fetch Jira Command

**Files:**
- Modify: `src/cli/commands/fetch/jira/index.ts`

**Step 1: Add `--report` and `--all-reports` options**

Add after existing options:

```typescript
.option('--report <id>', 'Report ID (manager mode only)')
.option('--all-reports', 'Fetch for all reports (manager mode only)')
```

**Step 2: Commit**

```bash
git add src/cli/commands/fetch/jira/index.ts
git commit -m "feat(fetch): add --report and --all-reports flags to jira command"
```

---

## Task 3: Add Flags to Fetch All Command

**Files:**
- Modify: `src/cli/commands/fetch/all.ts`

**Step 1: Add `--report` and `--all-reports` options**

Add after existing options:

```typescript
.option('--report <id>', 'Report ID (manager mode only)')
.option('--all-reports', 'Fetch for all reports (manager mode only)')
```

**Step 2: Commit**

```bash
git add src/cli/commands/fetch/all.ts
git commit -m "feat(fetch): add --report and --all-reports flags to all command"
```

---

## Task 4: Create Fetch Manager Utils

**Files:**
- Create: `src/cli/commands/fetch/fetch-manager.utils.ts`

**Step 1: Write manager-specific fetch utilities**

```typescript
/**
 * Manager mode fetch utilities
 */

import { select } from '@inquirer/prompts';
import type { ManagerConfig, ReportConfig } from '@wc-types/manager';
import { generateReportId } from '@workspace/report-utils';
import { getActiveProfile } from '@workspace/global-config';
import { isManagerMode, getReportWorkLogDir } from '@workspace/resolver';
import { loadManagerConfig } from '@workspace/report-manager';
import chalk from 'chalk';

/**
 * Resolve report ID(s) for fetch operation
 *
 * @param options - Command options
 * @returns Array of report IDs to fetch
 */
export async function resolveReportIds(options: {
  report?: string;
  allReports?: boolean;
}): Promise<string[]> {
  const activeProfile = getActiveProfile();

  if (!isManagerMode(activeProfile)) {
    // Not in manager mode - return empty array
    return [];
  }

  const config = loadManagerConfig(activeProfile);

  if (config.reports.length === 0) {
    console.error(chalk.red('\n❌ Error: No reports configured in manager profile.'));
    console.log(chalk.gray('Add reports with "reports add"'));
    process.exit(1);
  }

  // If --all-reports flag
  if (options.allReports) {
    return config.reports.map(r => generateReportId(r.name));
  }

  // If --report <id> flag
  if (options.report) {
    const reportId = options.report;
    const report = config.reports.find(r => generateReportId(r.name) === reportId);

    if (!report) {
      console.error(chalk.red(`\n❌ Error: Report "${reportId}" not found`));
      process.exit(1);
    }

    return [reportId];
  }

  // Interactive prompt
  const choices = [
    ...config.reports.map(r => ({
      name: `${r.name} (${generateReportId(r.name)})`,
      value: generateReportId(r.name),
    })),
    { name: 'All reports', value: '_all' },
  ];

  const choice = await select({
    message: 'Which report(s)?',
    choices,
  });

  if (choice === '_all') {
    return config.reports.map(r => generateReportId(r.name));
  }

  return [choice];
}

/**
 * Get report details by ID
 *
 * @param reportId - Report ID
 * @returns Report config
 */
export function getReportById(reportId: string): ReportConfig {
  const activeProfile = getActiveProfile();
  const config = loadManagerConfig(activeProfile);

  const report = config.reports.find(r => generateReportId(r.name) === reportId);

  if (!report) {
    throw new Error(`Report "${reportId}" not found`);
  }

  return report;
}

/**
 * Resolve output directory for a report
 *
 * @param reportId - Report ID
 * @returns Absolute path to report's work-log directory
 */
export function resolveReportOutputDir(reportId: string): string {
  const activeProfile = getActiveProfile();
  return getReportWorkLogDir(activeProfile, reportId);
}
```

**Step 2: Commit**

```bash
git add src/cli/commands/fetch/fetch-manager.utils.ts
git commit -m "feat(fetch): add manager mode fetch utilities"
```

---

## Task 5: Integrate Manager Mode into Fetch GitHub

**Files:**
- Modify: `src/cli/commands/fetch/github/index.ts`

**Step 1: Import manager utils at top of file**

```typescript
import { getActiveProfile } from '@workspace/global-config';
import { isManagerMode } from '@workspace/resolver';
import { resolveReportIds, getReportById, resolveReportOutputDir } from '../fetch-manager.utils';
```

**Step 2: Add manager mode detection in action handler**

Replace the action handler body with:

```typescript
.action(async (options) => {
  try {
    const activeProfile = getActiveProfile();

    // Check for manager mode
    if (isManagerMode(activeProfile)) {
      await fetchGitHubManagerMode(options);
      return;
    }

    // IC mode - existing logic
    await fetchGitHubICMode(options);
  } catch (error) {
    console.error(
      chalk.red('\n❌ Error:'),
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
});
```

**Step 3: Extract IC mode logic into function**

Move existing action logic into:

```typescript
/**
 * Fetch GitHub PRs in IC mode
 */
async function fetchGitHubICMode(options: any): Promise<void> {
  // Existing fetch logic here (unchanged)
  // ... all the current code from action handler
}
```

**Step 4: Add manager mode fetch function**

```typescript
/**
 * Fetch GitHub PRs in manager mode
 */
async function fetchGitHubManagerMode(options: any): Promise<void> {
  const reportIds = await resolveReportIds(options);

  console.log(chalk.blue(`\n📥 Fetching GitHub PRs for ${reportIds.length} report(s)...\n`));

  for (let i = 0; i < reportIds.length; i++) {
    const reportId = reportIds[i];
    const report = getReportById(reportId);

    console.log(chalk.blue(`\nFetching data for ${report.name} (${i + 1}/${reportIds.length})...`));

    try {
      const outputDir = resolveReportOutputDir(reportId);

      // Use existing fetch logic with report's output directory
      const config = await loadConfig(options.config);
      const useCache = resolveCacheBehavior(options);

      const result = await fetchGitHubPRs({
        config,
        outputDir,
        verbose: options.verbose,
        useCache,
      });

      console.log(chalk.green(`✓ ${report.name} complete (${result.fetched} PRs fetched)\n`));
    } catch (error) {
      console.error(
        chalk.red(`✗ ${report.name} failed:`),
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  console.log(chalk.green('\n✓ All reports complete'));
}
```

**Step 5: Verify imports are correct**

Ensure these imports exist:

```typescript
import { loadConfig } from '@config/loader';
import { resolveCacheBehavior } from '../fetch.utils';
import { fetchGitHubPRs } from './github.utils';
```

**Step 6: Run type check**

Run: `pnpm type-check`
Expected: No errors

**Step 7: Commit**

```bash
git add src/cli/commands/fetch/github/index.ts
git commit -m "feat(fetch): add manager mode support to github command"
```

---

## Task 6: Integrate Manager Mode into Fetch Jira

**Files:**
- Modify: `src/cli/commands/fetch/jira/index.ts`

**Step 1: Import manager utils at top of file**

```typescript
import { getActiveProfile } from '@workspace/global-config';
import { isManagerMode } from '@workspace/resolver';
import { resolveReportIds, getReportById, resolveReportOutputDir } from '../fetch-manager.utils';
```

**Step 2: Add manager mode detection in action handler**

Replace the action handler body with:

```typescript
.action(async (options) => {
  try {
    const activeProfile = getActiveProfile();

    // Check for manager mode
    if (isManagerMode(activeProfile)) {
      await fetchJiraManagerMode(options);
      return;
    }

    // IC mode - existing logic
    await fetchJiraICMode(options);
  } catch (error) {
    console.error(
      chalk.red('\n❌ Error:'),
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
});
```

**Step 3: Extract IC mode logic into function**

Move existing action logic into:

```typescript
/**
 * Fetch Jira tickets in IC mode
 */
async function fetchJiraICMode(options: any): Promise<void> {
  // Existing fetch logic here (unchanged)
  // ... all the current code from action handler
}
```

**Step 4: Add manager mode fetch function**

```typescript
/**
 * Fetch Jira tickets in manager mode
 */
async function fetchJiraManagerMode(options: any): Promise<void> {
  const reportIds = await resolveReportIds(options);

  console.log(chalk.blue(`\n📥 Fetching Jira tickets for ${reportIds.length} report(s)...\n`));

  for (let i = 0; i < reportIds.length; i++) {
    const reportId = reportIds[i];
    const report = getReportById(reportId);

    console.log(chalk.blue(`\nFetching data for ${report.name} (${i + 1}/${reportIds.length})...`));

    try {
      const outputDir = resolveReportOutputDir(reportId);

      // Use existing fetch logic with report's output directory
      const config = await loadConfig(options.config);
      const useCache = resolveCacheBehavior(options);

      const result = await fetchJiraTickets({
        config,
        outputDir,
        verbose: options.verbose,
        useCache,
      });

      console.log(chalk.green(`✓ ${report.name} complete (${result.fetched} tickets fetched)\n`));
    } catch (error) {
      console.error(
        chalk.red(`✗ ${report.name} failed:`),
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  console.log(chalk.green('\n✓ All reports complete'));
}
```

**Step 5: Verify imports are correct**

Ensure these imports exist:

```typescript
import { loadConfig } from '@config/loader';
import { resolveCacheBehavior } from '../fetch.utils';
import { fetchJiraTickets } from './jira.utils';
```

**Step 6: Run type check**

Run: `pnpm type-check`
Expected: No errors

**Step 7: Commit**

```bash
git add src/cli/commands/fetch/jira/index.ts
git commit -m "feat(fetch): add manager mode support to jira command"
```

---

## Task 7: Integrate Manager Mode into Fetch All

**Files:**
- Modify: `src/cli/commands/fetch/all.ts`

**Step 1: Import manager utils at top of file**

```typescript
import { getActiveProfile } from '@workspace/global-config';
import { isManagerMode } from '@workspace/resolver';
import { resolveReportIds, getReportById, resolveReportOutputDir } from './fetch-manager.utils';
```

**Step 2: Add manager mode detection in action handler**

Replace the action handler body with:

```typescript
.action(async (options) => {
  try {
    const activeProfile = getActiveProfile();

    // Check for manager mode
    if (isManagerMode(activeProfile)) {
      await fetchAllManagerMode(options);
      return;
    }

    // IC mode - existing logic
    await fetchAllICMode(options);
  } catch (error) {
    console.error(
      chalk.red('\n❌ Error:'),
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
});
```

**Step 3: Extract IC mode logic into function**

Move existing action logic into:

```typescript
/**
 * Fetch all data in IC mode
 */
async function fetchAllICMode(options: any): Promise<void> {
  // Existing fetch logic here (unchanged)
  // ... all the current code from action handler
}
```

**Step 4: Add manager mode fetch function**

```typescript
/**
 * Fetch all data in manager mode
 */
async function fetchAllManagerMode(options: any): Promise<void> {
  const reportIds = await resolveReportIds(options);

  console.log(chalk.blue(`\n📥 Fetching all data for ${reportIds.length} report(s)...\n`));

  for (let i = 0; i < reportIds.length; i++) {
    const reportId = reportIds[i];
    const report = getReportById(reportId);

    console.log(chalk.blue(`\n=== Fetching data for ${report.name} (${i + 1}/${reportIds.length}) ===\n`));

    try {
      const outputDir = resolveReportOutputDir(reportId);

      // Use existing fetch logic with report's output directory
      const config = await loadConfig(options.config);
      const useCache = resolveCacheBehavior(options);

      // Fetch GitHub PRs
      console.log(chalk.blue('📥 Fetching GitHub PRs...'));
      const githubResult = await fetchGitHubPRs({
        config,
        outputDir,
        verbose: options.verbose,
        useCache,
      });

      // Fetch Jira tickets
      console.log(chalk.blue('📥 Fetching Jira tickets...'));
      const jiraResult = await fetchJiraTickets({
        config,
        outputDir,
        verbose: options.verbose,
        useCache,
      });

      // Link PRs and tickets
      if (!options.noLink) {
        console.log(chalk.blue('🔗 Linking PRs to tickets...'));
        await linkPRsToTickets(outputDir);
      }

      console.log(chalk.green(
        `✓ ${report.name} complete (${githubResult.fetched} PRs, ${jiraResult.fetched} tickets)\n`
      ));
    } catch (error) {
      console.error(
        chalk.red(`✗ ${report.name} failed:`),
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  console.log(chalk.green('\n✓ All reports complete'));
}
```

**Step 5: Verify imports are correct**

Ensure these imports exist:

```typescript
import { loadConfig } from '@config/loader';
import { resolveCacheBehavior } from './fetch.utils';
import { fetchGitHubPRs } from './github/github.utils';
import { fetchJiraTickets } from './jira/jira.utils';
import { linkPRsToTickets } from '@linker/index';
```

**Step 6: Run type check**

Run: `pnpm type-check`
Expected: No errors

**Step 7: Commit**

```bash
git add src/cli/commands/fetch/all.ts
git commit -m "feat(fetch): add manager mode support to all command"
```

---

## Task 8: Test Manager Mode Fetch (Manual)

**Files:**
- None (manual testing)

**Step 1: Run linter**

Run: `pnpm lint`
Expected: No errors

**Step 2: Run type check**

Run: `pnpm type-check`
Expected: No errors

**Step 3: Run all tests**

Run: `pnpm test`
Expected: All tests pass

**Step 4: Commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address linting/type errors in fetch manager mode"
```

---

## Summary

This plan implements manager mode support for fetch commands:

- ✅ Added `--report <id>` and `--all-reports` flags to all fetch commands
- ✅ Created manager-specific utilities for report resolution
- ✅ Integrated manager mode detection into fetch handlers
- ✅ Series execution with progress reporting per report
- ✅ Graceful per-report failure handling
- ✅ Zero changes to fetch utilities (path-agnostic design)

**Testing Strategy:**
- Type checking ensures integration correctness
- Linting ensures code quality
- Manual testing for interactive flows
- Regression: IC mode unchanged (uses different code path)

**Note:**
- Config loading uses existing manager config
- Report selection reuses existing patterns from reports commands
- Per-report failures logged independently
- All existing fetch utilities work unchanged
