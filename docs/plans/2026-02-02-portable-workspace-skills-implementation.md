# Portable Workspace & Skills Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable work-chronicler skills to be installed to AI tool directories and dynamically resolve workspace paths.

**Architecture:** Create `.agent/skills/` as source of truth, add `workspace` command for path resolution, add `skills` command for installation/management.

**Tech Stack:** TypeScript, Commander.js, Inquirer, fs/path utilities

---

## Task 1: Add resolver functions for analysis directory

The existing resolver lacks `getAnalysisDir()`. Add it before implementing workspace commands.

**Files:**
- Modify: `src/core/workspace/resolver.ts`

**Step 1: Add getAnalysisDir function**

Add after `getWorkLogDir` in `src/core/workspace/resolver.ts`:

```typescript
/**
 * Get the path to a profile's analysis directory
 */
export function getAnalysisDir(profileName: string): string {
  return join(getWorkLogDir(profileName), '.analysis');
}
```

**Step 2: Export from workspace index**

Add to exports in `src/core/workspace/index.ts`:

```typescript
export {
  // ... existing exports
  getAnalysisDir,
} from './resolver';
```

**Step 3: Run type-check**

Run: `pnpm type-check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/core/workspace/resolver.ts src/core/workspace/index.ts
git commit -m "$(cat <<'EOF'
feat(workspace): add getAnalysisDir resolver function
EOF
)"
```

---

## Task 2: Create workspace command group

**Files:**
- Create: `src/cli/commands/workspace/index.ts`
- Create: `src/cli/commands/workspace/profile.ts`
- Create: `src/cli/commands/workspace/work-log.ts`
- Create: `src/cli/commands/workspace/analysis.ts`
- Create: `src/cli/commands/workspace/root.ts`
- Modify: `src/cli/index.ts`

**Step 1: Create workspace/profile.ts**

Create `src/cli/commands/workspace/profile.ts`:

```typescript
import { Command } from 'commander';
import { getActiveProfile, isWorkspaceMode } from '@core/index';

export const profileSubcommand = new Command('profile')
  .description('Output the active profile name')
  .action(() => {
    if (!isWorkspaceMode()) {
      console.error('Workspace not initialized. Run `work-chronicler init` first.');
      process.exit(1);
    }
    console.log(getActiveProfile());
  });
```

**Step 2: Create workspace/work-log.ts**

Create `src/cli/commands/workspace/work-log.ts`:

```typescript
import { Command } from 'commander';
import { getActiveProfile, getWorkLogDir, isWorkspaceMode } from '@core/index';

export const workLogSubcommand = new Command('work-log')
  .description('Output the work-log directory path')
  .action(() => {
    if (!isWorkspaceMode()) {
      console.error('Workspace not initialized. Run `work-chronicler init` first.');
      process.exit(1);
    }
    console.log(getWorkLogDir(getActiveProfile()));
  });
```

**Step 3: Create workspace/analysis.ts**

Create `src/cli/commands/workspace/analysis.ts`:

```typescript
import { Command } from 'commander';
import { getActiveProfile, getAnalysisDir, isWorkspaceMode } from '@core/index';

export const analysisSubcommand = new Command('analysis')
  .description('Output the analysis directory path')
  .action(() => {
    if (!isWorkspaceMode()) {
      console.error('Workspace not initialized. Run `work-chronicler init` first.');
      process.exit(1);
    }
    console.log(getAnalysisDir(getActiveProfile()));
  });
```

**Step 4: Create workspace/root.ts**

Create `src/cli/commands/workspace/root.ts`:

```typescript
import { Command } from 'commander';
import { getActiveProfile, getProfileDir, isWorkspaceMode } from '@core/index';

export const rootSubcommand = new Command('root')
  .description('Output the profile root directory path')
  .action(() => {
    if (!isWorkspaceMode()) {
      console.error('Workspace not initialized. Run `work-chronicler init` first.');
      process.exit(1);
    }
    console.log(getProfileDir(getActiveProfile()));
  });
```

**Step 5: Create workspace/index.ts**

Create `src/cli/commands/workspace/index.ts`:

```typescript
import { Command } from 'commander';
import { analysisSubcommand } from './analysis';
import { profileSubcommand } from './profile';
import { rootSubcommand } from './root';
import { workLogSubcommand } from './work-log';

export const workspaceCommand = new Command('workspace')
  .description('Output workspace paths for the active profile')
  .addCommand(profileSubcommand)
  .addCommand(workLogSubcommand)
  .addCommand(analysisSubcommand)
  .addCommand(rootSubcommand);
```

**Step 6: Register workspace command in CLI**

Add import and registration in `src/cli/index.ts`:

```typescript
// Add import
import { workspaceCommand } from '@commands/workspace/index';

// Add registration (after profileCommand)
program.addCommand(workspaceCommand);
```

**Step 7: Run type-check and test**

Run: `pnpm type-check`
Expected: PASS

Run: `pnpm build && pnpm cli workspace --help`
Expected: Shows workspace subcommands

**Step 8: Commit**

```bash
git add src/cli/commands/workspace/ src/cli/index.ts
git commit -m "$(cat <<'EOF'
feat(cli): add workspace command for path resolution

Adds subcommands:
- workspace profile - output active profile name
- workspace work-log - output work-log directory path
- workspace analysis - output analysis directory path
- workspace root - output profile root directory path

These commands enable AI skills to dynamically resolve workspace paths.
EOF
)"
```

---

## Task 3: Create skills command scaffolding

**Files:**
- Create: `src/cli/commands/skills/index.ts`
- Create: `src/cli/commands/skills/types.ts`
- Modify: `src/cli/index.ts`

**Step 1: Create skills/types.ts**

Create `src/cli/commands/skills/types.ts`:

```typescript
import { z } from 'zod';

/**
 * Supported AI tools for skill installation
 */
export const AI_TOOLS = {
  claude: {
    name: 'Claude Code',
    configDir: '.claude',
    skillsDir: 'skills',
  },
  cursor: {
    name: 'Cursor',
    configDir: '.cursor',
    skillsDir: 'skills',
  },
  codex: {
    name: 'Codex',
    configDir: '.codex',
    skillsDir: 'skills',
  },
  gemini: {
    name: 'Gemini',
    configDir: '.gemini',
    skillsDir: 'skills',
  },
} as const;

export type AIToolKey = keyof typeof AI_TOOLS;

export const InstallMethodSchema = z.enum(['copy', 'symlink']);
export type InstallMethod = z.infer<typeof InstallMethodSchema>;

/**
 * Skill name prefix to avoid conflicts
 */
export const SKILL_PREFIX = 'work-chronicler-';
```

**Step 2: Create skills/index.ts (placeholder)**

Create `src/cli/commands/skills/index.ts`:

