# Guided CLI Onboarding & Profiles Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement portable workspace (`~/.work-chronicler/`), profile management, and interactive init wizard for work-chronicler.

**Architecture:** Core workspace utilities in `src/core/workspace/` handle profile resolution and path management. Profile commands live in `src/cli/commands/subcommands/profile/`. Init wizard uses existing `@inquirer/prompts` patterns. GitHub repo discovery via GraphQL queries. All existing commands gain `--profile` flag support.

**Tech Stack:** TypeScript, Commander, @inquirer/prompts, @octokit/graphql, Zod, chalk, ora

**Design Document:** See `docs/plans/2026-02-01-guided-cli-onboarding-profiles-design.md` for full design rationale.

---

## Task 1: Add @octokit/graphql Dependency

**Files:**
- Modify: `package.json`

**Step 1: Install the dependency**

Run:
```bash
pnpm add @octokit/graphql
```

**Step 2: Verify installation**

Run:
```bash
pnpm list @octokit/graphql
```

Expected: Shows `@octokit/graphql` in dependencies

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @octokit/graphql for repo discovery"
```

---

## Task 2: Create Global Config Schema and Types

**Files:**
- Create: `src/core/workspace/types.ts`

**Step 1: Create the types file**

```typescript
import { z } from 'zod';

/**
 * Global config schema for ~/.work-chronicler/config.json
 * This is machine-managed and should not be manually edited.
 */
export const GlobalConfigSchema = z.object({
  version: z.string().default('0.1.0'),
  activeProfile: z.string().default('default'),
});

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>;

/**
 * Profile name validation
 * - alphanumeric + hyphens
 * - no spaces
 * - 1-50 characters
 */
export const ProfileNameSchema = z
  .string()
  .min(1, 'Profile name cannot be empty')
  .max(50, 'Profile name must be 50 characters or less')
  .regex(
    /^[a-zA-Z0-9][a-zA-Z0-9-]*$/,
    'Profile name must start with alphanumeric and contain only alphanumeric characters and hyphens',
  );

export type ProfileName = z.infer<typeof ProfileNameSchema>;
```

**Step 2: Run type-check to verify**

Run:
```bash
pnpm type-check
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/core/workspace/types.ts
git commit -m "feat(workspace): add global config and profile name schemas"
```

---

## Task 3: Create Workspace Resolver

**Files:**
- Create: `src/core/workspace/resolver.ts`

**Step 1: Create the resolver file**

```typescript
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Default workspace root directory
 */
const DEFAULT_WORKSPACE_ROOT = join(homedir(), '.work-chronicler');

/**
 * Standard directories within a profile
 */
const PROFILE_SUBDIRS = ['work-log', 'analysis', 'outputs'] as const;

/**
 * Get the workspace root directory.
 *
 * Resolution order:
 * 1. WORK_CHRONICLER_HOME environment variable
 * 2. Default: ~/.work-chronicler/
 *
 * @returns Absolute path to workspace root
 */
export function getWorkspaceRoot(): string {
  return process.env.WORK_CHRONICLER_HOME ?? DEFAULT_WORKSPACE_ROOT;
}

/**
 * Check if workspace mode is enabled (workspace root exists)
 */
export function isWorkspaceMode(): boolean {
  return existsSync(getWorkspaceRoot());
}

/**
 * Get the profiles directory path
 */
export function getProfilesDir(): string {
  return join(getWorkspaceRoot(), 'profiles');
}

/**
 * Get the path to a specific profile directory
 */
export function getProfileDir(profileName: string): string {
  return join(getProfilesDir(), profileName);
}

/**
 * Get the path to a profile's config file
 */
export function getProfileConfigPath(profileName: string): string {
  return join(getProfileDir(profileName), 'config.yaml');
}

/**
 * Get the path to a profile's .env file
 */
export function getProfileEnvPath(profileName: string): string {
  return join(getProfileDir(profileName), '.env');
}

/**
 * Get the path to a profile's work-log directory
 */
export function getWorkLogDir(profileName: string): string {
  return join(getProfileDir(profileName), 'work-log');
}

/**
 * Get the path to a profile's analysis directory
 */
export function getAnalysisDir(profileName: string): string {
  return join(getProfileDir(profileName), 'analysis');
}

/**
 * Get the path to a profile's outputs directory
 */
export function getOutputsDir(profileName: string): string {
  return join(getProfileDir(profileName), 'outputs');
}

/**
 * Get the path to the global config file
 */
export function getGlobalConfigPath(): string {
  return join(getWorkspaceRoot(), 'config.json');
}

/**
 * Ensure workspace root directory exists
 */
export function ensureWorkspaceRoot(): void {
  const root = getWorkspaceRoot();
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true });
  }
}

/**
 * Ensure all profile directories exist
 */
export function ensureProfileDirs(profileName: string): void {
  const profileDir = getProfileDir(profileName);

  // Create profile directory
  if (!existsSync(profileDir)) {
    mkdirSync(profileDir, { recursive: true });
  }

  // Create subdirectories
  for (const subdir of PROFILE_SUBDIRS) {
    const subdirPath = join(profileDir, subdir);
    if (!existsSync(subdirPath)) {
      mkdirSync(subdirPath, { recursive: true });
    }
  }
}

/**
 * Check if a profile directory exists
 */
export function profileExists(profileName: string): boolean {
  return existsSync(getProfileDir(profileName));
}
```

**Step 2: Run type-check to verify**

Run:
```bash
pnpm type-check
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/core/workspace/resolver.ts
git commit -m "feat(workspace): add workspace path resolver utilities"
```

---

## Task 4: Create Global Config Manager

**Files:**
- Create: `src/core/workspace/global-config.ts`

**Step 1: Create the global config manager**

```typescript
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  ensureWorkspaceRoot,
  getGlobalConfigPath,
  profileExists,
} from './resolver';
import { type GlobalConfig, GlobalConfigSchema } from './types';

/**
 * Load global config from ~/.work-chronicler/config.json
 *
 * If file doesn't exist, returns default config.
 * If file exists but is invalid, throws error.
 */
