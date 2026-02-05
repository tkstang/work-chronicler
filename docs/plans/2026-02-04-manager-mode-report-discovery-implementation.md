# Phase 4: Manager Mode & Report Discovery - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add manager mode to work-chronicler with per-report workspaces, repo discovery, and team-level analysis aggregations.

**Architecture:** Convention-based (profile named "manager" triggers manager mode). Each report mirrors IC profile structure (`profiles/manager/reports/alice-smith/`). Reuse all existing fetch/analysis logic with path resolution. Single-org constraint for Phase 4.

**Tech Stack:**
- Existing Commander.js patterns
- Existing `discoverRepos()` from init utils
- Kebab-case for report IDs
- Inquirer prompts for report management

---

## Task 1: Add Manager Types

**Files:**
- Create: `src/core/types/manager.ts`

**Step 1: Create manager types file**

```typescript
/**
 * Manager mode types
 */

/**
 * Report configuration
 */
export interface ReportConfig {
  /** Display name (e.g., "Alice Smith") */
  name: string;
  /** GitHub username */
  github: string;
  /** Email for commit/Jira attribution */
  email: string;
  /** Repos to fetch (no org prefix) */
  repos: string[];
  /** Jira projects to fetch */
  jiraProjects: string[];
}

/**
 * Manager profile configuration
 */
export interface ManagerConfig {
  mode: 'manager';
  github: {
    token: string;
    org: string; // Single org (Phase 4 constraint)
  };
  jira?: {
    host: string;
    email: string;
    token: string;
  };
  reports: ReportConfig[];
}

/**
 * Report metadata for display
 */
export interface ReportMetadata {
  id: string; // Kebab-case directory name
  name: string; // Display name
  github: string;
  email: string;
  repoCount: number;
  jiraProjectCount: number;
  lastFetchTime?: string;
}
```

**Step 2: Commit**

```bash
git add src/core/types/manager.ts
git commit -m "feat(manager): add manager mode types"
```

---

## Task 2: Add Report ID Utilities

**Files:**
- Create: `src/core/workspace/report-utils.ts`
- Create test: `tests/core/workspace/report-utils.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import {
  generateReportId,
  parseReportId,
  validateReportName,
} from '../../../src/core/workspace/report-utils';

describe('report-utils', () => {
  describe('generateReportId', () => {
    it('converts name to kebab-case', () => {
      expect(generateReportId('Alice Smith')).toBe('alice-smith');
    });

    it('handles multiple spaces', () => {
      expect(generateReportId('Bob   Jones')).toBe('bob-jones');
    });

    it('removes special characters', () => {
      expect(generateReportId("Carol O'Brien")).toBe('carol-obrien');
    });

    it('handles names with hyphens', () => {
      expect(generateReportId('Mary-Jane Watson')).toBe('mary-jane-watson');
    });
  });

  describe('validateReportName', () => {
    it('accepts valid names', () => {
      expect(validateReportName('Alice Smith')).toBe(true);
      expect(validateReportName('Bob Jones-Williams')).toBe(true);
    });

    it('rejects empty names', () => {
      expect(validateReportName('')).toBe(false);
      expect(validateReportName('   ')).toBe(false);
    });

    it('rejects names with only special characters', () => {
      expect(validateReportName('!!!')).toBe(false);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: Tests fail

**Step 3: Write minimal implementation**

```typescript
/**
 * Report utility functions
 */

/**
 * Generate report ID from name (kebab-case)
 *
 * @param name - Report display name (e.g., "Alice Smith")
 * @returns Kebab-case ID (e.g., "alice-smith")
 */
export function generateReportId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars except spaces and hyphens
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Parse report ID back to possible name (for display fallback)
 *
 * @param id - Report ID (e.g., "alice-smith")
 * @returns Capitalized name (e.g., "Alice Smith")
 */
