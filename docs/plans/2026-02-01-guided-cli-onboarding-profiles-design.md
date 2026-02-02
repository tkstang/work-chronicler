# Guided CLI Onboarding & Profiles - Design Document

**Date**: 2026-02-01
**Status**: Design Phase
**Phase**: Phase 1 (Roadmap)

## Overview

This document defines the design for guided CLI onboarding and profile management for work-chronicler. The goal is to eliminate manual config editing, make first-run success achievable without reading docs, and support multiple contexts (work, OSS, management).

## Scope

**In Scope (Phase 1):**
- Portable workspace at `~/.work-chronicler/`
- Profile system with isolation
- Interactive `init` wizard (IC flow only)
- GitHub + JIRA source configuration
- Automatic GitHub repo discovery
- Profile management commands

**Out of Scope (Future Phases):**
- Manager/Product persona flows
- Google Docs integration
- Calendar integration
- Web UI
- Skill installation

## Design Principles

1. **Guided over configurable** - Most users never edit config files manually
2. **CLI is the spine** - All functionality accessible via command line
3. **Markdown is canonical** - All data stored as Markdown + YAML frontmatter
4. **Profile isolation** - Complete separation between contexts

---

## 1. Profile Storage & Structure

### Directory Layout

```
~/.work-chronicler/
├── config.json                    # Global config (active profile)
└── profiles/
    ├── default/
    │   ├── config.yaml           # Profile-specific config (YAML)
    │   ├── .env                  # Profile-specific tokens
    │   ├── work-log/             # Fetched data
    │   │   ├── pull-requests/
    │   │   └── jira/
    │   │   ├── notes/            # Optional user notes/context
    │   │   ├── performance-reviews/
    │   │   ├── .analysis/        # Generated analysis (stats/projects/timeline)
    │   │   └── filtered/         # Filtered subset (with its own .analysis/)
    ├── work/
    │   ├── config.yaml
    │   ├── .env
    │   └── ...
    └── oss/
        └── ...
```

### Global Config Structure

**File**: `~/.work-chronicler/config.json` (JSON - machine-managed)

```json
{
  "version": "0.1.0",
  "activeProfile": "work"
}
```

### Profile Config Structure

**File**: `~/.work-chronicler/profiles/{name}/config.yaml` (YAML - human-friendly)

Matches existing `ConfigSchema` structure:

```yaml
github:
  username: "tkstang"
  orgs:
    - name: "voxmedia"
      repos:
        - "duet"
        - "honeycomb"
    - name: "tkstang"
      repos: ['*']

jira:
  instances:
    - name: "Vox Media"
      url: "https://vmproduct.atlassian.net"
      email: "thomas.stang@voxmedia.com"
      projects:
        - "DWP"
        - "VX"

output:
  directory: "./work-log"

fetch:
  since: "2025-01-01"
  until: null

analysis:
  thresholds:
    minor:
      maxLines: 20
      maxFiles: 3
    major:
      minLines: 200
      minFiles: 8
    flagship:
      minLines: 500
      minFiles: 15
```

### Workspace Resolution

**Workspace root priority order:**
1. `--workspace <path>` CLI flag
2. `WORK_CHRONICLER_HOME` environment variable
3. Default: `~/.work-chronicler/`

**Profile resolution priority order:**
1. `--profile <name>` CLI flag
2. `WORK_CHRONICLER_PROFILE` environment variable
3. Active profile in `~/.work-chronicler/config.json`
4. Fallback: `"default"`

### Config Format Rationale

- **Global config (JSON)**: Machine-managed, rarely touched by users
- **Profile configs (YAML)**: Human-friendly, supports comments, easier manual edits
- Wizard writes both formats - users never need to care about the difference

---

## 2. Init Wizard Flow

### Command

```bash
work-chronicler init [--profile <name>]
```

### Wizard Prompts (Sequential)

#### 1. Profile Name

```
What would you like to name this profile?
> default

Validation: alphanumeric + hyphens, no spaces
Default: "default"
```