export function loadGlobalConfig(): GlobalConfig {
  const configPath = getGlobalConfigPath();

  if (!existsSync(configPath)) {
    return GlobalConfigSchema.parse({});
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const raw = JSON.parse(content);
    return GlobalConfigSchema.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in global config: ${configPath}`);
    }
    throw error;
  }
}

/**
 * Save global config to ~/.work-chronicler/config.json
 */
export function saveGlobalConfig(config: GlobalConfig): void {
  ensureWorkspaceRoot();
  const configPath = getGlobalConfigPath();
  const content = JSON.stringify(config, null, 2);
  writeFileSync(configPath, `${content}\n`, 'utf-8');
}

/**
 * Get the active profile name.
 *
 * Resolution order:
 * 1. WORK_CHRONICLER_PROFILE environment variable
 * 2. activeProfile in global config
 * 3. Fallback: "default"
 */
export function getActiveProfile(): string {
  // 1. Check environment variable
  const envProfile = process.env.WORK_CHRONICLER_PROFILE;
  if (envProfile) {
    return envProfile;
  }

  // 2. Check global config
  const config = loadGlobalConfig();
  return config.activeProfile;
}

/**
 * Set the active profile in global config.
 *
 * @throws Error if profile doesn't exist
 */
export function setActiveProfile(profileName: string): void {
  if (!profileExists(profileName)) {
    throw new Error(`Profile '${profileName}' does not exist`);
  }

  const config = loadGlobalConfig();
  config.activeProfile = profileName;
  saveGlobalConfig(config);
}
```

**Step 2: Run type-check to verify**

Run:
```bash
pnpm type-check
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/core/workspace/global-config.ts
git commit -m "feat(workspace): add global config manager"
```

---

## Task 5: Create Profile Manager

**Files:**
- Create: `src/core/workspace/profile-manager.ts`

**Step 1: Create the profile manager**

```typescript
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { type Config, ConfigSchema } from '@core/config/schema';
import { getActiveProfile, loadGlobalConfig, saveGlobalConfig } from './global-config';
import {
  ensureProfileDirs,
  getProfileConfigPath,
  getProfileDir,
  getProfileEnvPath,
  getProfilesDir,
  profileExists,
} from './resolver';
import { ProfileNameSchema } from './types';

/**
 * Validate a profile name
 *
 * @throws Error if profile name is invalid
 */
export function validateProfileName(name: string): void {
  const result = ProfileNameSchema.safeParse(name);
  if (!result.success) {
    throw new Error(result.error.errors[0]?.message ?? 'Invalid profile name');
  }
}

/**
 * List all available profiles
 */
export function listProfiles(): string[] {
  const profilesDir = getProfilesDir();

  if (!existsSync(profilesDir)) {
    return [];
  }

  const entries = readdirSync(profilesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Create a new profile with the given config.
 *
 * @throws Error if profile already exists or name is invalid
 */
export function createProfile(profileName: string, config: Config): void {
  validateProfileName(profileName);

  if (profileExists(profileName)) {
    throw new Error(`Profile '${profileName}' already exists`);
  }

  // Create directories
  ensureProfileDirs(profileName);

  // Write config file
  saveProfileConfig(profileName, config);
}

/**
 * Delete a profile and all its data.
 *
 * @throws Error if profile doesn't exist or is the active profile
 */
export function deleteProfile(profileName: string): void {
  if (!profileExists(profileName)) {
    throw new Error(`Profile '${profileName}' does not exist`);
  }

  const active = getActiveProfile();
  if (profileName === active) {
    throw new Error(
      `Cannot delete active profile '${profileName}'. Switch to another profile first.`,
    );
  }

  const profileDir = getProfileDir(profileName);
  rmSync(profileDir, { recursive: true, force: true });
}

/**
 * Load a profile's config.
 *
 * @throws Error if profile doesn't exist or config is invalid
 */
export function loadProfileConfig(profileName: string): Config {
  const configPath = getProfileConfigPath(profileName);

  if (!existsSync(configPath)) {
    throw new Error(`Profile '${profileName}' has no config file`);
  }

  const content = readFileSync(configPath, 'utf-8');
  const raw = parseYaml(content);

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Invalid profile config for '${profileName}':\n${errors}`);
  }

  return result.data;
}

/**
 * Save a profile's config.
 */
export function saveProfileConfig(profileName: string, config: Config): void {
  ensureProfileDirs(profileName);
  const configPath = getProfileConfigPath(profileName);
  const content = stringifyYaml(config, {
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  });
  writeFileSync(configPath, content, 'utf-8');
}

/**
 * Save environment variables to a profile's .env file.
 */
export function saveProfileEnv(
  profileName: string,
  env: { githubToken?: string; jiraToken?: string; jiraEmail?: string },
): void {
  ensureProfileDirs(profileName);
  const envPath = getProfileEnvPath(profileName);

  const lines: string[] = [
    '# work-chronicler profile environment variables',
    '# These tokens are used for API authentication',
    '',
  ];

  if (env.githubToken) {
    lines.push(`GITHUB_TOKEN=${env.githubToken}`);
  }

  if (env.jiraToken) {
    lines.push(`JIRA_TOKEN=${env.jiraToken}`);
  }

  if (env.jiraEmail) {
    lines.push(`JIRA_EMAIL=${env.jiraEmail}`);
  }

  writeFileSync(envPath, `${lines.join('\n')}\n`, 'utf-8');
}

/**
 * Set a profile as the first/default profile (for new workspaces)
 */
export function initializeWorkspaceWithProfile(profileName: string): void {
  const config = loadGlobalConfig();
  config.activeProfile = profileName;
  saveGlobalConfig(config);
}
```

**Step 2: Run type-check to verify**

Run:
```bash
pnpm type-check
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/core/workspace/profile-manager.ts
git commit -m "feat(workspace): add profile manager for CRUD operations"
```

---

## Task 6: Create Workspace Module Index

**Files:**
- Create: `src/core/workspace/index.ts`

**Step 1: Create the barrel export**

```typescript
// Types
export { type GlobalConfig, GlobalConfigSchema, ProfileNameSchema } from './types';

// Resolver utilities
export {
  getWorkspaceRoot,
  isWorkspaceMode,
  getProfilesDir,
  getProfileDir,
  getProfileConfigPath,
  getProfileEnvPath,
  getWorkLogDir,
  getAnalysisDir,
  getOutputsDir,
  getGlobalConfigPath,
  ensureWorkspaceRoot,
  ensureProfileDirs,
  profileExists,
} from './resolver';

// Global config
export {
  loadGlobalConfig,
  saveGlobalConfig,
  getActiveProfile,
  setActiveProfile,
} from './global-config';

