# CLI Commands

This directory contains all CLI commands for work-chronicler.

## Directory Structure

```
commands/
├── analyze.ts              # Single-file command
├── filter.ts               # Single-file command
├── link.ts                 # Single-file command
├── mcp.ts                  # Single-file command
├── status.ts               # Single-file command
│
├── fetch/                  # Command with subcommands
│   ├── index.ts            # Parent command (registers subcommands)
│   ├── all.ts              # fetch all subcommand
│   ├── fetch.utils.ts      # Shared utilities
│   |
│   ├── github/             # Complex subcommand (has utils/types)
│   │   ├── index.ts        # fetch github subcommand
│   │   ├── github.utils.ts # GitHub fetching logic
│   │   └── github.types.ts # GitHub-specific types
│   |
│   └── jira/               # Complex subcommand (has utils/types)
│       ├── index.ts        # fetch jira subcommand
│       ├── jira.utils.ts   # JIRA fetching logic
│       └── jira.types.ts   # JIRA-specific types
│
├── init/                   # Complex command (has prompts/utils/types)
│   ├── index.ts            # Main command
│   ├── init.prompts.ts     # Interactive prompts
│   ├── init.types.ts       # Types
│   └── init.utils.ts       # Utilities
│
└── profile/                # Command with simple subcommands
    ├── index.ts            # Parent command
    ├── delete.ts           # profile delete subcommand
    ├── list.ts             # profile list subcommand
    └── switch.ts           # profile switch subcommand
```

## Conventions

### When to Use a Single File

Use a single file (e.g., `analyze.ts`) when:

- The command is self-contained and simple
- No supporting utilities, types, or prompts are needed
- The file stays under ~100-150 lines

### When to Use a Directory

Use a directory structure when:

- The command has subcommands (e.g., `fetch/`, `profile/`)
- The command requires utilities, prompts, or types
- The main command file would exceed ~150 lines

### Directory Layout for Complex Commands

```
command-name/
├── index.ts              # Main command (thin wrapper)
├── command-name.utils.ts # Utility functions
├── command-name.types.ts # TypeScript types
└── command-name.prompts.ts # Interactive prompts (if needed)
```

### Directory Layout for Commands with Subcommands

```
parent-command/
├── index.ts              # Parent command (registers subcommands)
├── parent.utils.ts       # Shared utilities (optional)
├── subcommand-a.ts       # Simple subcommand (single file)
└── subcommand-b/         # Complex subcommand (directory)
    ├── index.ts
    ├── subcommand-b.utils.ts
    └── subcommand-b.types.ts
```

### Import Rules

1. **Same directory (`./`)**: Always allowed

   ```typescript
   import { fetchGitHubPRs } from './github.utils';
   ```

2. **Parent directory (`../`)**: NOT allowed - use path aliases instead

   ```typescript
   // ❌ Don't do this
   import { resolveCacheBehavior } from '../fetch.utils';

   // ✅ Do this instead
   import { resolveCacheBehavior } from '@commands/fetch/fetch.utils';
   ```

3. **Cross-module imports**: Use path aliases

   ```typescript
   import { loadConfig } from '@core/index';
   import { promptUseCache } from '@prompts';
   ```

### Available Path Aliases

| Alias | Maps to |
|-------|---------|
| `@core/*` | `src/core/*` |
| `@commands/*` | `src/cli/commands/*` |
| `@prompts` | `src/cli/prompts/index.ts` |
| `@linker/*` | `src/cli/linker/*` |
| `@analyzer/*` | `src/cli/analyzer/*` |

### Command Registration

All commands are registered in `src/cli/index.ts`:

```typescript
import { fetchCommand } from '@commands/fetch/index';
import { profileCommand } from '@commands/profile/index';

program.addCommand(fetchCommand);
program.addCommand(profileCommand);
```

### Naming Conventions

- **Command files**: Use the command name (e.g., `analyze.ts`, `github.ts`)
- **Utility files**: `{command-name}.utils.ts`
- **Type files**: `{command-name}.types.ts`
- **Prompt files**: `{command-name}.prompts.ts`
- **Parent command index**: `index.ts`

### JSDoc Requirements

All exported functions must have JSDoc documentation:

```typescript
/**
 * Fetch all PRs from GitHub based on config
 *
 * @param options - Fetch options including config, output directory, and flags
 * @returns Array of fetch results per repository
 */
export async function fetchGitHubPRs(
  options: FetchGitHubOptions,
): Promise<GitHubFetchResult[]> {
  // ...
}
```

### Function Parameter Rules

Functions with 3+ parameters should accept a single object:

```typescript
// ❌ Don't do this
function fetchRepoPRs(
  octokit: Octokit,
  org: string,
  repo: string,
  username: string,
  since: Date,
): Promise<Result> { ... }

// ✅ Do this instead
interface FetchRepoPRsParams {
  octokit: Octokit;
  org: string;
  repo: string;
  username: string;
  since: Date;
}

function fetchRepoPRs(params: FetchRepoPRsParams): Promise<Result> { ... }
```