#### 2. Data Sources (Multi-select)

```
Which data sources would you like to use?

[x] GitHub
[ ] JIRA

At least one required
Use arrow keys, space to select, enter to confirm
```

#### 3. Time Range

```
How far back should we fetch data?

> Last 3 months
  Last 6 months
  Last 12 months
  Custom date range

Calculates fetch.since date based on selection
```

#### 4. GitHub Configuration (if selected)

**4.1 GitHub Username**

```
What's your GitHub username?
> tkstang

Required
```

**4.2 Organizations (Multi-input)**

```
Which GitHub organizations? (one per line, enter to finish)

For personal repos, use your username as the org name

> voxmedia
> tkstang
> facebook
> [enter]

At least one org required
```

**4.3 Repo Discovery (Per Org)**

For each org, prompt:

```
Configuring repos for 'voxmedia'...

How should we find repos in 'voxmedia'?

> Manual entry (fastest)
  Type repo names yourself

  Auto-discover
  Find repos where you have PRs
  Note: Slow for large orgs, may miss old contributions in very active repos

  All repos (slowest)
  Include everything - repos: ['*']
  Note: Can be very slow for large orgs with 100+ repos
```

**If "Manual entry" selected:**

```
Enter repo names for 'voxmedia' (one per line, enter to finish):

> duet
> honeycomb
> terraform
> [enter]

Normalization: Strip org prefix if user enters "voxmedia/duet"
Store as: "duet"
```

**If "Auto-discover" selected:**

```
How many recent PRs per repo should we check?

In active repos, older PRs may be outside this range

> 50 PRs per repo (faster, ~30-60s)
  100 PRs per repo (recommended, ~1-2 min)
  200 PRs per repo (thorough, ~2-5 min)

---

Discovering repos in 'voxmedia' where 'tkstang' has PRs...
Checked 45/120 repos... (1m 23s elapsed)

Found 12 repos:
  - duet
  - honeycomb
  - terraform
  - wp-platform
  - dwp-cli
  - dwp-plt
  - voxmedia-bruno
  - cyclone-app
  - lightray
  - chorus
  - autotune
  - hymnal

Use these 12 repos? (Y/n/e to edit)
> Y

If 'e': Multi-select interface to add/remove repos
```

**Normalization Logic:**

```typescript
// Strip org prefix from GraphQL results
function stripOrgPrefix(nameWithOwner: string, org: string): string {
  const prefix = `${org}/`;
  return nameWithOwner.startsWith(prefix)
    ? nameWithOwner.slice(prefix.length)
    : nameWithOwner;
}

// Apply to:
// - Manual entry input
// - GraphQL discovery results
// - Edit interface selections
```

**If "All repos" selected:**

```
Warning: This will fetch ALL repos in 'voxmedia' (may be slow)

Continue? (Y/n)
> Y

Store as: repos: ['*']
```

#### 5. JIRA Configuration (if selected)

```
JIRA Instance Configuration

Instance name (e.g., "mycompany"):
> Vox Media

JIRA URL:
> https://vmproduct.atlassian.net

Validation: Must be valid HTTPS URL

Email:
> thomas.stang@voxmedia.com

Validation: Must be valid email

Projects (one per line, enter to finish):
> DWP
> VX
> EAT
> [enter]
```

#### 6. Token Setup

```
API tokens are required to fetch data.

Create your tokens at:
  GitHub: https://github.com/settings/tokens
          (Required scopes: repo or public_repo)
  JIRA:   https://id.atlassian.com/manage-profile/security/api-tokens

Do you have your tokens ready? (Y/n)
> Y

GitHub token:
> [masked input: **********************]

JIRA token:
> [masked input: **********************]

---

If user answers 'n':
  Tokens will be saved to: ~/.work-chronicler/profiles/work/.env
  You can add them later before running fetch commands.
```

#### 7. Fetch Now?

```
Profile 'work' created successfully!

Fetch data now? This may take a few minutes. (Y/n)
> Y

[If Y: Run fetch:all with progress spinner]
[If n: Show next steps]
```