// Profile manager
export {
  validateProfileName,
  listProfiles,
  createProfile,
  deleteProfile,
  loadProfileConfig,
  saveProfileConfig,
  saveProfileEnv,
  initializeWorkspaceWithProfile,
} from './profile-manager';
```

**Step 2: Run type-check to verify**

Run:
```bash
pnpm type-check
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/core/workspace/index.ts
git commit -m "feat(workspace): add workspace module barrel export"
```

---

## Task 7: Add Workspace Path Alias

**Files:**
- Modify: `tsconfig.json`

**Step 1: Add the path alias**

Add to the `paths` object in `tsconfig.json`:

```json
"@workspace/*": ["src/core/workspace/*"]
```

The full paths section should look like:

```json
"paths": {
  "@core/*": ["src/core/*"],
  "@mcp/*": ["src/mcp/*"],
  "@cli/*": ["src/cli/*"],
  "@commands/*": ["src/cli/commands/*"],
  "@fetchers/*": ["src/cli/fetchers/*"],
  "@linker/*": ["src/cli/linker/*"],
  "@prompts": ["src/cli/prompts/index.ts"],
  "@analyzer/*": ["src/cli/analyzer/*"],
  "@config/*": ["src/core/config/*"],
  "@storage/*": ["src/core/storage/*"],
  "@wc-types/*": ["src/core/types/*"],
  "@workspace/*": ["src/core/workspace/*"]
}
```

**Step 2: Run type-check to verify**

Run:
```bash
pnpm type-check
```

Expected: No errors

**Step 3: Commit**

```bash
git add tsconfig.json
git commit -m "chore: add @workspace path alias"
```

---

## Task 8: Update Core Index to Export Workspace

**Files:**
- Modify: `src/core/index.ts`

**Step 1: Read current file**

First check the current contents of `src/core/index.ts`.

**Step 2: Add workspace export**

Add to the exports:

```typescript
// Workspace
export * from './workspace/index';
```

**Step 3: Run type-check to verify**

Run:
```bash
pnpm type-check
```

Expected: No errors

**Step 4: Commit**

```bash
git add src/core/index.ts
git commit -m "feat(core): export workspace module from core barrel"
```

---

## Task 9: Create Profile List Command

**Files:**
- Create: `src/cli/commands/subcommands/profile/list.ts`

**Step 1: Create the directory structure**

Run:
```bash
mkdir -p src/cli/commands/subcommands/profile
```

**Step 2: Create the list command**

```typescript
import chalk from 'chalk';
import { Command } from 'commander';
import { getActiveProfile, isWorkspaceMode, listProfiles } from '@core/index';

export const listCommand = new Command('list')
  .description('List all available profiles')
  .action(async () => {
    if (!isWorkspaceMode()) {
      console.log(chalk.yellow('Workspace mode not enabled.'));
      console.log('Run `work-chronicler init` to create your first profile.');
      return;
    }

    const profiles = listProfiles();

    if (profiles.length === 0) {
      console.log(chalk.yellow('No profiles found.'));
      console.log('Run `work-chronicler init` to create your first profile.');
      return;
    }

    const active = getActiveProfile();

    console.log(chalk.cyan('\nAvailable profiles:\n'));

    for (const profile of profiles) {
      if (profile === active) {
        console.log(chalk.green(`  * ${profile} (active)`));
      } else {
        console.log(`    ${profile}`);
      }
    }

    console.log(
      chalk.dim("\nUse 'work-chronicler profile switch <name>' to change profiles"),
    );
  });
```

**Step 3: Run type-check to verify**

Run:
```bash
pnpm type-check
```

Expected: No errors

**Step 4: Commit**

```bash
git add src/cli/commands/subcommands/profile/list.ts
git commit -m "feat(profile): add profile list command"
```

---

## Task 10: Create Profile Switch Command

**Files:**
- Create: `src/cli/commands/subcommands/profile/switch.ts`

**Step 1: Create the switch command**

```typescript
import chalk from 'chalk';
import { Command } from 'commander';
import { isWorkspaceMode, profileExists, setActiveProfile } from '@core/index';

export const switchCommand = new Command('switch')
  .description('Switch to a different profile')
  .argument('<name>', 'Profile name to switch to')
  .action(async (name: string) => {
    if (!isWorkspaceMode()) {
      console.error(chalk.red('Workspace mode not enabled.'));
      console.error('Run `work-chronicler init` to create your first profile.');
      process.exit(1);
    }

    if (!profileExists(name)) {
      console.error(chalk.red(`Profile '${name}' does not exist.`));
      console.error("Run 'work-chronicler profile list' to see available profiles.");
      process.exit(1);
    }

    try {
      setActiveProfile(name);
      console.log(chalk.green(`\nSwitched to profile '${name}'`));
      console.log(
        chalk.dim(
          '\nAll commands will now use this profile unless overridden with --profile flag',
        ),
      );
    } catch (error) {
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : 'Unknown error',
      );
      process.exit(1);
    }
  });
```

**Step 2: Run type-check to verify**

Run:
```bash
pnpm type-check
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/cli/commands/subcommands/profile/switch.ts
git commit -m "feat(profile): add profile switch command"
```

---

## Task 11: Create Profile Delete Command

**Files:**
- Create: `src/cli/commands/subcommands/profile/delete.ts`

**Step 1: Create the delete command**

```typescript
import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { Command } from 'commander';
import { deleteProfile, isWorkspaceMode, profileExists } from '@core/index';

export const deleteCommand = new Command('delete')
  .description('Delete a profile and all its data')
  .argument('<name>', 'Profile name to delete')
  .option('-f, --force', 'Skip confirmation prompt')
  .action(async (name: string, options: { force?: boolean }) => {
    if (!isWorkspaceMode()) {
      console.error(chalk.red('Workspace mode not enabled.'));
      process.exit(1);
    }

    if (!profileExists(name)) {
      console.error(chalk.red(`Profile '${name}' does not exist.`));
      process.exit(1);
    }

    // Confirm deletion unless --force is used
    if (!options.force) {
      console.log(
        chalk.yellow(
          `\nWarning: This will permanently delete the '${name}' profile and all its data.`,
        ),
      );

      const confirmed = await confirm({
        message: 'Are you sure?',
        default: false,
      });

      if (!confirmed) {
        console.log('Cancelled.');
        return;
      }
    }

    try {
      deleteProfile(name);
      console.log(chalk.green(`\nProfile '${name}' deleted successfully`));
    } catch (error) {
      console.error(
        chalk.red('Error:'),
        error instanceof Error ? error.message : 'Unknown error',
      );
      process.exit(1);
    }
  });
