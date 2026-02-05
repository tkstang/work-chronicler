# AGENTS.md

This file provides guidance to AI coding assistants when working with this repository.

## Project Overview

**work-chronicler** is a CLI tool and MCP server that helps developers chronicle their work history from GitHub PRs and JIRA tickets for performance reviews and resumes.

### The Problem

Performance review time comes and you need to remember everything you accomplished. You didn't take notes, and now you're scrolling through months of PRs trying to piece together what you did.

### The Solution

Fetch PR descriptions and JIRA tickets, store them as searchable markdown files, and provide AI-ready tooling to analyze and summarize work.

## Project Structure

```
work-chronicler/
├── .agent/
│   └── skills/                 # Portable AI skills (installed via `skills install`)
│       ├── work-chronicler-summarize-work/
│       ├── work-chronicler-generate-resume-bullets/
│       ├── work-chronicler-write-self-review/
│       ├── work-chronicler-update-resume/
│       ├── work-chronicler-detect-projects/
│       └── work-chronicler-detect-themes/
├── src/
│   ├── cli/                    # CLI application (Commander)
│   │   ├── commands/           # CLI commands (see commands/README.md)
│   │   │   ├── fetch/          # Fetch commands (github, jira, all)
│   │   │   ├── init/           # Interactive setup wizard
│   │   │   ├── profile/        # Profile management
│   │   │   ├── skills/         # Skill management (install, uninstall, list)
│   │   │   └── workspace/      # Workspace path resolution
│   │   ├── linker/             # Cross-reference linking
│   │   ├── analyzer/           # Impact analysis and project detection
│   │   └── prompts/            # Interactive CLI prompts
│   ├── mcp/                    # MCP server for AI assistants
│   │   └── server.ts           # MCP SDK, query tools
│   └── core/                   # Shared types, config, storage
│       ├── config/             # Config loading and schema (Zod)
│       ├── storage/            # Markdown file reader/writer
│       ├── workspace/          # Portable workspace and profile management
│       └── types/              # Zod schemas and TypeScript types
├── bin/
│   ├── work-chronicler.js      # CLI entry point
│   └── mcp.js                  # Direct MCP server entry point
├── tools/
│   └── git-hooks/              # Git hook management
├── tsconfig.json               # TypeScript configuration
├── biome.json                  # Linting/formatting config
└── package.json                # Single package (published as work-chronicler)
```

## Path Aliases

The project uses TypeScript path aliases (resolved by tsc-alias at build time):

- `@core/*` → `src/core/*`
- `@mcp/*` → `src/mcp/*`
- `@cli/*` → `src/cli/*`
- `@commands/*` → `src/cli/commands/*`
- `@linker/*` → `src/cli/linker/*`
- `@prompts` → `src/cli/prompts/index.ts`
- `@analyzer/*` → `src/cli/analyzer/*`
- `@config/*` → `src/core/config/*`
- `@storage/*` → `src/core/storage/*`
- `@wc-types/*` → `src/core/types/*`
- `@workspace/*` → `src/core/workspace/*`

**Note:** Local imports should NOT use `.js` extensions - tsc-alias handles resolution. External package subpath imports (like `@modelcontextprotocol/sdk/server/mcp.js`) DO need `.js` extensions.

## Development Commands

```bash
# Install dependencies
pnpm install

# Build the package
pnpm build

# Run CLI during development
pnpm cli <command>

# Run type checking
pnpm type-check

# Run linting
pnpm lint

# Fix lint issues
pnpm lint:fix

# Format code
pnpm format:fix

# Run tests
pnpm test
```

## Before Committing

Run these commands before committing changes:

```bash
# Format, lint, type-check, and test
pnpm format:fix
pnpm lint:fix
pnpm type-check
pnpm test
```

Git hooks will also run lint-staged on commit, but running these manually first catches issues earlier.

## Key Files

- `tsconfig.json` - TypeScript configuration with path aliases
- `biome.json` - Linting and formatting rules
- `work-chronicler.example.yaml` - Example configuration file
- `src/core/index.ts` - Main exports from core module
- `src/cli/index.ts` - CLI entry point
- `src/mcp/server.ts` - MCP server implementation
- `src/cli/commands/README.md` - Command organization conventions

## Tooling Architecture

The project has three layers:

1. **CLI Commands** (programmatic, no AI):
   - `fetch github`, `fetch jira`, `fetch all` - Pull data from sources
   - `link` - Cross-reference PRs ↔ tickets
   - `analyze` - Generate `.analysis/` files
   - `filter` - Filter work-log to a subset
   - `status` - Show current state
   - `init` - Create config file with interactive wizard
   - `mcp` - Start MCP server
   - `profile list|switch|delete` - Manage profiles
   - `workspace profile|work-log|analysis|root` - Output workspace paths
   - `skills install|uninstall|list` - Manage AI skills

2. **AI Skills** (portable, installed via `skills install`):
   - `/work-chronicler-summarize-work` - Summarize PRs for time period
   - `/work-chronicler-generate-resume-bullets` - Create achievement-focused bullet points
   - `/work-chronicler-update-resume` - Update existing resume with new accomplishments
   - `/work-chronicler-write-self-review` - Draft self-review for performance reviews
   - `/work-chronicler-detect-projects` - Identify major project groupings
   - `/work-chronicler-detect-themes` - Identify recurring themes across work

3. **MCP Server** (read-only data access for AI assistants):
   - Exposes work-log data to Claude Desktop, Cursor, etc.
   - Tools: search_prs, search_tickets, get_linked_work, list_repos, get_stats, get_projects, get_timeline

## Data Storage

Work data is stored in markdown files with YAML frontmatter:

```
work-log/
├── pull-requests/<org>/<repo>/<date>_<number>.md
├── jira/<org>/<project>/<key>.md
├── performance-reviews/     # User-added past reviews
├── resumes/                 # User-added existing resume(s)
├── notes/                   # User-added notes and goals
├── .analysis/               # Generated analysis JSON
└── filtered/                # Filtered subset (from filter command)
```

AI-generated documents are saved to `generated/` (gitignored):

```
generated/
├── resume-updated-YYYY-MM-DD.md
├── resume-bullets-YYYY-MM-DD.md
└── self-review-YYYY-MM-DD.md
```

## Dependencies

Key dependencies:

- **CLI**: commander, @octokit/rest, jira.js, chalk, inquirer
- **MCP**: @modelcontextprotocol/sdk
- **Core**: zod, yaml, gray-matter

## Publishing

The package is published to npm as `work-chronicler`.

```bash
# Dry run
pnpm publish --dry-run --no-git-checks

# Publish (automated via GitHub Actions on version tags)
git tag v0.1.0
git push origin v0.1.0
```