### Wizard Output

**Created Files:**
- `~/.work-chronicler/profiles/{name}/config.yaml`
- `~/.work-chronicler/profiles/{name}/.env` (if tokens provided)
- `~/.work-chronicler/config.json` (sets active profile)

**Next Steps Shown:**

```
Profile 'work' created successfully!

Next steps:
  1. Fetch your work history: work-chronicler fetch:all
  2. Check what was fetched: work-chronicler status
  3. Generate a summary: Use /summarize-work in your AI assistant

Switch profiles: work-chronicler profile switch <name>
List profiles: work-chronicler profile list
```

---

## 3. Profile Management Commands

### List Profiles

```bash
work-chronicler profile list
```

**Output:**

```
Available profiles:

  * work      (active)
    default
    oss
    manager

Use 'work-chronicler profile switch <name>' to change profiles
```

### Switch Profile

```bash
work-chronicler profile switch <name>
```

**Behavior:**
- Updates `activeProfile` in `~/.work-chronicler/config.json`
- Validates profile exists
- Shows confirmation message

**Output:**

```
Switched to profile 'oss'

All commands will now use this profile unless overridden with --profile flag
```

### Create Profile

```bash
work-chronicler profile create <name>
```

**Behavior:**
- Launches interactive wizard (same as `init`)
- Pre-populates profile name
- Creates profile directory and config

### Delete Profile

```bash
work-chronicler profile delete <name>
```

**Behavior:**
- Shows confirmation prompt with warning
- Cannot delete active profile (must switch first)
- Deletes entire profile directory

**Output:**

```
Warning: This will permanently delete the 'old-profile' profile and all its data.

Are you sure? (yes/no)
> yes

Profile 'old-profile' deleted successfully
```

### Profile Flag Support

All existing commands accept `--profile` flag:

```bash
# Uses active profile
work-chronicler fetch:all

# Override for single command
work-chronicler --profile oss fetch:all

# Via environment variable
WORK_CHRONICLER_PROFILE=manager work-chronicler status
```

---

## 4. GitHub Repo Discovery

### Implementation

**GraphQL Query:**

```graphql
query($org: String!, $after: String) {
  organization(login: $org) {
    repositories(first: 100, after: $after, orderBy: {field: NAME, direction: ASC}) {
      pageInfo {
        hasNextPage
        endCursor
      }
      nodes {
        nameWithOwner
        pullRequests(first: $prCount, orderBy: {field: CREATED_AT, direction: DESC}, states: [OPEN, CLOSED, MERGED]) {
          nodes {
            author {
              login
            }
          }
        }
      }
    }
  }
}
```

**Algorithm:**

1. Paginate through all repos in org (100 per page)
2. For each repo, fetch N most recent PRs (50/100/200)
3. Filter repos where any PR author matches target username
4. Strip org prefix from `nameWithOwner`
5. Return deduplicated list of repo names

**Progress Indication:**

```typescript
import ora from 'ora';

const spinner = ora('Discovering repos...').start();

// Update on each page
spinner.text = `Checked ${checkedCount}/${totalRepos} repos... (${elapsedTime})`;

// Final
spinner.succeed(`Found ${foundRepos.length} repos`);
```

**Error Handling:**
- GraphQL errors: Display `.errors` array explicitly
- Rate limiting: Show retry message with wait time
- Permission errors: Suggest token scope issues
- Timeout: Warn if taking >2 minutes

---

## 5. File Structure & Organization

### Command Organization Principles

1. **Subcommand groups** get a directory in `subcommands/`
2. **Single commands** stay as single files unless they have supporting files
3. **Dot notation** for supporting files (`.prompts.ts`, `.types.ts`, `.utils.ts`)
4. Supporting files only created when substantial (otherwise inline in `index.ts`)

### Directory Structure