```

**Step 2: Run type-check to verify**

Run:
```bash
pnpm type-check
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/cli/commands/subcommands/profile/delete.ts
git commit -m "feat(profile): add profile delete command"
```

---

## Task 12: Create Profile Subcommand Index

**Files:**
- Create: `src/cli/commands/subcommands/profile/index.ts`

**Step 1: Create the subcommand registration**

```typescript
import { Command } from 'commander';
import { deleteCommand } from './delete';
import { listCommand } from './list';
import { switchCommand } from './switch';

export const profileCommand = new Command('profile')
  .description('Manage work-chronicler profiles')
  .addCommand(listCommand)
  .addCommand(switchCommand)
  .addCommand(deleteCommand);
```

**Step 2: Run type-check to verify**

Run:
```bash
pnpm type-check
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/cli/commands/subcommands/profile/index.ts
git commit -m "feat(profile): add profile subcommand registration"
```

---

## Task 13: Register Profile Command in CLI

**Files:**
- Modify: `src/cli/index.ts`

**Step 1: Add import for profile command**

Add after the other command imports:

```typescript
import { profileCommand } from '@commands/subcommands/profile/index';
```

**Step 2: Register the command**

Add after the other `program.addCommand()` calls:

```typescript
program.addCommand(profileCommand);
```

**Step 3: Run type-check to verify**

Run:
```bash
pnpm type-check
```

Expected: No errors

**Step 4: Test the commands**

Run:
```bash
pnpm cli profile list
pnpm cli profile --help
```

Expected: Should show profile commands (no errors)

**Step 5: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat(cli): register profile subcommand"
```

---

## Task 14: Create GitHub Repo Discovery Utility

**Files:**
- Create: `src/cli/commands/init/init.utils.ts`

**Step 1: Create directory**

Run:
```bash
mkdir -p src/cli/commands/init
```

**Step 2: Create the discovery utility**

```typescript
import { graphql } from '@octokit/graphql';
import ora from 'ora';

/**
 * PR lookback options for discovery
 */
export type PRLookbackDepth = 50 | 100 | 200;

/**
 * Result of repo discovery
 */
export interface DiscoveryResult {
  repos: string[];
  totalReposChecked: number;
  elapsedMs: number;
}

/**
 * GraphQL response types
 */
interface RepoNode {
  nameWithOwner: string;
  pullRequests: {
    nodes: Array<{
      author: { login: string } | null;
    }>;
  };
}

interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface ReposResponse {
  organization?: {
    repositories: {
      pageInfo: PageInfo;
      nodes: RepoNode[];
      totalCount: number;
    };
  };
  user?: {
    repositories: {
      pageInfo: PageInfo;
      nodes: RepoNode[];
      totalCount: number;
    };
  };
}

/**
 * Strip org prefix from repo name
 *
 * @example
 * stripOrgPrefix('voxmedia/duet', 'voxmedia') // 'duet'
 * stripOrgPrefix('duet', 'voxmedia') // 'duet'
 */
export function stripOrgPrefix(nameWithOwner: string, org: string): string {
  const prefix = `${org}/`;
  return nameWithOwner.startsWith(prefix)
    ? nameWithOwner.slice(prefix.length)
    : nameWithOwner;
}

/**
 * Discover repos where a user has PRs in an organization.
 *
 * Uses GitHub GraphQL API to efficiently search for repos.
 * Shows progress spinner during discovery.
 *
 * @param token - GitHub personal access token
 * @param org - Organization or username to search
 * @param username - GitHub username to find PRs for
 * @param prCount - Number of recent PRs to check per repo
 */
export async function discoverRepos(
  token: string,
  org: string,
  username: string,
  prCount: PRLookbackDepth,
): Promise<DiscoveryResult> {
  const startTime = Date.now();
  const foundRepos: Set<string> = new Set();
  let cursor: string | null = null;
  let totalReposChecked = 0;
  let totalRepos = 0;

  const spinner = ora(`Discovering repos in '${org}'...`).start();

  const graphqlWithAuth = graphql.defaults({
    headers: {
      authorization: `token ${token}`,
    },
  });

  // Try organization first, fall back to user
  const isOrg = await checkIfOrganization(graphqlWithAuth, org);

  try {
    do {
      const query = isOrg
        ? buildOrgQuery(prCount, cursor)
        : buildUserQuery(prCount, cursor);

      const variables = isOrg
        ? { org, after: cursor }
        : { login: org, after: cursor };

      const response = await graphqlWithAuth<ReposResponse>(query, variables);

      const data = isOrg ? response.organization : response.user;
      if (!data) {
        throw new Error(`Could not find ${isOrg ? 'organization' : 'user'} '${org}'`);
      }

      const { repositories } = data;
      totalRepos = repositories.totalCount;

      for (const repo of repositories.nodes) {
        totalReposChecked++;

        // Check if any PR in this repo was authored by the target user
        const hasUserPR = repo.pullRequests.nodes.some(
          (pr) => pr.author?.login?.toLowerCase() === username.toLowerCase(),
        );

        if (hasUserPR) {
          const repoName = stripOrgPrefix(repo.nameWithOwner, org);
          foundRepos.add(repoName);
        }
      }

      // Update spinner
      const elapsed = formatElapsed(Date.now() - startTime);
      spinner.text = `Checked ${totalReposChecked}/${totalRepos} repos... (${elapsed})`;

      cursor = repositories.pageInfo.hasNextPage
        ? repositories.pageInfo.endCursor
        : null;

      // Rate limit protection
      if (cursor) {
        await sleep(100);
      }
    } while (cursor);

    const elapsedMs = Date.now() - startTime;
    spinner.succeed(
      `Found ${foundRepos.size} repos in ${formatElapsed(elapsedMs)}`,
    );

    return {
      repos: Array.from(foundRepos).sort(),
      totalReposChecked,
      elapsedMs,
    };
  } catch (error) {
    spinner.fail('Discovery failed');
    throw error;
  }
}

/**
 * Check if a login is an organization or user
 */
async function checkIfOrganization(
  graphqlWithAuth: typeof graphql,
  login: string,
): Promise<boolean> {
  try {
    const response = await graphqlWithAuth<{ organization: { id: string } | null }>(
      `query($login: String!) { organization(login: $login) { id } }`,
      { login },
    );
    return response.organization !== null;
  } catch {
    return false;
  }
}

/**
 * Build GraphQL query for organization repos
 */
function buildOrgQuery(prCount: number, cursor: string | null): string {
  const afterClause = cursor ? ', after: $after' : '';
  return `
    query($org: String!${cursor ? ', $after: String' : ''}) {
      organization(login: $org) {
        repositories(first: 100${afterClause}, orderBy: {field: NAME, direction: ASC}) {
          pageInfo { hasNextPage endCursor }
          totalCount
          nodes {
            nameWithOwner
            pullRequests(first: ${prCount}, orderBy: {field: CREATED_AT, direction: DESC}, states: [OPEN, CLOSED, MERGED]) {
              nodes {
                author { login }
              }
            }
          }
        }
      }
    }
  `;
}

/**
 * Build GraphQL query for user repos
 */
function buildUserQuery(prCount: number, cursor: string | null): string {
  const afterClause = cursor ? ', after: $after' : '';
  return `
    query($login: String!${cursor ? ', $after: String' : ''}) {
      user(login: $login) {
        repositories(first: 100${afterClause}, orderBy: {field: NAME, direction: ASC}) {
          pageInfo { hasNextPage endCursor }
          totalCount
          nodes {
            nameWithOwner
            pullRequests(first: ${prCount}, orderBy: {field: CREATED_AT, direction: DESC}, states: [OPEN, CLOSED, MERGED]) {
              nodes {
                author { login }
              }
            }
          }
        }
      }
    }
  `;
}

/**
 * Format elapsed time as human-readable string
 */
function formatElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

**Step 3: Run type-check to verify**

Run:
```bash
pnpm type-check
```

Expected: No errors

**Step 4: Commit**

```bash
git add src/cli/commands/init/init.utils.ts
git commit -m "feat(init): add GitHub repo discovery utility"
```

---

## Task 15: Create Init Wizard Prompts

**Files:**
- Create: `src/cli/commands/init/init.prompts.ts`

**Step 1: Create the prompts file**

```typescript
import { checkbox, confirm, input, password, select } from '@inquirer/prompts';
import chalk from 'chalk';
import type { PRLookbackDepth } from './init.utils';

