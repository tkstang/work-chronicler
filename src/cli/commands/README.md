# CLI Commands

This directory contains all CLI commands for work-chronicler.

## Directory Structure

```
commands/
├── analyze.ts              # Single-file command
├── link.ts                 # Single-file command
├── mcp.ts                  # Single-file command
├── status.ts               # Single-file command
├── validate.ts             # Single-file command (shares import/import.utils.ts)
│
├── fetch/                  # Command with subcommands
│   ├── index.ts            # Parent command (registers subcommands)
│   ├── all.ts              # fetch all subcommand
│   ├── fetch.utils.ts      # Shared utilities
│   │
│   ├── github/             # Complex subcommand (has utils/types)
│   │   ├── index.ts        # fetch github subcommand
│   │   ├── github.utils.ts # GitHub fetching logic
│   │   └── github.types.ts # GitHub-specific types
│   │
│   └── jira/               # Complex subcommand (has utils/types)
│       ├── index.ts        # fetch jira subcommand
│       ├── jira.utils.ts   # JIRA fetching logic
│       └── jira.types.ts   # JIRA-specific types
│
├── filter/                 # Command with utils
│   ├── index.ts            # filter command (options, prompts, summary)
│   └── filter.utils.ts     # Record selection and subset replacement
│
├── import/                 # Complex command (has utils)
│   ├── index.ts            # import command (staged batch → work log)
│   └── import.utils.ts     # Target resolution and output, shared with validate
│
├── init/                   # Complex command (has prompts/utils/types)
│   ├── index.ts            # Main command (validates --mode, dispatches)
│   ├── ic.ts               # IC profile setup flow
│   ├── manager.ts          # Manager profile setup flow
│   ├── init.fetch.ts       # Optional first fetch after IC setup
│   ├── init.prompts.ts     # Interactive prompts
│   ├── init.types.ts       # Types
│   └── init.utils.ts       # Utilities
│
├── reports/                # Command with subcommands (manager mode)
│   ├── index.ts            # Parent command
│   ├── add.ts, list.ts, remove.ts, update.ts
│   └── reports.prompts.ts  # Report prompt shared with `init --mode manager`
│
├── google-docs/            # Command with subcommands (Google Docs settings for skills)
│   ├── index.ts            # Parent command
│   ├── configure.ts        # google-docs configure (the owner account)
│   └── show.ts             # google-docs show (what an import skill reads)
│
├── profile/                # Command with simple subcommands
│   ├── index.ts            # Parent command
│   ├── delete.ts           # profile delete subcommand
│   ├── list.ts             # profile list subcommand
│   └── switch.ts           # profile switch subcommand
│
├── slack/                  # Command with subcommands (Slack settings for skills)
│   ├── index.ts            # Parent command
│   ├── configure.ts        # slack configure (workspace and user)
│   ├── channels.ts         # slack channels add|remove|list
│   ├── show.ts             # slack show (what an import skill reads)
│   └── slack.utils.ts      # Subject resolution (shared with google-docs) and config changes
│
├── skills/                 # Command with simple subcommands + shared types
│   ├── index.ts            # Parent command
│   ├── install.ts          # skills install subcommand
│   ├── installed.ts        # Find installed skills (including broken symlinks)
│   ├── migrate.ts          # Rename migration (old-name detection and removal)
│   ├── list.ts             # skills list subcommand
│   ├── uninstall.ts        # skills uninstall subcommand
│   └── types.ts            # Shared types (AI tools, renamed-skill map)
│
└── workspace/              # Command with simple subcommands
    ├── index.ts            # Parent command
    ├── analysis.ts         # workspace analysis subcommand
    ├── profile.ts          # workspace profile subcommand
    ├── root.ts             # workspace root subcommand
    └── work-log.ts         # workspace work-log subcommand
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

### Errors and Exit Codes

Commands never call `process.exit`. Throw a `CliError` from `@cli/errors`
instead; the entry point (`src/cli/index.ts`) catches it, prints its message
to stderr and its optional `hint` to stdout, and exits with its `exitCode`
(default 1). Any other error prints `Error: <message>` and exits 1.

```typescript
import { CliError, toCliError } from '@cli/errors';

.action(async () => {
  try {
    if (!isManagerMode(getActiveProfile())) {
      throw new CliError(chalk.red('\n❌ Error: manager mode only.'), {
        hint: chalk.gray('Create one with "init --mode manager"'),
      });
    }
    // ...
  } catch (error) {
    // Keeps this command's prefix; a CliError passes through unchanged
    throw toCliError(error, chalk.red('\n❌ Error:'));
  }
});
```

Setting `process.exitCode` without throwing is for runs that finish with
warnings, such as a fetch where an org returned nothing.

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