```
src/cli/
├── commands/
│   ├── init/
│   │   ├── index.ts                    # Main init command + wizard
│   │   ├── init.prompts.ts             # Wizard prompts
│   │   ├── init.types.ts               # Init-specific types
│   │   └── init.utils.ts               # Repo discovery logic
│   ├── analyze.ts                      # Single file
│   ├── link.ts                         # Single file
│   ├── status.ts                       # Single file
│   ├── filter.ts                       # Single file
│   ├── mcp.ts                          # Single file
│   └── subcommands/
│       ├── profile/
│       │   ├── index.ts                # Registers profile subcommands
│       │   ├── profile.prompts.ts      # Shared profile prompts
│       │   ├── profile.types.ts        # Shared profile types
│       │   ├── profile.utils.ts        # Shared profile utilities
│       │   ├── list.ts                 # profile list command
│       │   ├── switch.ts               # profile switch command
│       │   ├── create.ts               # profile create command
│       │   └── delete.ts               # profile delete command
│       └── fetch/
│           ├── index.ts                # Registers fetch subcommands
│           ├── github.ts               # fetch:github command
│           ├── github.utils.ts         # GitHub fetcher (from fetchers/)
│           ├── github.prompts.ts       # GitHub discovery prompts
│           ├── jira.ts                 # fetch:jira command
│           ├── jira.utils.ts           # JIRA fetcher (from fetchers/)
│           └── all.ts                  # fetch:all command
├── linker/                             # Existing (multiple files)
└── analyzer/                           # Existing (multiple files)

src/core/
├── workspace/
│   ├── resolver.ts                     # Path resolution utilities
│   ├── profile-manager.ts              # Profile CRUD operations
│   └── global-config.ts                # Global config management
├── config/                             # Existing
├── storage/                            # Existing
└── types/                              # Existing
```

### Path Alias Updates

**tsconfig.json:**

```json
{
  "compilerOptions": {
    "paths": {
      "@commands/*": ["src/cli/commands/*"],
      "@subcommands/*": ["src/cli/commands/subcommands/*"],
      "@core/*": ["src/core/*"],
      "@cli/*": ["src/cli/*"],
      // ... existing aliases
    }
  }
}
```

### Command Registration

**src/cli/index.ts:**

```typescript
import { initCommand } from '@commands/init/index';
import { profileCommand } from '@subcommands/profile/index';
import { fetchCommand } from '@subcommands/fetch/index';
import { analyzeCommand } from '@commands/analyze';
import { linkCommand } from '@commands/link';
import { statusCommand } from '@commands/status';
// ...

program.addCommand(initCommand);
program.addCommand(profileCommand);
program.addCommand(fetchCommand);
program.addCommand(analyzeCommand);
program.addCommand(linkCommand);
program.addCommand(statusCommand);
// ...
```

**src/cli/commands/subcommands/profile/index.ts:**

```typescript
import { Command } from 'commander';
import { listCommand } from './list';
import { switchCommand } from './switch';
import { createCommand } from './create';
import { deleteCommand } from './delete';

export const profileCommand = new Command('profile')
  .description('Manage work-chronicler profiles')
  .addCommand(listCommand)
  .addCommand(switchCommand)
  .addCommand(createCommand)
  .addCommand(deleteCommand);
```

---

## 6. Core Workspace Utilities

### Workspace Resolver

**File**: `src/core/workspace/resolver.ts`

**Purpose**: Centralized path resolution for all workspace operations

**API:**

```typescript
export interface WorkspaceResolver {
  // Get workspace root (~/.work-chronicler/ or custom)
  getWorkspaceRoot(): string;

  // Get profile directory path
  getProfileDir(profileName: string): string;

  // Get profile config path
  getProfileConfigPath(profileName: string): string;

  // Get profile .env path
  getProfileEnvPath(profileName: string): string;

  // Get work-log directory path
  getWorkLogDir(profileName: string): string;

  // Get analysis directory path
  getAnalysisDir(profileName: string): string;

  // Get outputs directory path
  getOutputsDir(profileName: string): string;

  // Ensure profile directories exist
  ensureProfileDirs(profileName: string): void;
}
```