/**
 * Data source options
 */
export type DataSource = 'github' | 'jira';

/**
 * Time range options
 */
export type TimeRange = '3months' | '6months' | '12months' | 'custom';

/**
 * Repo discovery method
 */
export type RepoDiscoveryMethod = 'manual' | 'auto' | 'all';

/**
 * Prompt for profile name
 */
export async function promptProfileName(defaultName = 'default'): Promise<string> {
  return await input({
    message: 'What would you like to name this profile?',
    default: defaultName,
    validate: (value: string) => {
      if (!value.trim()) {
        return 'Profile name cannot be empty';
      }
      if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(value)) {
        return 'Profile name must start with alphanumeric and contain only alphanumeric characters and hyphens';
      }
      if (value.length > 50) {
        return 'Profile name must be 50 characters or less';
      }
      return true;
    },
  });
}

/**
 * Prompt for data sources
 */
export async function promptDataSources(): Promise<DataSource[]> {
  const sources = await checkbox<DataSource>({
    message: 'Which data sources would you like to use?',
    choices: [
      { name: 'GitHub', value: 'github', checked: true },
      { name: 'JIRA', value: 'jira' },
    ],
    validate: (selected) => {
      if (selected.length === 0) {
        return 'At least one data source is required';
      }
      return true;
    },
  });

  return sources;
}

/**
 * Prompt for time range
 */
export async function promptTimeRange(): Promise<{ since: string; timeRange: TimeRange }> {
  const timeRange = await select<TimeRange>({
    message: 'How far back should we fetch data?',
    choices: [
      { name: 'Last 3 months', value: '3months' },
      { name: 'Last 6 months', value: '6months' },
      { name: 'Last 12 months', value: '12months' },
      { name: 'Custom date range', value: 'custom' },
    ],
  });

  let since: string;
  const now = new Date();

  switch (timeRange) {
    case '3months':
      since = new Date(now.setMonth(now.getMonth() - 3)).toISOString().split('T')[0]!;
      break;
    case '6months':
      since = new Date(now.setMonth(now.getMonth() - 6)).toISOString().split('T')[0]!;
      break;
    case '12months':
      since = new Date(now.setMonth(now.getMonth() - 12)).toISOString().split('T')[0]!;
      break;
    case 'custom':
      since = await input({
        message: 'Enter start date (YYYY-MM-DD):',
        validate: (value: string) => {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return 'Please enter a date in YYYY-MM-DD format';
          }
          return true;
        },
      });
      break;
  }

  return { since, timeRange };
}

/**
 * Prompt for GitHub username
 */
export async function promptGitHubUsername(): Promise<string> {
  return await input({
    message: "What's your GitHub username?",
    validate: (value: string) => {
      if (!value.trim()) {
        return 'GitHub username is required';
      }
      return true;
    },
  });
}

/**
 * Prompt for GitHub organizations (multi-input)
 */
export async function promptGitHubOrgs(): Promise<string[]> {
  console.log(chalk.dim('\nFor personal repos, use your username as the org name'));

  const orgs: string[] = [];
  let addMore = true;

  while (addMore) {
    const org = await input({
      message: orgs.length === 0
        ? 'Enter a GitHub organization (or username for personal repos):'
        : 'Enter another organization (or press Enter to finish):',
      validate: (value: string) => {
        if (orgs.length === 0 && !value.trim()) {
          return 'At least one organization is required';
        }
        return true;
      },
    });

    if (!org.trim()) {
      addMore = false;
    } else {
      orgs.push(org.trim());
    }
  }

  return orgs;
}

/**
 * Prompt for repo discovery method
 */
export async function promptRepoDiscoveryMethod(org: string): Promise<RepoDiscoveryMethod> {
  console.log(chalk.cyan(`\nConfiguring repos for '${org}'...`));

  return await select<RepoDiscoveryMethod>({
    message: `How should we find repos in '${org}'?`,
    choices: [
      {
        name: 'Manual entry (fastest)',
        value: 'manual',
        description: 'Type repo names yourself',
      },
      {
        name: 'Auto-discover',
        value: 'auto',
        description: 'Find repos where you have PRs (slow for large orgs, may miss old contributions)',
      },
      {
        name: 'All repos (slowest)',
        value: 'all',
        description: "Include everything - repos: ['*'] (very slow for large orgs)",
      },
    ],
  });
}

/**
 * Prompt for PR lookback depth (auto-discover only)
 */