export function parseReportId(id: string): string {
  return id
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Validate report name
 *
 * @param name - Report name to validate
 * @returns True if valid
 */
export function validateReportName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;

  // Must have at least one letter or number
  return /[a-zA-Z0-9]/.test(trimmed);
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/core/workspace/report-utils.ts tests/core/workspace/report-utils.test.ts
git commit -m "feat(manager): add report ID utilities with tests"
```

---

## Task 3: Extend Workspace Resolver for Manager Mode

**Files:**
- Modify: `src/core/workspace/resolver.ts`
- Modify test: `tests/core/workspace/resolver.test.ts`

**Step 1: Add test for manager mode path resolution**

```typescript
describe('resolveWorkLogPath - manager mode', () => {
  it('resolves to report subdirectory', () => {
    const path = resolveWorkLogPath('manager', 'alice-smith');
    expect(path).toContain('profiles/manager/reports/alice-smith/work-log');
  });

  it('throws error if report not provided in manager mode', () => {
    expect(() => resolveWorkLogPath('manager')).toThrow('Report ID required');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: Test fails

**Step 3: Update resolver to handle manager mode**

Add to `resolver.ts`:

```typescript
/**
 * Resolve work-log path for a profile
 *
 * @param profileName - Profile name
 * @param reportId - Report ID (required for manager mode)
 * @returns Absolute path to work-log directory
 */
export function resolveWorkLogPath(
  profileName: string,
  reportId?: string,
): string {
  const profilePath = resolveProfilePath(profileName);

  if (profileName === 'manager') {
    if (!reportId) {
      throw new Error('Report ID required for manager mode paths');
    }
    return path.join(profilePath, 'reports', reportId, 'work-log');
  }

  return path.join(profilePath, 'work-log');
}

/**
 * Resolve analysis path for a profile
 *
 * @param profileName - Profile name
 * @param reportId - Report ID (optional, for manager mode)
 * @returns Absolute path to analysis directory
 */
export function resolveAnalysisPath(
  profileName: string,
  reportId?: string,
): string {
  const profilePath = resolveProfilePath(profileName);

  if (profileName === 'manager' && reportId) {
    return path.join(profilePath, 'reports', reportId, 'analysis');
  }

  return path.join(profilePath, 'analysis');
}

/**
 * Resolve outputs path for a profile
 *
 * @param profileName - Profile name
 * @param reportId - Report ID (optional, for manager mode)
 * @returns Absolute path to outputs directory
 */
export function resolveOutputsPath(
  profileName: string,
  reportId?: string,
): string {
  const profilePath = resolveProfilePath(profileName);

  if (profileName === 'manager' && reportId) {
    return path.join(profilePath, 'reports', reportId, 'outputs');
  }

  return path.join(profilePath, 'outputs');
}

/**
 * Check if profile is in manager mode
 *
 * @param profileName - Profile name
 * @returns True if manager mode
 */
export function isManagerMode(profileName: string): boolean {
  return profileName === 'manager';
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/core/workspace/resolver.ts tests/core/workspace/resolver.test.ts
git commit -m "feat(manager): add manager mode path resolution"
```

---

## Task 4: Create Reports Management Module

**Files:**
- Create: `src/core/workspace/report-manager.ts`

**Step 1: Write report manager implementation**

```typescript
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ReportConfig, ReportMetadata, ManagerConfig } from '../types/manager';
import { generateReportId, validateReportName } from './report-utils';
import { resolveProfilePath } from './resolver';

/**
 * Load manager config from profile
 *
 * @param profilePath - Absolute path to manager profile
 * @returns Manager config
 */
export async function loadManagerConfig(
  profilePath: string,
): Promise<ManagerConfig> {
  const configPath = path.join(profilePath, 'config.json');
  const content = await fs.readFile(configPath, 'utf-8');
  const config = JSON.parse(content) as ManagerConfig;

  if (config.mode !== 'manager') {
    throw new Error('Profile is not in manager mode');
  }

  return config;
}

/**
 * Save manager config to profile
 *
 * @param profilePath - Absolute path to manager profile
 * @param config - Manager config to save
 */
export async function saveManagerConfig(
  profilePath: string,
  config: ManagerConfig,
): Promise<void> {
  const configPath = path.join(profilePath, 'config.json');
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * Get report by ID
 *
 * @param config - Manager config
 * @param reportId - Report ID
 * @returns Report config or undefined
 */
export function getReport(
  config: ManagerConfig,
  reportId: string,
): ReportConfig | undefined {
  return config.reports.find((r) => generateReportId(r.name) === reportId);
}

/**
 * Check if report ID exists
 *
 * @param config - Manager config
 * @param reportId - Report ID to check
 * @returns True if exists
 */
export function reportExists(
  config: ManagerConfig,
  reportId: string,
): boolean {
  return config.reports.some((r) => generateReportId(r.name) === reportId);
}

/**
 * Add report to config
 *
 * @param profilePath - Manager profile path
 * @param report - Report config to add
 * @throws Error if report with same ID already exists
 */
export async function addReport(
  profilePath: string,
  report: ReportConfig,
): Promise<void> {
  if (!validateReportName(report.name)) {
    throw new Error('Invalid report name');
  }

  const config = await loadManagerConfig(profilePath);
  const reportId = generateReportId(report.name);

  if (reportExists(config, reportId)) {
    throw new Error(`Report "${report.name}" (${reportId}) already exists`);
  }

  config.reports.push(report);
  await saveManagerConfig(profilePath, config);

  // Create report directory structure
  const reportPath = path.join(profilePath, 'reports', reportId);
  await fs.mkdir(path.join(reportPath, 'work-log'), { recursive: true });
  await fs.mkdir(path.join(reportPath, 'analysis'), { recursive: true });
  await fs.mkdir(path.join(reportPath, 'outputs'), { recursive: true });
}

/**
 * Remove report from config
 *
 * @param profilePath - Manager profile path
 * @param reportId - Report ID to remove
 * @param deleteData - Whether to delete report data directory
 */
export async function removeReport(
  profilePath: string,
  reportId: string,
  deleteData: boolean,
): Promise<void> {
  const config = await loadManagerConfig(profilePath);

  const index = config.reports.findIndex(
    (r) => generateReportId(r.name) === reportId
  );

  if (index === -1) {
    throw new Error(`Report "${reportId}" not found`);
  }

  config.reports.splice(index, 1);
  await saveManagerConfig(profilePath, config);

  if (deleteData) {
    const reportPath = path.join(profilePath, 'reports', reportId);
    await fs.rm(reportPath, { recursive: true, force: true });
  }
}

/**
 * Update report repos
 *
 * @param profilePath - Manager profile path
 * @param reportId - Report ID
 * @param options - Update options
 */
export async function updateReport(
  profilePath: string,
  reportId: string,
  options: {
    addRepo?: string;
    removeRepo?: string;
    addJiraProject?: string;
    removeJiraProject?: string;
  },
): Promise<void> {
  const config = await loadManagerConfig(profilePath);
  const report = getReport(config, reportId);

  if (!report) {
    throw new Error(`Report "${reportId}" not found`);
  }

  if (options.addRepo) {
    if (!report.repos.includes(options.addRepo)) {
      report.repos.push(options.addRepo);
    }
  }

  if (options.removeRepo) {
    report.repos = report.repos.filter((r) => r !== options.removeRepo);
  }

  if (options.addJiraProject) {
    if (!report.jiraProjects.includes(options.addJiraProject)) {
      report.jiraProjects.push(options.addJiraProject);
    }
  }

  if (options.removeJiraProject) {
    report.jiraProjects = report.jiraProjects.filter(
      (p) => p !== options.removeJiraProject
    );
  }

  await saveManagerConfig(profilePath, config);
}

/**
 * List all reports with metadata
 *
 * @param profilePath - Manager profile path
 * @returns Array of report metadata
 */
export async function listReports(
  profilePath: string,
): Promise<ReportMetadata[]> {
  const config = await loadManagerConfig(profilePath);

  return config.reports.map((report) => {
    const reportId = generateReportId(report.name);

    return {
      id: reportId,
      name: report.name,
      github: report.github,
      email: report.email,
      repoCount: report.repos.length,
      jiraProjectCount: report.jiraProjects.length,
      lastFetchTime: undefined, // TODO: Read from report metadata file
    };
  });
}
```

**Step 2: Commit**

```bash
git add src/core/workspace/report-manager.ts
git commit -m "feat(manager): add report management module"
```

---

## Task 5: Create `reports add` Command

**Files:**
- Create: `src/cli/commands/reports/index.ts`
- Create: `src/cli/commands/reports/add.ts`
- Modify: `src/cli/index.ts` (register command)

**Step 1: Write `reports add` command**

```typescript
import { Command } from 'commander';
import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { discoverRepos } from '@commands/init/init.utils';
import { addReport } from '@core/workspace/report-manager';
import { resolveProfilePath, resolveActiveProfile } from '@core/workspace/resolver';
import { isManagerMode } from '@core/workspace/resolver';
import type { ReportConfig } from '@core/types/manager';

/**
 * reports add command
 */
export const reportsAddCommand = new Command('add')
  .description('Add a new report to manager profile')
  .argument('[name]', 'Report name (e.g., "Alice Smith")')
  .option('--github <username>', 'GitHub username')
  .option('--email <email>', 'Email address')
  .option('--repos <repos>', 'Comma-separated list of repos')
  .option('--jira-projects <projects>', 'Comma-separated Jira projects')
  .action(async (name, options) => {
    try {
      const activeProfile = await resolveActiveProfile();

      if (!isManagerMode(activeProfile)) {
        console.error(chalk.red('\n❌ Error: "reports" commands only available in manager mode.'));
        console.log(chalk.gray('Current profile is in IC mode.'));
        console.log(chalk.gray('\nHint: Create a manager profile with "init --mode manager"'));
        process.exit(1);
      }

      const profilePath = resolveProfilePath(activeProfile);

      // Load config to get org and token
      // TODO: Use proper config loader
      const config: any = {}; // Placeholder

      let report: ReportConfig;

      if (options.github && options.email) {
        // Non-interactive mode
        report = {
          name: name || options.github,
          github: options.github,
          email: options.email,
          repos: options.repos ? options.repos.split(',').map((r: string) => r.trim()) : [],
          jiraProjects: options.jiraProjects
            ? options.jiraProjects.split(',').map((p: string) => p.trim())
            : [],
        };
      } else {
        // Interactive mode
        report = await promptForReport(config);
      }

      await addReport(profilePath, report);

      console.log(chalk.green(`\n✓ ${report.name} added to manager profile`));
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Prompt user for report details
 */
async function promptForReport(config: any): Promise<ReportConfig> {
  console.log(chalk.blue('\nAdd new report:\n'));

  const name = await input({
    message: 'Name:',
    validate: (value) => {
      if (!value.trim()) return 'Name is required';
      return true;
    },
  });

  const github = await input({
    message: 'GitHub username:',
    validate: (value) => {
      if (!value.trim()) return 'GitHub username is required';
      return true;
    },
  });

  const email = await input({
    message: 'Email:',
    validate: (value) => {
      if (!value.trim()) return 'Email is required';
      if (!value.includes('@')) return 'Invalid email format';
      return true;
    },
  });

  // Repos
  const reposChoice = await select({
    message: 'Repos:',
    choices: [
      { name: 'Auto-discover', value: 'discover' },
      { name: 'Specify manually', value: 'manual' },
      { name: 'Skip for now', value: 'skip' },
    ],
  });

  let repos: string[] = [];

  if (reposChoice === 'discover') {
    console.log(chalk.blue(`\n🔍 Discovering repos for ${github}...\n`));

    const token = config.github?.token || process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error('GitHub token not found in config');
    }

    const org = config.github?.org;
    if (!org) {
      throw new Error('GitHub org not found in config');
    }

    // Use existing discovery logic
    const result = await discoverRepos(
      token,
      org,
      github,
      50, // prCount
      '6months', // since (6 months ago)
      null, // until
    );

    repos = result.repos;

    if (repos.length === 0) {
      console.log(chalk.yellow('No repos found. You can add them later with "reports update".'));
    }
  } else if (reposChoice === 'manual') {
    const reposInput = await input({
      message: 'Repos (comma-separated):',
    });
    repos = reposInput.split(',').map((r) => r.trim()).filter(Boolean);
  }

  // Jira projects
  const jiraInput = await input({
    message: 'Jira projects (comma-separated, or leave blank):',
  });

  const jiraProjects = jiraInput.split(',').map((p) => p.trim()).filter(Boolean);

  return {
    name,
    github,
    email,
    repos,
    jiraProjects,
  };
}
```

**Step 2: Create parent command**

```typescript
// src/cli/commands/reports/index.ts
import { Command } from 'commander';
import { reportsAddCommand } from './add';

/**
 * reports parent command
 */
export const reportsCommand = new Command('reports')
  .description('Manage reports (manager mode only)');

reportsCommand.addCommand(reportsAddCommand);
```

**Step 3: Register in main CLI**

Add to `src/cli/index.ts`:

```typescript
import { reportsCommand } from '@commands/reports/index';

program.addCommand(reportsCommand);
```

**Step 4: Commit**

```bash
git add src/cli/commands/reports/index.ts src/cli/commands/reports/add.ts src/cli/index.ts
git commit -m "feat(manager): add reports add command"
```

---

## Task 6: Create `reports list` Command

**Files:**
- Create: `src/cli/commands/reports/list.ts`
- Modify: `src/cli/commands/reports/index.ts`

**Step 1: Write `reports list` command**

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import { listReports } from '@core/workspace/report-manager';
import { resolveProfilePath, resolveActiveProfile, isManagerMode } from '@core/workspace/resolver';

/**
 * reports list command
 */
export const reportsListCommand = new Command('list')
  .description('List all reports')
  .action(async () => {
    try {
      const activeProfile = await resolveActiveProfile();

      if (!isManagerMode(activeProfile)) {
        console.error(chalk.red('\n❌ Error: "reports" commands only available in manager mode.'));
        process.exit(1);
      }

      const profilePath = resolveProfilePath(activeProfile);

      // TODO: Load config to get org
      const org = 'myorg'; // Placeholder

      const reports = await listReports(profilePath);

      console.log(chalk.blue(`\nManager profile: ${activeProfile}`));
      console.log(chalk.gray(`Org: ${org}\n`));

      if (reports.length === 0) {
        console.log(chalk.yellow('No reports configured.'));
        console.log(chalk.gray('\nAdd reports with "reports add"'));
        return;
      }

      console.log(chalk.bold(`Reports (${reports.length}):`));

      reports.forEach((report, index) => {
        console.log(`\n  ${index + 1}. ${chalk.bold(report.name)} (${chalk.gray(report.id)})`);
        console.log(`     GitHub: ${report.github} | Email: ${report.email}`);
        console.log(`     Repos: ${report.repoCount} | Jira Projects: ${report.jiraProjectCount}`);

        if (report.lastFetchTime) {
          const date = new Date(report.lastFetchTime);
          console.log(`     Last fetch: ${date.toLocaleString()}`);
        }
      });

      console.log('');
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
```

**Step 2: Register in parent command**

Add to `src/cli/commands/reports/index.ts`:

```typescript
import { reportsListCommand } from './list';

reportsCommand.addCommand(reportsListCommand);
```

**Step 3: Commit**

```bash
git add src/cli/commands/reports/list.ts src/cli/commands/reports/index.ts
git commit -m "feat(manager): add reports list command"
```

---

## Task 7: Create `reports remove` Command

**Files:**
- Create: `src/cli/commands/reports/remove.ts`
- Modify: `src/cli/commands/reports/index.ts`

**Step 1: Write `reports remove` command**

```typescript
import { Command } from 'commander';
import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { removeReport } from '@core/workspace/report-manager';
import { resolveProfilePath, resolveActiveProfile, isManagerMode } from '@core/workspace/resolver';

/**
 * reports remove command
 */
export const reportsRemoveCommand = new Command('remove')
  .description('Remove a report')
  .argument('<id>', 'Report ID (e.g., "alice-smith")')
  .option('--keep-data', 'Keep data (remove from config only)')
  .option('--delete-data', 'Delete data (remove config + delete all work-log/analysis/outputs)')
  .action(async (id, options) => {
    try {
      const activeProfile = await resolveActiveProfile();

      if (!isManagerMode(activeProfile)) {
        console.error(chalk.red('\n❌ Error: "reports" commands only available in manager mode.'));
        process.exit(1);
      }

      const profilePath = resolveProfilePath(activeProfile);

      let deleteData = false;

      if (options.deleteData) {
        deleteData = true;
      } else if (options.keepData) {
        deleteData = false;
      } else {
        // Interactive prompt
        const choice = await select({
          message: `What should we do with ${id}'s data?`,
          choices: [
            { name: 'Keep data (remove from config only)', value: 'keep' },
            { name: 'Delete data (remove config + delete all work-log/analysis/outputs)', value: 'delete' },
          ],
        });

        deleteData = choice === 'delete';
      }

      if (deleteData) {
        console.log(chalk.yellow('\n⚠️  Deleting data is permanent and cannot be undone.\n'));
      }

      await removeReport(profilePath, id, deleteData);

      if (deleteData) {
        console.log(chalk.green(`\n✓ ${id} removed and data deleted`));
      } else {
        console.log(chalk.green(`\n✓ ${id} removed from config (data preserved)`));
      }
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
```

**Step 2: Register in parent command**

Add to `src/cli/commands/reports/index.ts`:

```typescript
import { reportsRemoveCommand } from './remove';

reportsCommand.addCommand(reportsRemoveCommand);
```

**Step 3: Commit**

```bash
git add src/cli/commands/reports/remove.ts src/cli/commands/reports/index.ts
git commit -m "feat(manager): add reports remove command"
```

---

## Task 8: Create `reports update` Command

**Files:**
- Create: `src/cli/commands/reports/update.ts`
- Modify: `src/cli/commands/reports/index.ts`

**Step 1: Write `reports update` command**

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import { updateReport } from '@core/workspace/report-manager';
import { resolveProfilePath, resolveActiveProfile, isManagerMode } from '@core/workspace/resolver';

/**
 * reports update command
 */
export const reportsUpdateCommand = new Command('update')
  .description('Update a report')
  .argument('<id>', 'Report ID (e.g., "alice-smith")')
  .option('--add-repo <repo>', 'Add a repo')
  .option('--remove-repo <repo>', 'Remove a repo')
  .option('--add-jira-project <project>', 'Add a Jira project')
  .option('--remove-jira-project <project>', 'Remove a Jira project')
  .action(async (id, options) => {
    try {
      const activeProfile = await resolveActiveProfile();

      if (!isManagerMode(activeProfile)) {
        console.error(chalk.red('\n❌ Error: "reports" commands only available in manager mode.'));
        process.exit(1);
      }

      const profilePath = resolveProfilePath(activeProfile);

      if (!options.addRepo && !options.removeRepo && !options.addJiraProject && !options.removeJiraProject) {
        console.error(chalk.red('\n❌ Error: No update options provided.'));
        console.log(chalk.gray('Use --add-repo, --remove-repo, --add-jira-project, or --remove-jira-project'));
        process.exit(1);
      }

      await updateReport(profilePath, id, {
        addRepo: options.addRepo,
        removeRepo: options.removeRepo,
        addJiraProject: options.addJiraProject,
        removeJiraProject: options.removeJiraProject,
      });

      console.log(chalk.green(`\n✓ ${id} updated`));
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
```

**Step 2: Register in parent command**

Add to `src/cli/commands/reports/index.ts`:

```typescript
import { reportsUpdateCommand } from './update';

reportsCommand.addCommand(reportsUpdateCommand);
```

**Step 3: Commit**

```bash
git add src/cli/commands/reports/update.ts src/cli/commands/reports/index.ts
git commit -m "feat(manager): add reports update command"
```

---

## Task 9: Add Manager Init Flow

**Files:**
- Modify: `src/cli/commands/init/index.ts`
- Modify: `src/cli/commands/init/init.prompts.ts`

**Step 1: Add `--mode manager` option to init**

Add option to init command:

```typescript
initCommand
  .option('--mode <mode>', 'Profile mode: ic or manager', 'ic')
```

**Step 2: Add manager init flow**

In init command action, detect mode and branch:

```typescript
if (options.mode === 'manager') {
  await initManagerProfile();
} else {
  await initICProfile();
}
```

**Step 3: Implement manager init**

```typescript
async function initManagerProfile(): Promise<void> {
  console.log(chalk.blue('\nCreating manager profile...\n'));

  // Create profile directory
  const profilePath = resolveProfilePath('manager');
  await fs.mkdir(profilePath, { recursive: true });

  // Create initial config
  const config: ManagerConfig = {
    mode: 'manager',
    github: {
      token: '', // TODO: Prompt for token
      org: '', // TODO: Prompt for org
    },
    reports: [],
  };

  await fs.writeFile(
    path.join(profilePath, 'config.json'),
    JSON.stringify(config, null, 2),
    'utf-8'
  );

  console.log(chalk.green('✓ Profile "manager" created\n'));

  // Ask to add reports
  const addReportsNow = await confirm({
    message: 'Would you like to add reports now?',
    default: true,
  });

  if (addReportsNow) {
    // Use reports add interactive flow
    console.log(chalk.blue('\nLet\'s add your first report.\n'));

    let addAnother = true;
    while (addAnother) {
      const report = await promptForReport(config);
      await addReport(profilePath, report);
      console.log(chalk.green(`✓ ${report.name} added\n`));

      addAnother = await confirm({
        message: 'Add another report?',
        default: false,
      });
    }
  } else {
    console.log(chalk.gray('\n✓ Manager profile ready. Use "reports add" to add reports later.'));
  }
}
```

**Step 4: Commit**

```bash
git add src/cli/commands/init/index.ts src/cli/commands/init/init.prompts.ts
git commit -m "feat(manager): add manager init flow"
```

---

## Task 10: Add Manager Mode Detection to Fetch Commands

**Files:**
- Modify: `src/cli/commands/fetch/github/index.ts`
- Modify: `src/cli/commands/fetch/jira/index.ts`

**Step 1: Add report selection prompt to fetch github**

At start of action:

```typescript
const activeProfile = await resolveActiveProfile();

if (isManagerMode(activeProfile)) {
  if (!options.report && !options.allReports) {
    // Prompt for report selection
    const choice = await select({
      message: 'Which report(s)?',
      choices: [
        ...reports.map((r) => ({ name: `${r.name} (${r.id})`, value: r.id })),
        { name: 'All reports', value: '_all' },
      ],
    });

    if (choice === '_all') {
      options.allReports = true;
    } else {
      options.report = choice;
    }
  }

  // Fetch for selected reports
  if (options.allReports) {
    await fetchAllReports(profilePath);
  } else if (options.report) {
    await fetchSingleReport(profilePath, options.report);
  }
} else {
  // IC mode - existing logic
  await fetchIC(profilePath);
}
```

**Step 2: Implement series fetching**

```typescript
async function fetchAllReports(profilePath: string): Promise<void> {
  const config = await loadManagerConfig(profilePath);

  for (let i = 0; i < config.reports.length; i++) {
    const report = config.reports[i];
    const reportId = generateReportId(report.name);

    console.log(chalk.blue(`\nFetching data for ${report.name} (${i + 1}/${config.reports.length})...\n`));

    try {
      await fetchSingleReport(profilePath, reportId);
      console.log(chalk.green(`✓ ${report.name} complete\n`));
    } catch (error) {
      console.error(chalk.red(`✗ ${report.name} failed:`), error instanceof Error ? error.message : String(error));
    }
  }
}
```

**Step 3: Implement single report fetch**

```typescript
async function fetchSingleReport(profilePath: string, reportId: string): Promise<void> {
  // Resolve work-log path for this report
  const workLogPath = resolveWorkLogPath('manager', reportId);

  // Use existing fetch logic with report's work-log path
  // ... (reuse IC fetch logic)
}
```

**Step 4: Commit**

```bash
git add src/cli/commands/fetch/github/index.ts src/cli/commands/fetch/jira/index.ts
git commit -m "feat(manager): add manager mode detection to fetch commands"
```

---

## Task 11: Create Team Analysis Module

**Files:**
- Create: `src/cli/analyzer/team.ts`

**Step 1: Write team aggregation functions**

```typescript
/**
 * Team-level analysis aggregations
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { resolveAnalysisPath } from '@core/workspace/resolver';
import type { Project } from '@core/types/project';

/**
 * Aggregate projects across all reports
 *
 * @param profilePath - Manager profile path
 * @param reportIds - Array of report IDs
 * @returns Aggregated team projects
 */
export async function aggregateTeamProjects(
  profilePath: string,
  reportIds: string[],
): Promise<Project[]> {
  const allProjects: Project[] = [];
  const projectMap = new Map<string, Project>();

  for (const reportId of reportIds) {
    const analysisPath = resolveAnalysisPath('manager', reportId);
    const projectsFile = path.join(analysisPath, 'projects.json');

    try {
      const content = await fs.readFile(projectsFile, 'utf-8');
      const projects: Project[] = JSON.parse(content);

      for (const project of projects) {
        // Use project name as key (could be more sophisticated)
        const key = project.name.toLowerCase();

        if (projectMap.has(key)) {
          // Merge contributors
          const existing = projectMap.get(key)!;
          existing.contributors = [
            ...new Set([...existing.contributors, ...project.contributors]),
          ];
        } else {
          projectMap.set(key, { ...project });
        }
      }
    } catch {
      // Report has no projects yet - skip
    }
  }

  return Array.from(projectMap.values());
}

/**
 * Generate contributor matrix (who worked on what)
 *
 * @param profilePath - Manager profile path
 * @param reportIds - Array of report IDs
 * @returns Contributor matrix
 */
export async function generateContributorMatrix(
  profilePath: string,
  reportIds: string[],
): Promise<Record<string, string[]>> {
  const matrix: Record<string, string[]> = {};

  const teamProjects = await aggregateTeamProjects(profilePath, reportIds);

  for (const project of teamProjects) {
    for (const contributor of project.contributors) {
      if (!matrix[contributor]) {
        matrix[contributor] = [];
      }
      matrix[contributor].push(project.name);
    }
  }

  return matrix;
}

/**
 * Aggregate team timeline
 *
 * @param profilePath - Manager profile path
 * @param reportIds - Array of report IDs
 * @returns Team timeline
 */
export async function aggregateTeamTimeline(
  profilePath: string,
  reportIds: string[],
): Promise<any> {
  // TODO: Implement timeline aggregation
  // Combine timelines from all reports, sorted by date
  return {};
}

/**
 * Write team analysis to manager profile
 *
 * @param profilePath - Manager profile path
 * @param reportIds - Array of report IDs
 */
export async function writeTeamAnalysis(
  profilePath: string,
  reportIds: string[],
): Promise<void> {
  const analysisPath = resolveAnalysisPath('manager');
  await fs.mkdir(analysisPath, { recursive: true });

  // Team projects
  const teamProjects = await aggregateTeamProjects(profilePath, reportIds);
  await fs.writeFile(
    path.join(analysisPath, 'team-projects.json'),
    JSON.stringify(teamProjects, null, 2),
    'utf-8'
  );

  // Contributor matrix
  const contributorMatrix = await generateContributorMatrix(profilePath, reportIds);
  await fs.writeFile(
    path.join(analysisPath, 'contributor-matrix.json'),
    JSON.stringify(contributorMatrix, null, 2),
    'utf-8'
  );

  // Team timeline
  const teamTimeline = await aggregateTeamTimeline(profilePath, reportIds);
  await fs.writeFile(
    path.join(analysisPath, 'team-timeline.json'),
    JSON.stringify(teamTimeline, null, 2),
    'utf-8'
  );
}
```

**Step 2: Commit**

```bash
git add src/cli/analyzer/team.ts
git commit -m "feat(manager): add team analysis aggregations"
```

---

## Task 12: Create `analyze team` Command

**Files:**
- Modify: `src/cli/commands/analyze.ts`

**Step 1: Add `analyze team` subcommand**

Add to analyze command:

```typescript
analyzeCommand
  .command('team')
  .description('Generate team-level analysis (manager mode only)')
  .action(async () => {
    try {
      const activeProfile = await resolveActiveProfile();

      if (!isManagerMode(activeProfile)) {
        console.error(chalk.red('\n❌ Error: "analyze team" only available in manager mode.'));
        process.exit(1);
      }

      const profilePath = resolveProfilePath(activeProfile);
      const config = await loadManagerConfig(profilePath);

      const reportIds = config.reports.map((r) => generateReportId(r.name));

      console.log(chalk.blue(`\n📊 Generating team analysis for ${reportIds.length} reports...\n`));

      await writeTeamAnalysis(profilePath, reportIds);

      console.log(chalk.green('✓ Team analysis complete'));
      console.log(chalk.gray(`\nOutput: ${resolveAnalysisPath('manager')}`));
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
```

**Step 2: Commit**

```bash
git add src/cli/commands/analyze.ts
git commit -m "feat(manager): add analyze team command"
```

---

## Task 13: Add Manager Mode to `analyze reports`

**Files:**
- Modify: `src/cli/commands/analyze.ts`

**Step 1: Add report-specific analysis**

Add to analyze command:

```typescript
analyzeCommand
  .command('reports <id>')
  .description('Analyze a specific report (manager mode)')
  .action(async (id) => {
    try {
      const activeProfile = await resolveActiveProfile();

      if (!isManagerMode(activeProfile)) {
        console.error(chalk.red('\n❌ Error: "analyze reports" only available in manager mode.'));
        process.exit(1);
      }

      const profilePath = resolveProfilePath(activeProfile);

      // Run IC-style analysis on report's work-log
      const workLogPath = resolveWorkLogPath('manager', id);
      const analysisPath = resolveAnalysisPath('manager', id);

      console.log(chalk.blue(`\n📊 Analyzing ${id}...\n`));

      // Reuse existing IC analysis logic with report paths
      await runICAnalysis(workLogPath, analysisPath);

      console.log(chalk.green(`✓ ${id} analysis complete`));
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });
```

**Step 2: Commit**

```bash
git add src/cli/commands/analyze.ts
git commit -m "feat(manager): add analyze reports command"
```

---

## Task 14: Documentation

**Files:**
- Create: `docs/manager-mode.md`
- Modify: `README.md`

**Step 1: Write manager mode documentation**

Create comprehensive guide covering:
- Manager profile setup
- Adding/managing reports
- Fetching data for reports
- Generating analysis
- Team-level aggregations

**Step 2: Update README**

Add manager mode to features list and usage examples.

**Step 3: Commit**

```bash
git add docs/manager-mode.md README.md
git commit -m "docs: add manager mode documentation"
```

---

## Summary

This plan implements Phase 4 (Manager Mode & Report Discovery) with:

- ✅ Convention-based manager profile (name: "manager")
- ✅ Report management commands (add, list, remove, update)
- ✅ Path resolution for manager/report structure
- ✅ Code reuse (IC logic works with report paths)
- ✅ Series fetching for all reports
- ✅ Manager init flow
- ✅ Repo discovery per report (reuses existing logic)
- ✅ Per-report analysis (IC-style)
- ✅ Team-level aggregations (projects, contributor matrix, timeline)

**Testing Strategy:**
- Unit tests for report ID generation and utilities
- Integration tests for report management
- Manual testing for interactive flows
- Path resolution tests (IC vs manager mode)

**Note:**
- Single-org constraint for Phase 4
- Manual Jira projects (no auto-discovery)
- Series fetching (parallel can be added later)

**Execution:**
Follow tasks sequentially. Each task is self-contained with clear commits.