### Profile Manager

**File**: `src/core/workspace/profile-manager.ts`

**Purpose**: Profile CRUD operations and active profile management

**API:**

```typescript
export interface ProfileManager {
  // List all profiles
  listProfiles(): string[];

  // Get active profile name
  getActiveProfile(): string;

  // Set active profile
  setActiveProfile(profileName: string): void;

  // Check if profile exists
  profileExists(profileName: string): boolean;

  // Create new profile
  createProfile(profileName: string, config: Config): void;

  // Delete profile
  deleteProfile(profileName: string): void;

  // Load profile config
  loadProfileConfig(profileName: string): Config;

  // Save profile config
  saveProfileConfig(profileName: string, config: Config): void;
}
```

### Global Config Manager

**File**: `src/core/workspace/global-config.ts`

**Purpose**: Manage `~/.work-chronicler/config.json`

**API:**

```typescript
interface GlobalConfig {
  version: string;
  activeProfile: string;
}

export interface GlobalConfigManager {
  // Load global config
  load(): GlobalConfig;

  // Save global config
  save(config: GlobalConfig): void;

  // Get active profile
  getActiveProfile(): string;

  // Set active profile
  setActiveProfile(profileName: string): void;
}
```

---

## 7. Migration & Backward Compatibility

### Existing Users (Repo Mode)

**Current behavior:**
- Config at `./work-chronicler.yaml`
- `.env` at `./.env`
- Work log at `./work-log/`

**Migration strategy:**
- No automatic migration
- Show one-time hint: "Tip: Run `work-chronicler init` to set up workspace mode"
- Existing commands continue to work in repo-relative mode
- Detection: If `~/.work-chronicler/` doesn't exist, use current directory

**Future command (optional):**

```bash
work-chronicler migrate
```

Prompts to migrate current directory config to a profile.

### New Users

New users start directly with workspace mode:
1. Run `work-chronicler init`
2. Creates `~/.work-chronicler/`
3. All data goes to workspace by default

---

## 8. Dependencies

### New Dependencies

```json
{
  "dependencies": {
    "@octokit/graphql": "^7.0.0",    // GraphQL queries for repo discovery
    "ora": "^9.0.0"                   // Already installed - spinner/progress
  }
}
```

### Existing Dependencies (Reused)

- `@inquirer/prompts` - Interactive prompts (already installed)
- `commander` - CLI framework (already installed)
- `zod` - Config validation (already installed)
- `yaml` - YAML parsing (already installed)
- `chalk` - Terminal colors (already installed)

---

## 9. Implementation Phases

### Phase 1: Core Workspace Infrastructure

**Goal**: Establish workspace foundation without breaking existing functionality

**Tasks:**
1. Create `src/core/workspace/` module
   - `resolver.ts` - Path resolution utilities
   - `profile-manager.ts` - Profile CRUD
   - `global-config.ts` - Global config management
2. Add workspace root detection logic
3. Add profile resolution logic
4. Update existing commands to support `--profile` flag
5. Backward compatibility checks

**Validation:**
- Existing repo-mode users unaffected
- New `--profile` flag available on all commands
- Path resolution centralized

### Phase 2: Profile Commands

**Goal**: Enable profile management before init wizard

**Tasks:**
1. Create `src/cli/commands/subcommands/profile/` module
   - `index.ts` - Subcommand registration
   - `list.ts` - List profiles
   - `switch.ts` - Switch active profile
   - `create.ts` - Create profile (basic, no wizard yet)
   - `delete.ts` - Delete profile
2. Implement profile manager API
3. Add profile commands to CLI

**Validation:**
- Can create/list/switch/delete profiles manually
- Active profile persists across sessions
- Profile isolation verified

### Phase 3: GitHub Repo Discovery

**Goal**: Implement auto-discovery before wizard integration

**Tasks:**
1. Create `src/cli/commands/init/init.utils.ts`
   - GraphQL repo discovery implementation
   - Pagination handling
   - Org prefix normalization
   - Progress indication