```typescript
import { Command } from 'commander';

export const skillsCommand = new Command('skills')
  .description('Manage work-chronicler AI skills');

// Subcommands will be added in subsequent tasks
```

**Step 3: Register skills command in CLI**

Add import and registration in `src/cli/index.ts`:

```typescript
// Add import
import { skillsCommand } from '@commands/skills/index';

// Add registration (after workspaceCommand)
program.addCommand(skillsCommand);
```

**Step 4: Run type-check**

Run: `pnpm type-check`
Expected: PASS

**Step 5: Commit**

```bash
git add src/cli/commands/skills/ src/cli/index.ts
git commit -m "$(cat <<'EOF'
feat(cli): add skills command scaffolding

Adds types for AI tools and install methods.
Subcommands (install, uninstall, list) to be added next.
EOF
)"
```

---

## Task 4: Implement skills list subcommand

**Files:**
- Create: `src/cli/commands/skills/list.ts`
- Modify: `src/cli/commands/skills/index.ts`

**Step 1: Create skills/list.ts**

Create `src/cli/commands/skills/list.ts`:

```typescript
import { existsSync, readdirSync, lstatSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import { AI_TOOLS, type AIToolKey, SKILL_PREFIX } from './types';

function getInstalledSkills(toolKey: AIToolKey): { name: string; isSymlink: boolean }[] {
  const tool = AI_TOOLS[toolKey];
  const skillsPath = join(homedir(), tool.configDir, tool.skillsDir);

  if (!existsSync(skillsPath)) {
    return [];
  }

  try {
    const entries = readdirSync(skillsPath, { withFileTypes: true });
    return entries
      .filter(entry => entry.isDirectory() && entry.name.startsWith(SKILL_PREFIX))
      .map(entry => ({
        name: entry.name,
        isSymlink: lstatSync(join(skillsPath, entry.name)).isSymbolicLink(),
      }));
  } catch {
    return [];
  }
}

export const listSubcommand = new Command('list')
  .description('Show where work-chronicler skills are installed')
  .action(() => {
    console.log(chalk.cyan('\nInstalled skills:\n'));

    let anyInstalled = false;

    for (const [key, tool] of Object.entries(AI_TOOLS)) {
      const skills = getInstalledSkills(key as AIToolKey);
      const configPath = join(homedir(), tool.configDir, tool.skillsDir);

      console.log(chalk.bold(`${tool.name} (~/${tool.configDir}/${tool.skillsDir}/):`));

      if (skills.length === 0) {
        console.log(chalk.dim('  (not installed)\n'));
      } else {
        anyInstalled = true;
        for (const skill of skills) {
          const suffix = skill.isSymlink ? chalk.dim(' (symlinked)') : '';
          console.log(chalk.green(`  ✓ ${skill.name}${suffix}`));
        }
        console.log();
      }
    }

    if (!anyInstalled) {
      console.log(chalk.yellow("No skills installed. Run 'work-chronicler skills install' to install."));
    }
  });
```

**Step 2: Register in skills/index.ts**

Update `src/cli/commands/skills/index.ts`:

```typescript
import { Command } from 'commander';
import { listSubcommand } from './list';

export const skillsCommand = new Command('skills')
  .description('Manage work-chronicler AI skills')
  .addCommand(listSubcommand);
```

**Step 3: Run type-check and test**

Run: `pnpm type-check`
Expected: PASS

Run: `pnpm build && pnpm cli skills list`
Expected: Shows "(not installed)" for all tools

**Step 4: Commit**

```bash
git add src/cli/commands/skills/
git commit -m "$(cat <<'EOF'
feat(cli): add skills list subcommand

Shows which AI tools have work-chronicler skills installed,
and whether they are copied or symlinked.
EOF
)"
```

---

## Task 5: Implement skills install subcommand

**Files:**
- Create: `src/cli/commands/skills/install.ts`
- Modify: `src/cli/commands/skills/index.ts`

**Step 1: Create skills/install.ts**

Create `src/cli/commands/skills/install.ts`:

```typescript
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import { Command } from 'commander';
import { checkbox, confirm, select } from '@inquirer/prompts';
import { AI_TOOLS, type AIToolKey, type InstallMethod, SKILL_PREFIX } from './types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the source skills directory (from the package)
 */
function getSourceSkillsDir(): string {
  // Navigate from dist/cli/commands/skills/ to .agent/skills/
  // In development: src/cli/commands/skills/ -> .agent/skills/
  // In production: dist/cli/commands/skills/ -> .agent/skills/
  const packageRoot = join(__dirname, '..', '..', '..', '..');
  return join(packageRoot, '.agent', 'skills');
}

/**
 * Get available skills from source directory
 */
function getAvailableSkills(): string[] {
  const sourceDir = getSourceSkillsDir();
  if (!existsSync(sourceDir)) {
    return [];
  }

  try {
    return readdirSync(sourceDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.startsWith(SKILL_PREFIX))
      .map(entry => entry.name);
  } catch {
    return [];
  }
}

/**
 * Check which AI tools have their config directory
 */
function detectInstalledTools(): { key: AIToolKey; detected: boolean }[] {
  return (Object.keys(AI_TOOLS) as AIToolKey[]).map(key => ({
    key,
    detected: existsSync(join(homedir(), AI_TOOLS[key].configDir)),
  }));
}

/**
 * Check for existing skills at target
 */
function getExistingSkills(toolKey: AIToolKey): string[] {
  const tool = AI_TOOLS[toolKey];
  const targetDir = join(homedir(), tool.configDir, tool.skillsDir);

  if (!existsSync(targetDir)) {
    return [];
  }

  try {
    return readdirSync(targetDir, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.startsWith(SKILL_PREFIX))
      .map(entry => entry.name);
  } catch {
    return [];
  }
}

/**
 * Install skills to a target tool
 */
function installSkills(
  toolKey: AIToolKey,
  skills: string[],
  method: InstallMethod,
  overwrite: boolean,
): { installed: number; skipped: number } {
  const tool = AI_TOOLS[toolKey];
  const sourceDir = getSourceSkillsDir();
  const targetDir = join(homedir(), tool.configDir, tool.skillsDir);

  // Ensure target directory exists
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  let installed = 0;
  let skipped = 0;

  for (const skill of skills) {
    const sourcePath = join(sourceDir, skill);
    const targetPath = join(targetDir, skill);

    if (existsSync(targetPath)) {
      if (overwrite) {
        rmSync(targetPath, { recursive: true, force: true });
      } else {
        skipped++;
        continue;
      }
    }

    if (method === 'symlink') {
      symlinkSync(sourcePath, targetPath, 'dir');
    } else {
      cpSync(sourcePath, targetPath, { recursive: true });
    }
    installed++;
  }

  return { installed, skipped };
}

export const installSubcommand = new Command('install')
  .description('Install work-chronicler skills to AI tools')
  .action(async () => {
    // Check for source skills
    const availableSkills = getAvailableSkills();
    if (availableSkills.length === 0) {
      console.error(chalk.red('No skills found in package. Package may be corrupted.'));
      process.exit(1);
    }

    console.log(chalk.cyan(`\nFound ${availableSkills.length} skills to install.\n`));

    // Detect installed tools
    const tools = detectInstalledTools();
    const choices = tools.map(({ key, detected }) => ({
      name: `${AI_TOOLS[key].name} (~/${AI_TOOLS[key].configDir})${detected ? '' : chalk.dim(' - not detected')}`,
      value: key,
      checked: detected,
    }));

    // Select tools
    const selectedTools = await checkbox({
      message: 'Select AI tools to install skills for:',
      choices,
    });

    if (selectedTools.length === 0) {
      console.log(chalk.yellow('No tools selected. Exiting.'));
      return;
    }

    // Select install method
    const method = await select<InstallMethod>({
      message: 'How should skills be installed?',
      choices: [
        { name: 'Copy (recommended - works after package updates)', value: 'copy' },
        { name: 'Symlink (auto-updates but requires global install)', value: 'symlink' },
      ],
    });

    // Check for conflicts and install
    let totalInstalled = 0;
    let totalSkipped = 0;

    for (const toolKey of selectedTools) {
      const tool = AI_TOOLS[toolKey];
      const existing = getExistingSkills(toolKey);

      let overwrite = false;
      if (existing.length > 0) {
        console.log(chalk.yellow(`\n${tool.name} already has ${existing.length} work-chronicler skill(s).`));
        overwrite = await confirm({
          message: 'Overwrite existing skills?',
          default: false,
        });
      }

      const result = installSkills(toolKey, availableSkills, method, overwrite || existing.length === 0);
      totalInstalled += result.installed;
      totalSkipped += result.skipped;

      if (result.installed > 0) {
        console.log(chalk.green(`✓ Installed ${result.installed} skill(s) to ${tool.name}`));
      }
      if (result.skipped > 0) {
        console.log(chalk.yellow(`  Skipped ${result.skipped} existing skill(s)`));
      }
    }

    console.log(chalk.cyan(`\nDone! Installed ${totalInstalled} skill(s) (${method}).`));

    if (totalInstalled > 0) {
      console.log(chalk.dim('\nSkills are now available in your AI tools.'));
      console.log(chalk.dim('Use /work-chronicler-summarize-work (or similar) to invoke them.'));
    }
  });
```