export async function promptPRLookbackDepth(): Promise<PRLookbackDepth> {
  console.log(chalk.dim('\nIn active repos, older PRs may be outside this range'));

  return await select<PRLookbackDepth>({
    message: 'How many recent PRs per repo should we check?',
    choices: [
      { name: '50 PRs per repo (faster, ~30-60s)', value: 50 },
      { name: '100 PRs per repo (recommended, ~1-2 min)', value: 100 },
      { name: '200 PRs per repo (thorough, ~2-5 min)', value: 200 },
    ],
    default: 100,
  });
}

/**
 * Prompt for manual repo entry
 */
export async function promptManualRepos(org: string): Promise<string[]> {
  const repos: string[] = [];
  let addMore = true;

  while (addMore) {
    const repo = await input({
      message: repos.length === 0
        ? `Enter a repo name for '${org}':`
        : 'Enter another repo (or press Enter to finish):',
      validate: (value: string) => {
        if (repos.length === 0 && !value.trim()) {
          return 'At least one repo is required';
        }
        return true;
      },
    });

    if (!repo.trim()) {
      addMore = false;
    } else {
      // Strip org prefix if user entered it
      const repoName = repo.includes('/') ? repo.split('/').pop()! : repo;
      repos.push(repoName.trim());
    }
  }

  return repos;
}

/**
 * Prompt to confirm discovered repos
 */
export async function promptConfirmDiscoveredRepos(repos: string[]): Promise<'yes' | 'no' | 'edit'> {
  console.log(chalk.cyan(`\nFound ${repos.length} repos:`));
  for (const repo of repos.slice(0, 10)) {
    console.log(`  - ${repo}`);
  }
  if (repos.length > 10) {
    console.log(chalk.dim(`  ... and ${repos.length - 10} more`));
  }

  return await select<'yes' | 'no' | 'edit'>({
    message: `Use these ${repos.length} repos?`,
    choices: [
      { name: 'Yes', value: 'yes' },
      { name: 'No, let me enter manually', value: 'no' },
      { name: 'Edit the list', value: 'edit' },
    ],
  });
}

/**
 * Prompt to edit repo list
 */
export async function promptEditRepos(repos: string[]): Promise<string[]> {
  return await checkbox<string>({
    message: 'Select repos to include:',
    choices: repos.map((repo) => ({ name: repo, value: repo, checked: true })),
  });
}

/**
 * Prompt for all repos confirmation
 */
export async function promptConfirmAllRepos(org: string): Promise<boolean> {
  console.log(chalk.yellow(`\nWarning: This will fetch ALL repos in '${org}' (may be slow)`));

  return await confirm({
    message: 'Continue?',
    default: true,
  });
}

/**
 * Prompt for JIRA instance name
 */
export async function promptJiraInstanceName(): Promise<string> {
  return await input({
    message: 'JIRA instance name (e.g., "mycompany"):',
    validate: (value: string) => {
      if (!value.trim()) {
        return 'Instance name is required';
      }
      return true;
    },
  });
}

/**
 * Prompt for JIRA URL
 */
export async function promptJiraUrl(): Promise<string> {
  return await input({
    message: 'JIRA URL:',
    validate: (value: string) => {
      if (!value.trim()) {
        return 'JIRA URL is required';
      }
      if (!value.startsWith('https://')) {
        return 'JIRA URL must start with https://';
      }
      try {
        const url = new URL(value);
        if (!url.host.includes('.')) {
          return 'Please enter a valid URL';
        }
      } catch {
        return 'Please enter a valid URL';
      }
      return true;
    },
  });
}

/**
 * Prompt for JIRA email
 */
export async function promptJiraEmail(): Promise<string> {
  return await input({
    message: 'JIRA email:',
    validate: (value: string) => {
      if (!value.trim()) {
        return 'Email is required';
      }
      if (!value.includes('@')) {
        return 'Please enter a valid email address';
      }
      return true;
    },
  });
}

/**
 * Prompt for JIRA projects (multi-input)
 */
export async function promptJiraProjects(): Promise<string[]> {
  const projects: string[] = [];
  let addMore = true;

  while (addMore) {
    const project = await input({
      message: projects.length === 0
        ? 'Enter a JIRA project key (e.g., "PROJ"):'
        : 'Enter another project (or press Enter to finish):',
      validate: (value: string) => {
        if (projects.length === 0 && !value.trim()) {
          return 'At least one project is required';
        }
        return true;
      },
    });

    if (!project.trim()) {
      addMore = false;
    } else {
      projects.push(project.trim().toUpperCase());
    }
  }

  return projects;
}

/**
 * Prompt for token readiness
 */
export async function promptTokensReady(sources: DataSource[]): Promise<boolean> {
  console.log(chalk.cyan('\nAPI tokens are required to fetch data.\n'));
  console.log('Create your tokens at:');

  if (sources.includes('github')) {
    console.log(chalk.dim('  GitHub: https://github.com/settings/tokens'));
    console.log(chalk.dim('          (Required scopes: repo or public_repo)'));
  }

  if (sources.includes('jira')) {
    console.log(chalk.dim('  JIRA:   https://id.atlassian.com/manage-profile/security/api-tokens'));
  }

  console.log();

  return await confirm({
    message: 'Do you have your tokens ready?',
    default: true,
  });
}

/**
 * Prompt for GitHub token
 */
export async function promptGitHubToken(): Promise<string> {
  return await password({
    message: 'GitHub token:',
    validate: (value: string) => {
      if (!value.trim()) {
        return 'Token is required';
      }
      return true;
    },
  });
}

/**
 * Prompt for JIRA token
 */
export async function promptJiraToken(): Promise<string> {
  return await password({
    message: 'JIRA token:',
    validate: (value: string) => {
      if (!value.trim()) {
        return 'Token is required';
      }
      return true;
    },
  });
}

/**
 * Prompt to fetch now
 */
export async function promptFetchNow(): Promise<boolean> {
  return await confirm({
    message: 'Fetch data now? This may take a few minutes.',
    default: true,
  });
}
```

**Step 2: Run type-check to verify**

Run:
```bash
pnpm type-check
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/cli/commands/init/init.prompts.ts
git commit -m "feat(init): add init wizard prompts"
```

---

## Task 16: Create Init Wizard Types

**Files:**
- Create: `src/cli/commands/init/init.types.ts`

**Step 1: Create the types file**

```typescript
import type { Config } from '@core/index';
import type { DataSource, TimeRange } from './init.prompts';

/**
 * GitHub organization configuration from wizard
 */
export interface WizardGitHubOrg {
  name: string;
  repos: string[];
}