2. Add error handling
3. Test with various org sizes

**Validation:**
- Discovery works for small orgs (<10 repos)
- Discovery works for large orgs (100+ repos)
- Progress indication clear
- Results normalized correctly

### Phase 4: Init Wizard

**Goal**: Complete guided onboarding experience

**Tasks:**
1. Refactor `src/cli/commands/init/index.ts`
   - Wizard flow implementation
   - Prompt orchestration
2. Create `src/cli/commands/init/init.prompts.ts`
   - All wizard prompts
   - Validation logic
3. Integrate repo discovery
4. Add token collection
5. Optional initial fetch

**Validation:**
- End-to-end wizard flow works
- Config files created correctly
- Tokens stored securely
- Next steps clear to user

### Phase 5: Refactor Fetch Commands

**Goal**: Move fetcher logic into fetch command structure

**Tasks:**
1. Move `fetchers/github.ts` → `commands/subcommands/fetch/github.utils.ts`
2. Move `fetchers/jira.ts` → `commands/subcommands/fetch/jira.utils.ts`
3. Delete `fetchers/` directory
4. Update imports
5. Verify all fetch commands work

**Validation:**
- All fetch commands work with new structure
- No broken imports
- Tests pass (if any)

---

## 10. Testing Strategy

### Manual Testing Checklist

**Workspace & Profiles:**
- [ ] Create first profile via `init`
- [ ] Verify workspace created at `~/.work-chronicler/`
- [ ] Create second profile
- [ ] Switch between profiles
- [ ] Verify active profile persists
- [ ] Delete profile (with confirmation)
- [ ] List profiles shows correct state

**Init Wizard:**
- [ ] Complete wizard with GitHub only
- [ ] Complete wizard with JIRA only
- [ ] Complete wizard with both sources
- [ ] Test manual repo entry
- [ ] Test auto-discovery (small org)
- [ ] Test auto-discovery (large org)
- [ ] Test "All repos" option
- [ ] Skip token collection
- [ ] Provide tokens
- [ ] Opt in to initial fetch
- [ ] Opt out of initial fetch

**Repo Discovery:**
- [ ] Discover repos with 50 PR lookback
- [ ] Discover repos with 100 PR lookback
- [ ] Discover repos with 200 PR lookback
- [ ] Verify progress indication
- [ ] Verify org prefix stripped
- [ ] Test with personal repos (username as org)
- [ ] Test with multiple orgs

**Edge Cases:**
- [ ] Invalid profile names
- [ ] Missing tokens
- [ ] Network errors during discovery
- [ ] GraphQL rate limiting
- [ ] Very large orgs (500+ repos)
- [ ] Empty orgs (no repos)
- [ ] Orgs with no PR access

**Backward Compatibility:**
- [ ] Existing repo-mode config still works
- [ ] No automatic migration occurs
- [ ] Migration hint shown once

### Automated Testing (Future)

- Unit tests for workspace resolver
- Unit tests for profile manager
- Integration tests for wizard flow
- Mock GraphQL responses for repo discovery

---

## 11. Documentation Updates

### README.md Updates

**Add sections:**
- Getting Started (init wizard walkthrough)
- Profile Management
- Workspace Structure

### New Documentation Files

- `docs/guides/onboarding.md` - Step-by-step onboarding guide
- `docs/guides/profiles.md` - Profile management guide
- `docs/reference/workspace.md` - Workspace structure reference

---

## 12. Success Criteria

### User Experience Goals

✅ **First-time users succeed without reading docs**
- Complete onboarding in <5 minutes
- Clear prompts with helpful defaults
- No manual config file editing required

✅ **Profile switching is intuitive**
- One command to switch contexts
- Clear indication of active profile
- No data leakage between profiles

✅ **Repo discovery saves time**
- Auto-discover is faster than manual entry for large orgs
- Progress indication during long operations
- Results are accurate and complete

### Technical Goals

✅ **Workspace foundation is solid**
- All paths resolved through centralized utilities
- Profile isolation enforced
- Backward compatibility maintained

