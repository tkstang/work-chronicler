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
│   └── skills/
│       ├── work-chronicler-*/    # Package skills (installed via `skills install`)
│       └── release-notes/        # Repo-local dev workflow skills
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
   - `analyze reports <id>` - Per-report analysis (manager mode)
   - `analyze team` - Team-level aggregations (manager mode)
   - `filter` - Filter work-log to a subset
   - `status` - Show current state
   - `init` - Create config file with interactive wizard
   - `init --mode manager` - Create manager profile
   - `mcp` - Start MCP server
   - `profile list|switch|delete` - Manage profiles
   - `reports add|list|update|remove` - Manage reports (manager mode)
   - `workspace profile|work-log|analysis|root` - Output workspace paths
   - `skills install|uninstall|list` - Manage AI skills

2. **AI Skills** (portable, installed via `skills install`):
   - `/work-chronicler-summarize-work` - Summarize PRs for time period
   - `/work-chronicler-generate-resume-bullets` - Create achievement-focused bullet points
   - `/work-chronicler-update-resume` - Update existing resume with new accomplishments
   - `/work-chronicler-write-self-review` - Draft self-review for performance reviews
   - `/work-chronicler-detect-projects` - Identify major project groupings
   - `/work-chronicler-detect-themes` - Identify recurring themes across work

3. **Repo-local Skills** (dev workflows, not distributed with package):
   - `/release-notes` - Use after tagging a release to generate and update GitHub release notes

4. **MCP Server** (read-only data access for AI assistants):
   - Exposes work-log data to Claude Desktop, Cursor, etc.
   - Tools: search_prs, search_tickets, get_linked_work, list_repos, get_stats, get_projects, get_timeline

## Data Storage

Work data is stored in markdown files with YAML frontmatter:

### IC Mode (Individual Contributor)

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

### Manager Mode

```
profiles/manager/
├── reports/
│   ├── alice-smith/
│   │   ├── work-log/            # Same structure as IC mode
│   │   │   ├── pull-requests/...
│   │   │   └── jira/...
│   │   ├── analysis/            # Per-report analysis
│   │   ├── performance-reviews/ # Optional: Past reviews
│   │   └── notes/               # Optional: Manager notes
│   └── bob-jones/...
└── analysis/                    # Team-level aggregations
    ├── team-projects.json
    ├── contributor-matrix.json
    └── team-timeline.json
```

AI-generated documents are saved to `outputs/`:

```
outputs/
├── resume-updated-YYYY-MM-DD.md
├── resume-bullets-YYYY-MM-DD.md
├── self-review-YYYY-MM-DD.md
├── work-summary-YYYY-MM-DD.md
├── projects-detected-YYYY-MM-DD.md
└── themes-detected-YYYY-MM-DD.md
```

Note: Manager mode uses `reports/<id>/outputs/` for per-report generated documents.

## Dependencies

Key dependencies:

- **CLI**: commander, @octokit/rest, jira.js, chalk, inquirer
- **Google Docs**: googleapis, google-auth-library
- **MCP**: @modelcontextprotocol/sdk
- **Core**: zod, yaml, gray-matter

## Publishing

The package is published to npm as `work-chronicler`.

Pushing a version tag triggers the `release.yml` GitHub Actions workflow, which:
1. Runs lint and type-check
2. Builds and publishes to npm (requires `NPM_TOKEN` secret)
3. Creates a GitHub Release with auto-generated release notes

```bash
# Bump version in package.json, commit, then:
git tag v0.2.0
git push origin main v0.2.0
# CI handles npm publish and GitHub Release creation — do NOT create the release manually
```

After the CI release is created, run `/release-notes` to generate meaningful release notes.

## Skill Conventions

Skills live in `.agent/skills/<name>/skill.md`. There are two kinds:

- **Package skills** (`work-chronicler-*`): Distributed with the npm package via `skills install`. These operate on work-log data and are user-facing.
- **Repo-local skills** (no prefix): Dev workflow skills that live in the repo but are not distributed. These help with development tasks like releasing.

When writing skill descriptions, use "Use when..." language to make skills discoverable by AI agents:
- **Good**: `Use when releasing a new version, after tagging, or when the user asks to update release notes.`
- **Bad**: `Generates release notes from git history and updates the GitHub release.`

The "Use when" framing helps agents match skills to user intent. The description should answer "when should I reach for this?" not "what does this do?"