/**
 * GitHub configuration from wizard
 */
export interface WizardGitHubConfig {
  username: string;
  orgs: WizardGitHubOrg[];
}

/**
 * JIRA instance configuration from wizard
 */
export interface WizardJiraInstance {
  name: string;
  url: string;
  email: string;
  projects: string[];
}

/**
 * JIRA configuration from wizard
 */
export interface WizardJiraConfig {
  instances: WizardJiraInstance[];
}

/**
 * Token configuration from wizard
 */
export interface WizardTokens {
  githubToken?: string;
  jiraToken?: string;
  jiraEmail?: string;
}

/**
 * Complete wizard result
 */
export interface WizardResult {
  profileName: string;
  dataSources: DataSource[];
  timeRange: TimeRange;
  since: string;
  github?: WizardGitHubConfig;
  jira?: WizardJiraConfig;
  tokens: WizardTokens;
  fetchNow: boolean;
}

/**
 * Convert wizard result to Config
 */
export function wizardResultToConfig(result: WizardResult): Config {
  const config: Config = {
    github: result.github
      ? {
          username: result.github.username,
          orgs: result.github.orgs.map((org) => ({
            name: org.name,
            repos: org.repos,
          })),
        }
      : { username: '', orgs: [] },
    output: { directory: './work-log' },
    fetch: {
      since: result.since,
      until: null,
    },
  };

  if (result.jira && result.jira.instances.length > 0) {
    config.jira = {
      instances: result.jira.instances.map((instance) => ({
        name: instance.name,
        url: instance.url,
        email: instance.email,
        projects: instance.projects,
      })),
    };
  }

  return config;
}
```

**Step 2: Run type-check to verify**

Run:
```bash
pnpm type-check
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/cli/commands/init/init.types.ts
git commit -m "feat(init): add init wizard types"
```

---

## Task 17: Create Init Command with Wizard

**Files:**
- Create: `src/cli/commands/init/index.ts`

**Step 1: Create the init command**

```typescript
import chalk from 'chalk';
import { Command } from 'commander';
import {
  createProfile,
  getProfileEnvPath,
  initializeWorkspaceWithProfile,
  isWorkspaceMode,
  profileExists,
  saveProfileEnv,
} from '@core/index';
import type { DataSource } from './init.prompts';
import {
  promptConfirmAllRepos,
  promptConfirmDiscoveredRepos,
  promptDataSources,
  promptEditRepos,
  promptFetchNow,
  promptGitHubOrgs,
  promptGitHubToken,
  promptGitHubUsername,
  promptJiraEmail,
  promptJiraInstanceName,
  promptJiraProjects,
  promptJiraToken,
  promptJiraUrl,
  promptManualRepos,
  promptPRLookbackDepth,
  promptProfileName,
  promptRepoDiscoveryMethod,
  promptTimeRange,
  promptTokensReady,
} from './init.prompts';
import type {
  WizardGitHubConfig,
  WizardGitHubOrg,
  WizardJiraConfig,
  WizardJiraInstance,
  WizardResult,
  WizardTokens,
} from './init.types';
import { wizardResultToConfig } from './init.types';
import { discoverRepos } from './init.utils';

export const initCommand = new Command('init')
  .description('Initialize a new work-chronicler profile with guided setup')
  .option('--profile <name>', 'Profile name (skips profile name prompt)')
  .action(async (options: { profile?: string }) => {
    try {
      console.log(chalk.cyan('\nWelcome to work-chronicler!\n'));

      if (isWorkspaceMode()) {
        console.log(chalk.dim("Let's set up a new profile.\n"));
      } else {
        console.log(chalk.dim("Let's set up your first profile.\n"));
      }

      // Step 1: Profile name
      const profileName = options.profile ?? (await promptProfileName());

      if (profileExists(profileName)) {
        console.error(chalk.red(`\nProfile '${profileName}' already exists.`));
        console.error("Use 'work-chronicler profile delete' to remove it first.");
        process.exit(1);
      }

      // Step 2: Data sources
      const dataSources = await promptDataSources();

      // Step 3: Time range
      const { since, timeRange } = await promptTimeRange();

      // Step 4: GitHub configuration (if selected)
      let github: WizardGitHubConfig | undefined;
      let githubToken: string | undefined;

      if (dataSources.includes('github')) {
        github = await collectGitHubConfig();
      }

      // Step 5: JIRA configuration (if selected)
      let jira: WizardJiraConfig | undefined;

      if (dataSources.includes('jira')) {
        jira = await collectJiraConfig();
      }

      // Step 6: Token setup
      const tokens = await collectTokens(dataSources, github);
      githubToken = tokens.githubToken;

      // Step 7: Create profile
      const result: WizardResult = {
        profileName,
        dataSources,
        timeRange,
        since,
        github,
        jira,
        tokens,
        fetchNow: false,
      };

      const config = wizardResultToConfig(result);
      createProfile(profileName, config);

      // Save tokens if provided
      if (tokens.githubToken || tokens.jiraToken) {
        saveProfileEnv(profileName, tokens);
      }

      // Set as active profile
      initializeWorkspaceWithProfile(profileName);

      console.log(chalk.green(`\nProfile '${profileName}' created successfully!`));

      // Step 8: Fetch now?
      const fetchNow = await promptFetchNow();

      if (fetchNow) {
        console.log(chalk.cyan('\nStarting data fetch...\n'));
        // TODO: Integrate with fetch:all command
        console.log(chalk.yellow('Fetch integration not yet implemented.'));
        console.log(chalk.dim('Run `work-chronicler fetch:all` to fetch your data.'));
      }

      // Show next steps
      showNextSteps(profileName, tokens);
    } catch (error) {
      if (error instanceof Error && error.message.includes('User force closed')) {
        console.log(chalk.yellow('\n\nSetup cancelled.'));
        process.exit(0);
      }
      console.error(
        chalk.red('\nError:'),
        error instanceof Error ? error.message : 'Unknown error',
      );
      process.exit(1);
    }
  });

/**
 * Collect GitHub configuration
 */