✅ **Code is maintainable**
- Clear command organization
- Supporting files co-located with commands
- Consistent naming conventions

✅ **No breaking changes**
- Existing users unaffected
- Opt-in migration path
- All existing commands work

---

## 13. Future Enhancements (Post-Phase 1)

### Phase 2+ Features

**Manager Mode (Phase 4):**
- Per-report workspaces
- Repo discovery by contributor
- Team summaries

**Google Docs Integration (Phase 3):**
- Document discovery
- Interactive selection
- Markdown conversion

**Skill Installation (Phase 2):**
- `work-chronicler install-skills`
- Workspace-aware AI commands

**Web UI (Phase 6):**
- `work-chronicler ui`
- Visual profile management
- Browser-based onboarding

### Additional Commands

```bash
# Re-run repo discovery for existing profile
work-chronicler discover-repos --org voxmedia --prs 100

# Migrate repo-mode config to workspace
work-chronicler migrate

# Export profile (for backup/sharing)
work-chronicler profile export work

# Import profile
work-chronicler profile import ./work-profile.tar.gz
```

---

## 14. Open Questions

None at this time - design is complete and ready for implementation.

---

## 15. Appendix: Example Wizard Session

```
$ work-chronicler init

Welcome to work-chronicler!

Let's set up your first profile.

What would you like to name this profile?
> work

Which data sources would you like to use?

[x] GitHub
[x] JIRA

How far back should we fetch data?

> Last 6 months
  Last 12 months
  Custom date range

What's your GitHub username?
> tkstang

Which GitHub organizations? (one per line, enter to finish)

For personal repos, use your username as the org name

> voxmedia
> tkstang
> [enter]

Configuring repos for 'voxmedia'...

How should we find repos in 'voxmedia'?

> Manual entry (fastest)
  Auto-discover
  All repos (slowest)

[User selects Auto-discover]

How many recent PRs per repo should we check?

> 50 PRs per repo (faster, ~30-60s)
  100 PRs per repo (recommended, ~1-2 min)
  200 PRs per repo (thorough, ~2-5 min)

Discovering repos in 'voxmedia' where 'tkstang' has PRs...
✓ Checked 120/120 repos... (1m 45s elapsed)

Found 12 repos:
  - duet
  - honeycomb
  - terraform
  - wp-platform
  - dwp-cli
  - dwp-plt
  - voxmedia-bruno
  - cyclone-app
  - lightray
  - chorus
  - autotune
  - hymnal

Use these 12 repos? (Y/n/e to edit)
> Y

Configuring repos for 'tkstang'...

How should we find repos in 'tkstang'?

> Manual entry (fastest)
  Auto-discover
  All repos (slowest)

[User selects All repos]

Warning: This will fetch ALL repos in 'tkstang'

Continue? (Y/n)
> Y

JIRA Instance Configuration

Instance name (e.g., "mycompany"):
> Vox Media

JIRA URL:
> https://vmproduct.atlassian.net

Email:
> thomas.stang@voxmedia.com

Projects (one per line, enter to finish):
> DWP
> VX
> EAT
> [enter]

API tokens are required to fetch data.

Create your tokens at:
  GitHub: https://github.com/settings/tokens
          (Required scopes: repo or public_repo)
  JIRA:   https://id.atlassian.com/manage-profile/security/api-tokens

Do you have your tokens ready? (Y/n)
> Y

GitHub token:
> **********************

JIRA token:
> **********************

Profile 'work' created successfully!

Fetch data now? This may take a few minutes. (Y/n)
> Y

✓ Fetching GitHub PRs... (45 PRs found)
✓ Fetching JIRA tickets... (123 tickets found)

Done! Here's what you can do next:

  1. Check what was fetched: work-chronicler status
  2. Link PRs to tickets: work-chronicler link
  3. Generate a summary: Use /summarize-work in your AI assistant

Switch profiles: work-chronicler profile switch <name>
List profiles: work-chronicler profile list
```

---

**End of Design Document**