**Step 2: Register in skills/index.ts**

Update `src/cli/commands/skills/index.ts`:

```typescript
import { Command } from 'commander';
import { installSubcommand } from './install';
import { listSubcommand } from './list';

export const skillsCommand = new Command('skills')
  .description('Manage work-chronicler AI skills')
  .addCommand(installSubcommand)
  .addCommand(listSubcommand);
```

**Step 3: Run type-check**

Run: `pnpm type-check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/cli/commands/skills/
git commit -m "$(cat <<'EOF'
feat(cli): add skills install subcommand

Interactive wizard that:
- Detects which AI tools are installed
- Lets user select which tools to install to
- Lets user choose copy vs symlink method
- Warns about existing skills and asks before overwriting
EOF
)"
```

---

## Task 6: Implement skills uninstall subcommand

**Files:**
- Create: `src/cli/commands/skills/uninstall.ts`
- Modify: `src/cli/commands/skills/index.ts`

**Step 1: Create skills/uninstall.ts**

Create `src/cli/commands/skills/uninstall.ts`:

```typescript
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import chalk from 'chalk';
import { Command } from 'commander';
import { checkbox, confirm } from '@inquirer/prompts';
import { AI_TOOLS, type AIToolKey, SKILL_PREFIX } from './types';

/**
 * Get installed work-chronicler skills for a tool
 */
function getInstalledSkills(toolKey: AIToolKey): string[] {
  const tool = AI_TOOLS[toolKey];
  const skillsPath = join(homedir(), tool.configDir, tool.skillsDir);

  if (!existsSync(skillsPath)) {
    return [];
  }

  try {
    return readdirSync(skillsPath, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.startsWith(SKILL_PREFIX))
      .map(entry => entry.name);
  } catch {
    return [];
  }
}

/**
 * Remove skills from a tool
 */
function removeSkills(toolKey: AIToolKey): number {
  const tool = AI_TOOLS[toolKey];
  const skillsPath = join(homedir(), tool.configDir, tool.skillsDir);
  const skills = getInstalledSkills(toolKey);

  let removed = 0;
  for (const skill of skills) {
    const skillPath = join(skillsPath, skill);
    try {
      rmSync(skillPath, { recursive: true, force: true });
      removed++;
    } catch {
      // Skip if removal fails
    }
  }

  return removed;
}

export const uninstallSubcommand = new Command('uninstall')
  .description('Remove work-chronicler skills from AI tools')
  .action(async () => {
    // Find tools with installed skills
    const toolsWithSkills: { key: AIToolKey; count: number }[] = [];

    for (const key of Object.keys(AI_TOOLS) as AIToolKey[]) {
      const skills = getInstalledSkills(key);
      if (skills.length > 0) {
        toolsWithSkills.push({ key, count: skills.length });
      }
    }

    if (toolsWithSkills.length === 0) {
      console.log(chalk.yellow('\nNo work-chronicler skills are installed.'));
      return;
    }

    console.log(chalk.cyan('\nFound work-chronicler skills in the following tools:\n'));

    // Select tools to uninstall from
    const choices = toolsWithSkills.map(({ key, count }) => ({
      name: `${AI_TOOLS[key].name} (${count} skill${count > 1 ? 's' : ''})`,
      value: key,
      checked: true,
    }));

    const selectedTools = await checkbox({
      message: 'Select tools to remove skills from:',
      choices,
    });

    if (selectedTools.length === 0) {
      console.log(chalk.yellow('No tools selected. Exiting.'));
      return;
    }

    // Confirm
    const totalSkills = selectedTools.reduce((sum, key) => {
      const found = toolsWithSkills.find(t => t.key === key);
      return sum + (found?.count ?? 0);
    }, 0);

    const confirmed = await confirm({
      message: `Remove ${totalSkills} skill(s) from ${selectedTools.length} tool(s)?`,
      default: false,
    });

    if (!confirmed) {
      console.log(chalk.yellow('Cancelled.'));
      return;
    }

    // Remove skills
    let totalRemoved = 0;
    for (const toolKey of selectedTools) {
      const removed = removeSkills(toolKey);
      totalRemoved += removed;
      console.log(chalk.green(`✓ Removed ${removed} skill(s) from ${AI_TOOLS[toolKey].name}`));
    }

    console.log(chalk.cyan(`\nDone! Removed ${totalRemoved} skill(s).`));
  });
```

**Step 2: Register in skills/index.ts**

Update `src/cli/commands/skills/index.ts`:

```typescript
import { Command } from 'commander';
import { installSubcommand } from './install';
import { listSubcommand } from './list';
import { uninstallSubcommand } from './uninstall';

export const skillsCommand = new Command('skills')
  .description('Manage work-chronicler AI skills')
  .addCommand(installSubcommand)
  .addCommand(listSubcommand)
  .addCommand(uninstallSubcommand);
```

**Step 3: Run type-check**

Run: `pnpm type-check`
Expected: PASS

**Step 4: Commit**

```bash
git add src/cli/commands/skills/
git commit -m "$(cat <<'EOF'
feat(cli): add skills uninstall subcommand

Interactive command that:
- Detects which tools have work-chronicler skills
- Lets user select which tools to uninstall from
- Confirms before removing
EOF
)"
```

---

## Task 7: Create .agent/skills directory and migrate summarize-work

**Files:**
- Create: `.agent/skills/work-chronicler-summarize-work/SKILL.md`

**Step 1: Create directory structure**

```bash
mkdir -p .agent/skills/work-chronicler-summarize-work
```

**Step 2: Create SKILL.md**

Create `.agent/skills/work-chronicler-summarize-work/SKILL.md`:

```markdown
---
name: work-chronicler-summarize-work
description: Use when preparing for performance reviews, 1:1s, or summarizing accomplishments. Reads PRs and tickets from work-chronicler workspace.
user-invocable: true
---

# Summarize Work

Summarize the user's work history from their work-chronicler data.

## Workspace

**Active profile:** !`work-chronicler workspace profile`
**Work log:** !`work-chronicler workspace work-log`
**Analysis:** !`work-chronicler workspace analysis`

> **For non-Claude tools:** Run `work-chronicler workspace work-log` to get your data path.

## Data Location

Work data is stored in the workspace work-log directory:

```
<work-log>/
├── filtered/               # ⭐ USE THIS IF IT EXISTS (pre-filtered subset)
│   ├── .analysis/
│   ├── pull-requests/
│   └── jira/
├── .analysis/
│   ├── stats.json      # Impact breakdown, repo stats, PR/ticket counts
│   ├── projects.json   # Detected project groupings
│   └── timeline.json   # Chronological view by week/month
├── pull-requests/
│   └── <org>/<repo>/*.md
└── jira/
    └── <org>/<project>/*.md
```

**Important**: If `filtered/` exists, use it instead of the main directories. This contains a pre-filtered subset of significant work.

## Instructions

1. **Start with analysis files** (preferred - already computed):
   - `stats.json` - Overall stats, impact breakdown, repo/project counts
   - `timeline.json` - Activity by week/month with impact distribution
   - `projects.json` - Detected project groupings with confidence levels

2. **Read PR/ticket files** for details:
   - PRs have frontmatter: title, prNumber, repository, state, additions, deletions, impact (flagship/major/standard/minor), jiraTickets
   - Tickets have frontmatter: key, summary, project, issueType, status, linkedPRs

3. **Check for supporting documents** (optional context):
   - `performance-reviews/` - Past reviews for format/context
   - `resumes/` - Existing resume for tone
   - `notes/` - User's own notes and goals

## Summary Structure

Generate a summary including:
- **Overview**: Date range, total PRs/tickets, impact distribution
- **By Repository**: PR counts and lines changed per repo
- **By Impact**: Flagship and major work highlighted
- **Major Projects**: From projects.json (high confidence first)
- **Timeline**: Busiest periods, activity trends
- **Notable Contributions**: Largest PRs, most complex changes

## Example Output

```markdown
## Work Summary

### Overview
- **Period**: January 2025 - December 2025
- **Total PRs**: 274 (78 flagship, 50 major, 58 standard, 88 minor)
- **Total JIRA Tickets**: 72
- **PRs linked to tickets**: 31

### Impact Highlights

**Flagship Work** (28% of PRs):
- Platform migration to new authentication system
- Complete redesign of data pipeline architecture
- Multi-region deployment infrastructure

**Major Features** (18% of PRs):
- User dashboard overhaul
- API rate limiting implementation
- Search functionality rewrite

### Top Repositories
1. voxmedia/duet: 206 PRs (+45,000 / -12,000 lines)
2. voxmedia/honeycomb: 63 PRs (+8,500 / -2,100 lines)

### Activity Timeline
- Busiest month: August 2025 (41 PRs)
- Busiest week: Aug 4-10, 2025 (19 PRs)

### Key Projects (High Confidence)
1. **Authentication Overhaul** - 5 PRs, 4 tickets
2. **Eater App Migration** - 4 PRs, 3 tickets
```

## Tips

- Flagship/major PRs are the most important to highlight
- Use projects.json confidence levels (high > medium > low)
- Cross-reference timeline.json for temporal context
- Look for patterns in ticket prefixes to identify initiatives
```

**Step 3: Commit**

```bash
git add .agent/skills/work-chronicler-summarize-work/
git commit -m "$(cat <<'EOF'
feat(skills): add work-chronicler-summarize-work skill

Migrated from .claude/commands/summarize-work.md with:
- Cross-provider compatible frontmatter
- Dynamic workspace injection for Claude Code
- Fallback instructions for other providers
EOF
)"
```

---

## Task 8: Migrate generate-resume-bullets skill

**Files:**
- Create: `.agent/skills/work-chronicler-generate-resume-bullets/SKILL.md`

**Step 1: Create directory**

```bash
mkdir -p .agent/skills/work-chronicler-generate-resume-bullets
```

**Step 2: Create SKILL.md**

Create `.agent/skills/work-chronicler-generate-resume-bullets/SKILL.md`:

```markdown
---
name: work-chronicler-generate-resume-bullets
description: Use when creating achievement-focused resume bullet points from work history. Extracts impactful accomplishments for resumes.
user-invocable: true
---

# Generate Resume Bullets

Generate achievement-focused resume bullet points from the user's work history.

## Workspace

**Active profile:** !`work-chronicler workspace profile`
**Work log:** !`work-chronicler workspace work-log`
**Analysis:** !`work-chronicler workspace analysis`

> **For non-Claude tools:** Run `work-chronicler workspace work-log` to get your data path.

## Data Location

Work data is stored in the workspace work-log directory:

```
<work-log>/
├── filtered/               # ⭐ USE THIS IF IT EXISTS (pre-filtered subset)
│   ├── .analysis/
│   ├── pull-requests/
│   └── jira/
├── .analysis/
│   ├── stats.json      # Impact breakdown, repo stats
│   ├── projects.json   # Detected project groupings
│   └── timeline.json   # Chronological view
├── pull-requests/
│   └── <org>/<repo>/*.md
├── jira/
│   └── <org>/<project>/*.md
├── resumes/            # User's existing resume(s) - use for tone/format
├── performance-reviews/ # Past reviews - use for context
└── notes/              # User's goals and highlights
```

**Important**: If `filtered/` exists, use it for the most resume-worthy contributions.

## Instructions

1. **Read analysis files first**:
   - `stats.json` - Get impact distribution
   - `projects.json` - Get high-confidence project groupings
   - Focus on **flagship** and **major** impact PRs

2. **Read supporting documents** (if present):
   - `resumes/` - Match tone and format of existing resume
   - `notes/` - Prioritize what user wants to highlight

3. **Focus on impact, not tasks**:
   - Use action verbs: "Architected", "Led", "Reduced", "Implemented"
   - Quantify when possible: percentages, numbers, scale
   - Highlight business impact, not just technical changes
   - Group related PRs into cohesive achievements

4. **Use impact levels as signals**:
   - **Flagship** (500+ lines or 15+ files): Major initiatives, lead with these
   - **Major** (200+ lines or 8+ files): Significant features
   - Skip minor/standard unless specifically relevant

## Output Location

Save generated documents to `generated/resume-bullets-YYYY-MM-DD.md` in the workspace root.

## Bullet Point Format

- Start with strong action verb
- Include context (what, for whom)
- Show measurable impact
- Keep concise (1-2 lines max)

## Example Output

```markdown
## Resume Bullet Points

### Platform Engineering

- **Architected multi-region deployment infrastructure** using Kubernetes and Helm, enabling 99.9% uptime and reducing deployment time by 70%

- **Led authentication system migration** to OAuth2 with MFA support, serving 50,000+ enterprise users across 3 identity providers

- **Designed and implemented caching layer** using Redis, reducing API response times from 450ms to 120ms (73% improvement)

### Product Development

- **Built real-time collaboration features** enabling 10 concurrent editors, driving 25% increase in user engagement

- **Redesigned checkout flow** reducing cart abandonment by 25% and increasing mobile conversion from 2.1% to 3.4%

### Technical Leadership

- **Established CI/CD pipeline** with automated testing and rollback, enabling 5x more frequent deployments

- **Mentored 3 junior engineers** through code reviews and pair programming, all promoted within 12 months
```

## Tips

- Prioritize flagship/major PRs from projects.json high-confidence groups
- Cross-reference JIRA tickets for business context and story points
- Infer metrics from PR descriptions when exact numbers aren't available
- Use relative terms ("significantly improved", "major reduction") if specific metrics unavailable
- Group PRs by project rather than listing individually
- Match tone/format of existing resume if one is provided
```

**Step 3: Commit**

```bash
git add .agent/skills/work-chronicler-generate-resume-bullets/
git commit -m "$(cat <<'EOF'
feat(skills): add work-chronicler-generate-resume-bullets skill

Migrated from .claude/commands/generate-resume-bullets.md
EOF
)"
```

---

## Task 9: Migrate write-self-review skill

**Files:**
- Create: `.agent/skills/work-chronicler-write-self-review/SKILL.md`

**Step 1: Create directory**

```bash
mkdir -p .agent/skills/work-chronicler-write-self-review
```

**Step 2: Create SKILL.md**

Create `.agent/skills/work-chronicler-write-self-review/SKILL.md`:

```markdown
---
name: work-chronicler-write-self-review
description: Use when drafting self-review content for performance reviews. Analyzes work history to create structured review narratives.
user-invocable: true
---

# Write Self-Review

Draft self-review content for performance reviews using the user's work history.

## Workspace

**Active profile:** !`work-chronicler workspace profile`
**Work log:** !`work-chronicler workspace work-log`
**Analysis:** !`work-chronicler workspace analysis`

> **For non-Claude tools:** Run `work-chronicler workspace work-log` to get your data path.

## User Input

You can optionally provide:
- **Self-review prompt/questions**: If your company provides specific questions or prompts to answer
- **Review format template**: If you have a specific format to follow
- **Review period**: The time range to focus on (e.g., "Q4 2025", "2025 annual review")
- **Focus areas**: Specific themes or projects to emphasize

Example: `/work-chronicler-write-self-review Q4 2025, focus on platform work, here are the review questions: [paste questions]`

If the user provides their own format or questions, prioritize answering those over the default structure below.

## Data Location

Work data is stored in the workspace work-log directory:

```
<work-log>/
├── filtered/               # ⭐ USE THIS IF IT EXISTS (pre-filtered subset)
├── .analysis/
│   ├── stats.json      # Impact breakdown, repo stats
│   ├── projects.json   # Detected project groupings
│   └── timeline.json   # Chronological view
├── pull-requests/
│   └── <org>/<repo>/*.md
├── jira/
│   └── <org>/<project>/*.md
├── performance-reviews/ # IMPORTANT: Past reviews for format/context
├── resumes/            # User's resume for accomplishment framing
└── notes/              # User's goals, highlights, areas to emphasize
```

## Instructions

1. **Read supporting documents first** (critical for context):
   - `performance-reviews/` - Match format, understand what's valued
   - `notes/` - User's goals and what they want to highlight
   - Past reviews show company format, rating criteria, and expectations

2. **Read analysis files**:
   - `stats.json` - Overall impact distribution
   - `projects.json` - Major project groupings (focus on high confidence)
   - `timeline.json` - Activity trends, busiest periods

3. **Focus on flagship and major impact work**:
   - These represent the most significant contributions
   - Cross-reference with ticket summaries for business context
   - Group related work into narrative themes

4. **Structure for self-review**:
   - **Accomplishments**: What was delivered, with quantifiable impact
   - **Impact**: How it helped the team, product, or business
   - **Growth**: Skills developed, challenges overcome
   - **Collaboration**: Cross-team work, mentorship, knowledge sharing
   - **Goals**: How work aligned with or exceeded goals

## Output Location

Save generated documents to `generated/self-review-YYYY-MM-DD.md` in the workspace root.

## Output Format

Structure depends on company format (from past reviews). If no past reviews, use this structure:

```markdown
## Self-Review: [Review Period]

### Summary
[2-3 sentence overview of key accomplishments and impact]

### Key Accomplishments

#### [Project/Theme 1]
**What I did**: [Description of work]
**Impact**: [Measurable outcomes, business value]
**PRs/Tickets**: [Key references]

#### [Project/Theme 2]
**What I did**: [Description of work]
**Impact**: [Measurable outcomes, business value]
**PRs/Tickets**: [Key references]

### Technical Growth
- [Skills developed or deepened]
- [New technologies or practices adopted]
- [Technical challenges overcome]

### Collaboration & Leadership
- [Cross-team initiatives]
- [Mentorship or knowledge sharing]
- [Process improvements]

### Alignment with Goals
[How work aligned with or exceeded stated goals]

### Looking Ahead
[Areas for continued growth, upcoming focus areas]
```

## Tips

- Match the tone and format of previous self-reviews if available
- Use specific numbers and metrics when possible
- Connect technical work to business outcomes
- Highlight work that demonstrates growth from feedback
- Be specific about YOUR contribution vs team work
- Include both planned work and unplanned wins (incidents handled, etc.)
- Reference the timeline for seasonal patterns (launches, migrations, etc.)
```

**Step 3: Commit**

```bash
git add .agent/skills/work-chronicler-write-self-review/
git commit -m "$(cat <<'EOF'
feat(skills): add work-chronicler-write-self-review skill

Migrated from .claude/commands/write-self-review.md
EOF
)"
```

---

## Task 10: Migrate update-resume skill

**Files:**
- Create: `.agent/skills/work-chronicler-update-resume/SKILL.md`

**Step 1: Create directory**

```bash
mkdir -p .agent/skills/work-chronicler-update-resume
```

**Step 2: Create SKILL.md**

Create `.agent/skills/work-chronicler-update-resume/SKILL.md`:

```markdown
---
name: work-chronicler-update-resume
description: Use when updating an existing resume with recent accomplishments from work history. Matches existing resume format and tone.
user-invocable: true
---

# Update Resume

Update the user's existing resume with accomplishments from their work history.

## Workspace

**Active profile:** !`work-chronicler workspace profile`
**Work log:** !`work-chronicler workspace work-log`
**Analysis:** !`work-chronicler workspace analysis`

> **For non-Claude tools:** Run `work-chronicler workspace work-log` to get your data path.

## User Input

You can optionally provide:
- **Resume file path**: Specific resume to update (e.g., `resume-2025.md`)
- **Time period**: Date range for new accomplishments (e.g., "last 6 months", "2025")
- **Focus areas**: Specific types of work to emphasize

Example: `/work-chronicler-update-resume resume.md, focus on platform and infrastructure work from 2025`

## Data Location

Work data is stored in the workspace work-log directory:

```
<work-log>/
├── filtered/               # ⭐ USE THIS IF IT EXISTS (pre-filtered subset)
├── .analysis/
│   ├── stats.json      # Impact breakdown, repo stats
│   ├── projects.json   # Detected project groupings
│   └── timeline.json   # Chronological view
├── pull-requests/
│   └── <org>/<repo>/*.md
├── jira/
│   └── <org>/<project>/*.md
├── resumes/            # ⭐ FIND EXISTING RESUME(S) HERE
├── performance-reviews/ # Past reviews for context (prioritize recent)
└── notes/              # User's goals and highlights
```

## Instructions

### Step 1: Find and Read Existing Resume

1. **Search for resume files**:
   - Check `resumes/` directory in the work-log
   - Look for common filenames: `resume.md`, `resume.pdf`, `*.resume.*`, `cv.*`
   - Ask user if no resume is found

2. **Understand current resume structure**:
   - Note the formatting style (markdown, bullets, sections)
   - Identify existing experience entries and their format
   - Note the level of detail and tone used
   - Identify which sections need updating (usually recent experience)

### Step 2: Gather Context from Supporting Documents

1. **Read recent performance reviews** (prioritize by recency):
   - **Prioritize reviews from the last 1-2 years** - these reflect current role and impact
   - Use older reviews only for career progression context, not accomplishments
   - Extract themes: what was valued, what feedback was given, growth areas

2. **Read notes** (if present):
   - Note what the user wants to highlight or emphasize
   - Check for career goals that accomplishments should support

### Step 3: Analyze Work Data

1. **Read analysis files** (from filtered/ if exists):
   - `stats.json` - Impact distribution
   - `projects.json` - High-confidence project groupings
   - `timeline.json` - Recent activity trends

2. **Focus on high-impact work**:
   - **Flagship** PRs: Major initiatives, lead with these
   - **Major** PRs: Significant features worth highlighting
   - Skip minor/standard unless they support a larger narrative

### Step 4: Generate Resume Updates

1. **Match the existing resume format exactly**:
   - Use same heading styles, bullet formats, and tone
   - Maintain consistent level of detail
   - Keep the same section structure

2. **Create new accomplishment bullets**:
   - Start with strong action verbs
   - Quantify impact when possible
   - Connect technical work to business outcomes
   - Group related PRs into cohesive achievements

3. **Prioritize recency**:
   - Most recent accomplishments should come first
   - Phase out older accomplishments that are less relevant
   - Suggest which older items might be condensed or removed

## Output Location

Save generated documents to `generated/resume-updated-YYYY-MM-DD.md` in the workspace root.

## Output Format

```markdown
## Resume Update Suggestions

### Context
- **Resume file**: [path to resume found]
- **Work data period**: [date range analyzed]
- **Recent reviews referenced**: [list of review files, by recency]

### New Experience Bullets

These accomplishments from your work history should be added to your resume:

#### [Most Recent Position/Company Section]

**Add these bullets** (suggested placement: top of section):

- **[Achievement 1]** - [Action verb + what you did + impact/outcome]
  - *Based on*: [PR refs or project name]

- **[Achievement 2]** - [Action verb + what you did + impact/outcome]
  - *Based on*: [PR refs or project name]

#### Suggested Removals/Condensing

To keep resume length appropriate, consider:
- Condensing: [older bullet that could be shortened]
- Removing: [bullet that's now less relevant]

### Updated Resume Section

Here's how the [relevant section] of your resume would look with these changes:

---
[Full updated section in exact format of original resume]
---

### Review Alignment

These additions align with themes from your recent reviews:
- [Theme from recent review] → [Which accomplishments support it]
- [Growth area from review] → [Evidence of growth in new work]
```

## Tips

- **Recency matters**: Recent performance reviews (1-2 years) are most relevant for current role framing
- **Don't just list PRs**: Group related work into cohesive narratives
- **Match tone exactly**: A formal resume needs formal language; a casual one can be more conversational
- **Business impact > technical details**: "Reduced costs by 40%" > "Migrated to microservices"
- **Show growth**: If reviews mentioned areas for improvement, highlight work that shows that growth
- **Keep it scannable**: Hiring managers skim; front-load the most impressive parts of each bullet
```

**Step 3: Commit**

```bash
git add .agent/skills/work-chronicler-update-resume/
git commit -m "$(cat <<'EOF'
feat(skills): add work-chronicler-update-resume skill

Migrated from .claude/commands/update-resume.md
EOF
)"
```

---

## Task 11: Migrate detect-projects skill

**Files:**
- Create: `.agent/skills/work-chronicler-detect-projects/SKILL.md`

**Step 1: Create directory**

```bash
mkdir -p .agent/skills/work-chronicler-detect-projects
```

**Step 2: Create SKILL.md**

Create `.agent/skills/work-chronicler-detect-projects/SKILL.md`:

```markdown
---
name: work-chronicler-detect-projects
description: Use when analyzing work history to identify major projects and group related PRs and tickets together.
user-invocable: true
---

# Detect Projects

Analyze work history to identify major projects and group related work.

## Workspace

**Active profile:** !`work-chronicler workspace profile`
**Work log:** !`work-chronicler workspace work-log`
**Analysis:** !`work-chronicler workspace analysis`

> **For non-Claude tools:** Run `work-chronicler workspace work-log` to get your data path.

**Note**: Project detection is now built into the CLI. Run `work-chronicler analyze --projects` to generate `projects.json`. This skill is for reviewing and refining those results.

## Data Location

```
<work-log>/
├── filtered/               # ⭐ USE THIS IF IT EXISTS (pre-filtered subset)
│   ├── .analysis/
│   ├── pull-requests/
│   └── jira/
├── .analysis/
│   ├── projects.json   # Pre-computed project groupings (use this first!)
│   ├── stats.json      # Impact breakdown, repo stats
│   └── timeline.json   # Chronological view
├── pull-requests/
│   └── <org>/<repo>/*.md
└── jira/
    └── <org>/<project>/*.md
```

## Instructions

1. **Start with projects.json** (if it exists):
   - Contains pre-detected project groupings
   - Has confidence levels: high, medium, low
   - High confidence = PRs share JIRA ticket references
   - Low confidence = time-based clustering (may need refinement)

2. **Review and refine groupings**:
   - Merge related projects that were detected separately
   - Split projects that are too broad
   - Add context from ticket summaries and PR descriptions
   - Identify themes across projects

3. **For manual detection** (if projects.json doesn't exist):
   - Look for shared JIRA ticket references across PRs
   - Check ticket prefixes (e.g., AUTH-*, PERF-*)
   - Consider temporal clustering (work in same 2-4 week period)
   - Use PR labels and repository patterns

## Project Summary Format

For each project, gather:
- Name/theme (from primary ticket or inferred)
- Time period (earliest to latest PR)
- Related PRs and tickets
- Total scope (lines changed, PR count)
- Impact level distribution
- Key outcomes or deliverables

## Example Output

```markdown
## Detected Projects

### 1. Authentication Overhaul (High Confidence)
**Period**: January - March 2025
**Scope**: 5 PRs, 4 tickets, +5,200 / -1,800 lines
**Impact**: 3 flagship, 2 major

**Tickets**:
- DWP-575: Add cursor command for creating jira ticket
- DWP-576: Create honeycomb-env package
- DWP-577: Refactor helm charts
- DWP-578: Update deployment scripts

**Key Deliverables**:
- OAuth2 integration with multiple providers
- TOTP-based MFA support
- Secure session handling with refresh tokens

---

### 2. Performance Optimization (High Confidence)
**Period**: April - June 2025
**Scope**: 8 PRs, 3 tickets, +3,100 / -900 lines
**Impact**: 2 flagship, 4 major, 2 standard

**Tickets**:
- DWP-463: Eater app lambda optimization
- DWP-529: Caching layer implementation
- DWP-530: Database query optimization

**Key Deliverables**:
- 73% reduction in API latency
- 60% reduction in database load

---

### 3. Unrelated Work Cluster (Low Confidence - Needs Review)
**Period**: July 2025
**Scope**: 12 PRs, 0 tickets, +800 / -200 lines

*This cluster was detected by time proximity. Review PRs to determine if they form a cohesive project or should be split.*

PRs: #4074, #4091, #4094, #4096, #4098, #4103, #4104, #4109, #4110, #4114, #4120, #4126
```

## Tips

- High confidence projects are most reliable - start there
- Low confidence projects may need manual review
- Look for patterns in PR titles that suggest related work
- Consider the "filtered/" directory if you only want to see significant work
- Check timeline.json to understand when projects overlapped
```

**Step 3: Commit**

```bash
git add .agent/skills/work-chronicler-detect-projects/
git commit -m "$(cat <<'EOF'
feat(skills): add work-chronicler-detect-projects skill

Migrated from .claude/commands/detect-projects.md
EOF
)"
```

---

## Task 12: Migrate detect-themes skill

**Files:**
- Create: `.agent/skills/work-chronicler-detect-themes/SKILL.md`

**Step 1: Create directory**

```bash
mkdir -p .agent/skills/work-chronicler-detect-themes
```

**Step 2: Create SKILL.md**

Create `.agent/skills/work-chronicler-detect-themes/SKILL.md`:

```markdown
---
name: work-chronicler-detect-themes
description: Use when identifying recurring themes in work history for career narrative and skill development tracking.
user-invocable: true
---

# Detect Themes

Identify recurring themes in work history for career narrative and skill development tracking.

## Workspace

**Active profile:** !`work-chronicler workspace profile`
**Work log:** !`work-chronicler workspace work-log`
**Analysis:** !`work-chronicler workspace analysis`

> **For non-Claude tools:** Run `work-chronicler workspace work-log` to get your data path.

## Data Location

Work data is stored in the workspace work-log directory:

```
<work-log>/
├── filtered/               # ⭐ USE THIS IF IT EXISTS (pre-filtered subset)
├── .analysis/
│   ├── stats.json      # Impact breakdown, repo stats
│   ├── projects.json   # Detected project groupings
│   └── timeline.json   # Chronological view
├── pull-requests/
│   └── <org>/<repo>/*.md
├── jira/
│   └── <org>/<project>/*.md
├── performance-reviews/ # Past reviews - themes valued by company
├── resumes/            # Career narrative and positioning
└── notes/              # User's growth goals and focus areas
```

## Instructions

1. **Read supporting documents first**:
   - `notes/` - User's stated goals and areas of focus
   - `performance-reviews/` - Themes company has recognized/valued
   - `resumes/` - Existing career narrative to build upon

2. **Read analysis files**:
   - `projects.json` - Project groupings for pattern detection
   - `stats.json` - Distribution across repos and impact levels
   - `timeline.json` - Temporal patterns in work

3. **Identify themes across multiple dimensions**:

   **Technical Areas**:
   - Infrastructure (deployment, CI/CD, monitoring)
   - Security (auth, permissions, compliance)
   - Performance (optimization, caching, scaling)
   - Architecture (system design, migrations, refactoring)
   - Frontend/Backend/Fullstack work

   **Business Impact**:
   - Revenue/Growth (features that drive business)
   - Reliability (reducing incidents, improving uptime)
   - Efficiency (automation, tooling, developer experience)
   - Customer-facing (user experience, new capabilities)

   **Skill Development**:
   - New technologies or languages adopted
   - Increasing complexity/scope over time
   - Leadership patterns (leading projects, mentoring)
   - Cross-team collaboration

4. **Look for patterns**:
   - Conventional commit types (feat, fix, refactor, perf)
   - Repository/project clustering
   - JIRA project prefixes and issue types
   - PR titles and descriptions keywords
   - Timeline trends (what themes emerged when?)

## Output Format

```markdown
## Work Themes Analysis

### Technical Themes

#### 1. [Theme Name] (X PRs, Y% of flagship work)
**Description**: [What this theme encompasses]
**Key Projects**: [From projects.json]
**Skills Demonstrated**: [Technologies, patterns, practices]
**Evolution**: [How this area developed over time]

Example PRs:
- [PR title] (org/repo#123) - [impact level]
- [PR title] (org/repo#456) - [impact level]

---

#### 2. [Theme Name] (X PRs, Y% of flagship work)
...

### Business Impact Themes

#### [Theme Name]
**Description**: [How work connected to business outcomes]
**Contributions**: [Key deliverables]
**Measurable Impact**: [Metrics if available]

### Career Narrative

**Primary Identity**: [What defines this person's work - e.g., "Platform Engineer focused on developer experience and reliability"]

**Growth Trajectory**: [How themes show progression]

**Differentiators**: [What makes this work stand out]

### Recommendations

**Strengths to Emphasize**:
- [Theme that should be highlighted for career development]

**Emerging Areas**:
- [New themes that show growth direction]

**Potential Gaps**:
- [Areas that might benefit from more focus]
```

## Example Theme

```markdown
#### 1. Platform Infrastructure (45 PRs, 65% of flagship work)
**Description**: Building and maintaining deployment infrastructure, CI/CD pipelines, and developer tooling.

**Key Projects**:
- Multi-region Kubernetes deployment (high confidence)
- CI/CD pipeline overhaul (high confidence)
- Developer environment automation (medium confidence)

**Skills Demonstrated**: Kubernetes, Helm, GitHub Actions, Terraform, AWS

**Evolution**:
- Q1: Individual deployment improvements
- Q2: Led complete CI/CD redesign
- Q3-Q4: Expanded to multi-region architecture

Example PRs:
- "feat: Add multi-region helm chart support" (org/platform#234) - flagship
- "refactor: Migrate CI from Jenkins to GitHub Actions" (org/platform#189) - flagship
- "feat: Add automatic rollback on deployment failure" (org/platform#267) - major
```

## Tips

- Look for themes that appear consistently across time periods
- Connect technical themes to business impact when possible
- Use timeline.json to understand how themes evolved
- Consider what themes from past reviews/notes should be prioritized
- Identify themes that could strengthen career narrative
- Note themes that represent growth or new directions
```

**Step 3: Commit**

```bash
git add .agent/skills/work-chronicler-detect-themes/
git commit -m "$(cat <<'EOF'
feat(skills): add work-chronicler-detect-themes skill

Migrated from .claude/commands/detect-themes.md
EOF
)"
```

---

## Task 13: Remove old command directories

**Files:**
- Delete: `.claude/commands/` (all files except create-pr.md and start-agent-project.md)
- Delete: `.cursor/commands/` (all files except create-pr.md and start-agent-project.md)

**Step 1: Remove migrated command files**

```bash
# Remove migrated commands from .claude/commands/
rm .claude/commands/summarize-work.md
rm .claude/commands/generate-resume-bullets.md
rm .claude/commands/write-self-review.md
rm .claude/commands/update-resume.md
rm .claude/commands/detect-projects.md
rm .claude/commands/detect-themes.md

# Remove migrated commands from .cursor/commands/
rm .cursor/commands/summarize-work.md
rm .cursor/commands/generate-resume-bullets.md
rm .cursor/commands/write-self-review.md
rm .cursor/commands/update-resume.md
rm .cursor/commands/detect-projects.md
rm .cursor/commands/detect-themes.md
```

Note: Keep `create-pr.md` and `start-agent-project.md` as they are repo-specific development commands, not user-facing skills.

**Step 2: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
chore: remove migrated command files

Commands have been migrated to .agent/skills/ as portable skills.
Kept create-pr.md and start-agent-project.md as repo-specific dev commands.
EOF
)"
```

---

## Task 14: Update documentation

**Files:**
- Modify: `CLAUDE.md`
- Modify: `README.md`

**Step 1: Update CLAUDE.md project structure**

Add `.agent/skills/` to the project structure in `CLAUDE.md` and update the AI commands section:

Find and update the project structure section to include:
```
├── .agent/
│   └── skills/             # Portable AI skills (installed via `skills install`)
│       ├── work-chronicler-summarize-work/
│       ├── work-chronicler-generate-resume-bullets/
│       ├── work-chronicler-write-self-review/
│       ├── work-chronicler-update-resume/
│       ├── work-chronicler-detect-projects/
│       └── work-chronicler-detect-themes/
```

Update the tooling architecture section to reflect the new skills structure.

**Step 2: Update README.md**

Add a section about skill installation:

```markdown
## AI Skills Installation

work-chronicler includes AI skills that can be installed to your preferred coding assistant:

```bash
# Install skills to Claude Code, Cursor, etc.
work-chronicler skills install

# See where skills are installed
work-chronicler skills list

# Remove installed skills
work-chronicler skills uninstall
```

### Available Skills

After installation, these skills are available as slash commands:

- `/work-chronicler-summarize-work` - Summarize work for reviews
- `/work-chronicler-generate-resume-bullets` - Create resume bullet points
- `/work-chronicler-write-self-review` - Draft self-review content
- `/work-chronicler-update-resume` - Update existing resume
- `/work-chronicler-detect-projects` - Identify project groupings
- `/work-chronicler-detect-themes` - Find recurring themes
```

**Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "$(cat <<'EOF'
docs: update documentation for portable skills

- Add .agent/skills/ to project structure
- Document skills install/list/uninstall commands
- List available skills and their purposes
EOF
)"
```

---

## Task 15: Test end-to-end

**Step 1: Build the project**

Run: `pnpm build`
Expected: PASS

**Step 2: Test workspace commands**

Run: `pnpm cli workspace --help`
Expected: Shows profile, work-log, analysis, root subcommands

Run: `pnpm cli workspace profile` (after init)
Expected: Outputs active profile name

**Step 3: Test skills commands**

Run: `pnpm cli skills list`
Expected: Shows "(not installed)" for all tools

Run: `pnpm cli skills install`
Expected: Interactive wizard works, skills are copied/symlinked

Run: `pnpm cli skills list`
Expected: Shows installed skills

Run: `pnpm cli skills uninstall`
Expected: Interactive wizard works, skills are removed

**Step 4: Verify skills work in Claude Code**

Open Claude Code and type `/work-chronicler-summarize-work`
Expected: Skill is found and can be invoked

**Step 5: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address issues found during testing"
```

---

## Summary

This plan implements:

1. **Workspace command** with subcommands for path resolution (profile, work-log, analysis, root)
2. **Skills command** with install, uninstall, and list subcommands
3. **6 portable skills** migrated from `.claude/commands/` to `.agent/skills/`
4. **Cross-provider compatible** skill format with dynamic workspace injection
5. **Documentation updates** for the new features

Total: 15 tasks with bite-sized steps for TDD-style implementation.