async function collectGitHubConfig(): Promise<WizardGitHubConfig> {
  const username = await promptGitHubUsername();
  const orgNames = await promptGitHubOrgs();

  const orgs: WizardGitHubOrg[] = [];

  for (const orgName of orgNames) {
    const method = await promptRepoDiscoveryMethod(orgName);

    let repos: string[];

    switch (method) {
      case 'manual':
        repos = await promptManualRepos(orgName);
        break;

      case 'auto':
        // Will be implemented with token collection
        console.log(
          chalk.yellow(
            '\nAuto-discovery requires a GitHub token. We will collect it later.',
          ),
        );
        console.log(chalk.dim('For now, please enter repos manually or select "all".\n'));
        repos = await promptManualRepos(orgName);
        break;

      case 'all':
        const confirmed = await promptConfirmAllRepos(orgName);
        if (confirmed) {
          repos = ['*'];
        } else {
          repos = await promptManualRepos(orgName);
        }
        break;
    }

    orgs.push({ name: orgName, repos });
  }

  return { username, orgs };
}

/**
 * Collect JIRA configuration
 */
async function collectJiraConfig(): Promise<WizardJiraConfig> {
  console.log(chalk.cyan('\nJIRA Instance Configuration\n'));

  const name = await promptJiraInstanceName();
  const url = await promptJiraUrl();
  const email = await promptJiraEmail();
  const projects = await promptJiraProjects();

  const instance: WizardJiraInstance = { name, url, email, projects };

  return { instances: [instance] };
}

/**
 * Collect tokens
 */
async function collectTokens(
  dataSources: DataSource[],
  github?: WizardGitHubConfig,
): Promise<WizardTokens> {
  const tokens: WizardTokens = {};

  const ready = await promptTokensReady(dataSources);

  if (!ready) {
    console.log(chalk.dim('\nYou can add tokens later to your profile .env file.'));
    return tokens;
  }

  if (dataSources.includes('github')) {
    tokens.githubToken = await promptGitHubToken();

    // Run auto-discovery for any orgs that need it
    if (github) {
      for (const org of github.orgs) {
        // Check if this org needs auto-discovery (placeholder check)
        // In the current flow, auto-discover falls back to manual
        // This will be enhanced once we have the token available upfront
      }
    }
  }

  if (dataSources.includes('jira')) {
    tokens.jiraToken = await promptJiraToken();
  }

  return tokens;
}

/**
 * Show next steps after profile creation
 */
function showNextSteps(profileName: string, tokens: WizardTokens): void {
  console.log(chalk.cyan('\nNext steps:\n'));

  if (!tokens.githubToken && !tokens.jiraToken) {
    console.log(
      `  1. Add your API tokens to: ~/.work-chronicler/profiles/${profileName}/.env`,
    );
    console.log('  2. Fetch your work history: work-chronicler fetch:all');
  } else {
    console.log('  1. Fetch your work history: work-chronicler fetch:all');
  }

  console.log('  2. Check what was fetched: work-chronicler status');
  console.log(
    '  3. Generate a summary: Use /summarize-work in your AI assistant',
  );
  console.log();
  console.log(chalk.dim('Switch profiles: work-chronicler profile switch <name>'));
  console.log(chalk.dim('List profiles:   work-chronicler profile list'));
}
```

**Step 2: Run type-check to verify**

Run:
```bash
pnpm type-check
```

Expected: No errors

**Step 3: Commit**

```bash
git add src/cli/commands/init/index.ts
git commit -m "feat(init): add init wizard command"
```

---

## Task 18: Update CLI to Use New Init Command

**Files:**
- Modify: `src/cli/index.ts`

**Step 1: Update the import**

Change:
```typescript
import { initCommand } from '@commands/init';
```

To:
```typescript
import { initCommand } from '@commands/init/index';
```

**Step 2: Run type-check to verify**

Run:
```bash
pnpm type-check
```

Expected: No errors

**Step 3: Test the init command**

Run:
```bash
pnpm cli init --help
```

Expected: Shows init command help

**Step 4: Commit**

```bash
git add src/cli/index.ts
git commit -m "feat(cli): use new init wizard command"
```

---

## Task 19: Delete Old Init Command File

**Files:**
- Delete: `src/cli/commands/init.ts`

**Step 1: Remove the old file**

Run:
```bash
rm src/cli/commands/init.ts
```

**Step 2: Run type-check to verify**

Run:
```bash
pnpm type-check
```

Expected: No errors

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove old init command file"
```

---

## Task 20: Run Full Verification

**Step 1: Run all checks**

Run:
```bash
pnpm format:fix && pnpm lint:fix && pnpm type-check && pnpm build
```

Expected: All pass

**Step 2: Test profile commands**

Run:
```bash
pnpm cli profile --help
pnpm cli profile list
pnpm cli init --help
```

Expected: All commands work

**Step 3: Create a test profile**

Run:
```bash
pnpm cli init --profile test-profile
```

Walk through the wizard to verify it works.

**Step 4: Verify profile was created**

Run:
```bash
pnpm cli profile list
ls -la ~/.work-chronicler/profiles/test-profile/
```

Expected: Profile directory exists with config.yaml

**Step 5: Clean up test profile**

Run:
```bash
pnpm cli profile delete test-profile --force
```

**Step 6: Commit any formatting changes**

```bash
git add -A
git commit -m "chore: apply formatting fixes" --allow-empty
```

---

## Task 21: Final Integration Commit

**Step 1: Create integration commit**

```bash
git add -A
git commit -m "feat: complete Phase 1 - workspace and profile infrastructure

- Add workspace resolver for ~/.work-chronicler/ paths
- Add global config manager (config.json)
- Add profile manager (CRUD operations)
- Add profile commands (list, switch, delete)
- Add init wizard with interactive prompts
- Add GitHub repo discovery utility (GraphQL)
- Maintain backward compatibility with repo-mode

Implements Phase 1 of guided CLI onboarding design.
" --allow-empty
```

---

## Summary

This plan implements Phase 1 (Core Workspace Infrastructure) and Phase 2 (Profile Commands) from the design document, plus the foundation for Phase 3 (GitHub Repo Discovery) and Phase 4 (Init Wizard).

**What's Implemented:**
- `~/.work-chronicler/` workspace structure
- Global config management (config.json)
- Profile CRUD operations
- Profile commands: `list`, `switch`, `delete`
- Init wizard with interactive prompts
- GitHub repo discovery utility (ready for integration)

**What's Deferred:**
- Auto-discovery integration in wizard (tokens collected after repo config)
- Fetch integration after init
- File structure reorganization (Phase 5)
- Full backward compatibility testing

**Next Steps After This Plan:**
1. Integrate auto-discovery into wizard flow (collect token earlier)
2. Add fetch:all integration to init wizard
3. Add `--profile` flag to all existing commands
4. Complete file structure reorganization (Phase 5)
