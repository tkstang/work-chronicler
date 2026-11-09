# AGENTS.md

This file provides guidance to AI coding assistants when working with this repository.

## Project Overview

**work-chronicler** is a CLI tool and MCP server that helps developers chronicle their work history from GitHub PRs and JIRA tickets for performance reviews and resumes.

### The Problem

Performance review time comes and you need to remember everything you accomplished. You didn't take notes, and now you're scrolling through months of PRs trying to piece together what you did.

### The Solution

Fetch PR descriptions and JIRA tickets, store them as searchable markdown files, and provide AI-ready tooling to analyze and summarize work.

User-facing docs: `README.md` (overview and quick start) and the Fumadocs app in `documentation/`, whose authored pages start at `documentation/docs/index.md` (getting started, workflows, and the command, configuration, MCP server and skills reference). `documentation/AGENTS.md` holds the working rules for the docs app.

## Non-Negotiables

- **Code is the source of truth for docs.** Every command, flag, path or MCP tool named in `README.md`, `documentation/` or a skill must exist in `src/`. Update the docs in the same PR as the behavior change.
- **Never touch real user data.** Do not read, write or run the CLI against `~/.work-chronicler/`. Set `WORK_CHRONICLER_HOME` to a temporary directory for manual runs.
- **Never commit secrets** (tokens, `.env`, `.mcp.json`) or build output (`dist/`).
- **AGENTS.md only.** Do not add a `CLAUDE.md` at any level.
- **Conventional Commits** on every commit (enforced by the `commit-msg` hook).
- **The published package ships only `dist`, `bin` and `.agents/skills/work-chronicler-*`.** Repo-local skills and other agent files must stay out of the npm tarball.
- **The CLI and MCP server never call an LLM.** AI work happens in skills, inside the user's assistant.
- **Ask before** changing dependencies, CI workflows, the release process or the config schema in a breaking way.
- **Get buy-in before speculative complexity.** Before adding material complexity for a failure mode that is speculative or very unlikely (concurrent commands racing, clock jumps, crafted input the CLI or a skill never produces) or for an unconfirmed future need, explain to the user the concrete problem, the evidence that it matters, simpler alternatives, and the implementation and maintenance cost, and get their buy-in. This applies to production code, tests and fixtures, and safeguards alike, and to review findings: fix real defects, and bring speculative ones to the user instead of fixing them by default. Do not expand scope silently for theoretical robustness, flexibility or scale. Ordinary regression tests, the required checks, and the established guarantees (privacy of imported content, no data loss in the user's work log or installed skills, atomic imports) still apply.

## Definition of Done

- Use focused checks while editing; before handoff, run one final batch: lint, format, type-check and the test suite (see "Before Committing").
- Run `pnpm build` when entry points, exports, path aliases or package `files` change. When packaging or skills paths change, also check `npm pack --dry-run` and that `skills install` still finds the packaged skills.
- Record commands and results in the PR's Testing section. Re-run affected checks after any input changes.
- CI on the ready PR is the independent proof; a skipped draft run is not verification.
- User-visible changes get an entry under `## [Unreleased]` in `CHANGELOG.md`.
- Update the documentation (`documentation/docs/` pages and `README.md`) and agent instruction files (`AGENTS.md`, package skills, `documentation/AGENTS.md`) in the same PR as any behavior change they describe.

## Project Structure

```
work-chronicler/
├── .agents/
│   └── skills/
│       ├── work-chronicler-*/    # Package skills (published; installed via `skills install`)
│       └── release-notes/        # Repo-local dev workflow skill (not published)
├── .github/                    # CI and release workflows, PR template
├── .oat/                       # OAT project tracking (shared projects tracked; local state ignored)
├── documentation/              # Fumadocs docs app; authored pages in docs/ (docs/index.md is the entry point)
├── src/
│   ├── cli/                    # CLI application (Commander)
│   │   ├── commands/           # CLI commands (see commands/README.md)
│   │   │   ├── fetch/          # Fetch commands (github, jira, all)
│   │   │   ├── filter/         # Filtered subset selection and replacement
│   │   │   ├── init/           # Interactive setup wizard
│   │   │   ├── import/         # Staged import (validate shares it)
│   │   │   ├── profile/        # Profile management
│   │   │   ├── skills/         # Skill management (install, uninstall, list)
│   │   │   ├── google-docs/    # Google Docs settings (configure, show)
│   │   │   ├── slack/          # Slack settings (configure, channels, show)
│   │   │   └── workspace/      # Workspace path resolution
│   │   ├── linker/             # Cross-reference linking
│   │   ├── analyzer/           # Impact analysis and project detection
│   │   └── prompts/            # Interactive CLI prompts
│   ├── mcp/                    # MCP server for AI assistants
│   │   ├── server.ts           # Config resolution and tool registration
│   │   └── tools/              # One module per tool: name, schema, handler(input, context)
│   └── core/                   # Shared types, config, storage
│       ├── config/             # Config loading and schema (Zod)
│       ├── import/             # Import envelope checks, planning and atomic commit
│       ├── linking/            # PR-URL normalization and mention resolution
│       ├── storage/            # Markdown file reader/writer, filtered subset
│       ├── workspace/          # Portable workspace and profile management
│       └── types/              # Zod schemas and TypeScript types
├── bin/
│   ├── work-chronicler.js      # CLI entry point
│   └── mcp.js                  # Direct MCP server entry point
├── tools/
│   └── git-hooks/              # Git hook management
├── AGENTS.md                   # This file (no CLAUDE.md)
├── CHANGELOG.md                # Keep a Changelog
├── CONTRIBUTING.md             # Human contributor guide
├── work-chronicler.example.yaml
├── tsconfig.json               # TypeScript configuration (type-check, includes tests)
├── tsconfig.build.json         # Build config (emits dist/, excludes tests)
├── .oxlintrc.json              # oxlint rules
├── .oxfmtrc.json               # oxfmt formatting
├── pnpm-workspace.yaml         # pnpm settings (minimumReleaseAge, allowBuilds)
└── package.json                # Single package (published as work-chronicler)
```

## Path Aliases

The project uses TypeScript path aliases. They are defined in `tsconfig.json`
without `baseUrl` (TypeScript 7), resolved by tsc-alias at build time and
mirrored in `vitest.config.ts`:

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

Tests are co-located as `src/**/<name>.test.ts`. They import the module under
test with `./` and everything else through the aliases.

**Note:** Local imports should NOT use `.js` extensions - tsc-alias handles resolution. External package subpath imports (like `@modelcontextprotocol/sdk/server/mcp.js`) DO need `.js` extensions.

## Development Commands

```bash
# Install dependencies
pnpm install

# Build the package
pnpm build

# Run CLI during development
pnpm cli <command>

# Run type checking (pnpm type-check is an alias)
pnpm typecheck

# Lint the whole repo with oxlint (lint:fix applies safe fixes)
pnpm lint
pnpm lint:fix

# Format with oxfmt (format:check only reports)
pnpm format
pnpm format:check

# Run tests
pnpm test
```

CI validates ready PRs targeting `main`, including the `ready_for_review`
transition and subsequent code updates. Draft PRs skip the job before runner
allocation. Main-push CI retains its existing scheduling. New ready-PR
verification cancels earlier CI runs for that PR. Draft events and main pushes
use isolated groups. Tagged releases and their publication jobs are outside this
cancellation policy.
The ordinary CI job runs on Node 24 with read-only permissions and a 20-minute
timeout. It and tagged releases run lint, format check, type checking, the test
suite and build. The ordinary CI job then installs the docs app in `documentation/` (its own
lockfile) and verifies it: `oat docs check`,
the nav sync check, the docs build and the committed `documentation/index.md`
manifest's freshness. On PRs, CI then runs the publish dry-run against that build,
reusing the checkout and dependencies with npm registry configuration. Main pushes
do not run the publish dry-run. Tagged releases test the checked-out tag before
publishing; a test failure prevents npm publication and the dependent GitHub
Release. Local checks are unchanged.

## Before Committing

Run these commands before committing changes:

```bash
pnpm format
pnpm lint:fix
pnpm typecheck
pnpm test
```

When you change `documentation/`, also run the docs-app checks listed in
`documentation/AGENTS.md`.

Git hooks run lint-staged (oxlint + oxfmt on staged files) on commit and
commitlint on the message. Pre-push runs only `pnpm typecheck`; post-checkout
reinstalls dependencies only when the lockfile changed.

## Key Files

- `tsconfig.json` - TypeScript configuration with path aliases
- `.oxlintrc.json` / `.oxfmtrc.json` - Lint and format rules
- `pnpm-workspace.yaml` - pnpm supply-chain settings
- `documentation/pnpm-workspace.yaml` - the docs app's own pnpm install root (supply-chain settings and its `overrides` pin)
- `work-chronicler.example.yaml` - Example configuration file
- `src/core/index.ts` - Main exports from core module
- `src/cli/index.ts` - CLI entry point
- `src/mcp/server.ts` - MCP server setup; tool logic lives in `src/mcp/tools/`
- `src/cli/commands/README.md` - Command organization conventions

## Tooling Architecture

The project has four layers:

1. **CLI Commands** (programmatic, no AI):
   - `fetch github`, `fetch jira`, `fetch all` - Pull data from sources
   - `fetch github --reviews`, `fetch all --reviews` - Also fetch PR reviews the user gave (IC only)
   - `import <dir>` - Validate a staged batch of records (from a skill) and commit it atomically (`--report <id>` in manager mode)
   - `validate <dir>` - Check a staged batch without writing
   - `link` - Cross-reference PRs ↔ tickets; report mentions in imported records that resolve (never stored as links)
   - `analyze` - Generate `.analysis/` files
   - `analyze reports <id>` - Per-report analysis (manager mode)
   - `analyze team` - Team-level aggregations (manager mode)
   - `filter` - Replace the `filtered/` subset (built beside it, read back, then swapped in; the previous subset is kept on failure)
   - `status` - Show current state
   - `init` - Create config file with interactive wizard
   - `init --mode manager` - Create manager profile
   - `mcp` - Start MCP server
   - `profile list|switch|delete` - Manage profiles
   - `reports add|list|update|remove` - Manage reports (manager mode)
   - `workspace profile|work-log|analysis|root` - Output workspace paths
   - `skills install|uninstall|list` - Manage AI skills
   - `slack configure`, `slack channels add|remove|list`, `slack show` - Slack settings per IC profile or report (opt-in; `import` enforces them); `show` prints what an import skill uses
   - `google-docs configure`, `google-docs show` - Google Docs settings (the owner account) per IC profile or report (opt-in; `import` enforces ownership and the fetch range, `--since`/`--until` replacing it per batch); `show` prints what an import skill uses

2. **AI Skills** (package skills in `.agents/skills/`, installed via `skills install`):
   - IC mode:
     - `/work-chronicler-summarize-work` - Summarize PRs for time period
     - `/work-chronicler-write-resume-bullets` - Create achievement-focused bullet points
     - `/work-chronicler-update-resume` - Update existing resume with new accomplishments
     - `/work-chronicler-write-self-review` - Draft self-review for performance reviews
     - `/work-chronicler-detect-projects` - Identify major project groupings
     - `/work-chronicler-detect-themes` - Identify recurring themes across work
     - `/work-chronicler-write-peer-review` - Peer reviews; quick mode in any profile, evidence-backed mode with a manager report
   - Slack import (IC and manager profiles; read Slack through the assistant's Slack connector, read-only):
     - `/work-chronicler-setup-slack` - Choose the channels to import from and record them with `slack configure` / `slack channels add`
     - `/work-chronicler-import-slack` - Stage the subject's own messages, then `validate` and `import` them
   - Google Docs import (IC and manager profiles; read Drive with `gog`, read-only, after `google-docs configure`):
     - `/work-chronicler-import-google-docs` - Stage an excerpt of each Google Doc the subject owns, modified in range, then `validate` and `import` them
   - Manager mode (`work-chronicler-manager-*`):
     - `/work-chronicler-manager-write-review-packet` - Evidence-based review content for a direct report
     - `/work-chronicler-manager-write-quarterly-highlights` - Quarterly highlights for one report
     - `/work-chronicler-manager-write-team-summary` - Team-level overview across reports

3. **Repo-local Skills** (dev workflows, not distributed with package):
   - `/release-notes` - Use after tagging a release to generate and update GitHub release notes

4. **MCP Server** (read-only data access for AI assistants):
   - Exposes work-log data to Claude Desktop, Cursor, etc. over stdio
   - Tools (one module each in `src/mcp/tools/`, registered in `src/mcp/server.ts`): `search_prs`, `search_tickets`, `get_linked_work`, `list_repos`, `get_stats`, `get_projects`, `get_timeline`, `search_pr_reviews`, `search_messages`, `search_documents`

## Data Storage

Work data is stored in markdown files with YAML frontmatter:

### IC Mode (Individual Contributor)

```
work-log/
├── pull-requests/<org>/<repo>/<date>_<number>.md
├── pr-reviews/<org>/<repo>/<number>.md  # Reviews the user gave (never authored work)
├── messages/<source>/<hash>.md          # Imported records (`import`); hash of the record identity
├── documents/<source>/<hash>.md         # Imported Google Docs the subject owns (`import`); same hashing
├── jira/<org>/<project>/<key>.md
├── performance-reviews/     # User-added past reviews
├── resumes/                 # User-added existing resume(s)
├── notes/                   # User-added notes and goals
├── .analysis/               # Generated analysis JSON
└── filtered/                # Filtered subset (from filter command; selected while it exists, even empty)
```

Imported records are supplementary evidence: consumers count them apart from
PRs and tickets (or say they cover PRs and tickets only), and resolve their
mentions on read (`src/core/linking/`). Readers ignore `.import-*` and
`.filter-*` entries in the work-log root, and never read imported records
while `.import-transaction/` exists (`ImportInProgressError`). `import`,
`filter` and `filter --clear` share one work-log lock
(`src/core/storage/work-log-lock.ts`, held as `.import-lock` then
`.filter-lock`); `filter` reads records only under it.
Imported Google Docs are Docs the subject owns, not ones they necessarily
wrote: their attribution is always `unverified`, their body is a capped
excerpt (`MAX_DOCUMENT_EXCERPT_BYTES`), and consumers date them by modified
time (`occurredAt`).

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

- **CLI**: commander, @octokit/rest, @octokit/graphql, @inquirer/prompts, chalk, ora, dotenv (JIRA uses its REST API directly; no JIRA client library)
- **MCP**: @modelcontextprotocol/sdk
- **Core**: zod, yaml, gray-matter

## Publishing

The package is published to npm as `work-chronicler`.

Pushing a version tag triggers the `release.yml` GitHub Actions workflow, which:
1. Runs lint, format check, type-check and tests against the checked-out tag
2. Builds and publishes to npm via trusted publishing (GitHub OIDC with
   provenance); no npm token is stored. The tag must match the `package.json`
   version, and an already-published version is skipped
3. Creates a GitHub Release with auto-generated release notes

```bash
# Bump version in package.json, commit, then:
git tag v0.2.0
git push origin main v0.2.0
# CI handles npm publish and GitHub Release creation — do NOT create the release manually
```

After the CI release is created, run `/release-notes` to generate meaningful release notes.

## Skill Conventions

Skills live in `.agents/skills/<name>/` with a `SKILL.md` (uppercase; hosts on case-sensitive filesystems look for that exact name). `src/cli/commands/skills/install.ts` resolves this directory relative to the package root, and `package.json` `files` publishes only the `work-chronicler-*` directories. There are two kinds:

- **Package skills** (`work-chronicler-*`): Distributed with the npm package via `skills install`. These operate on work-log data and are user-facing.

- **Repo-local skills** (no prefix): Dev workflow skills that live in the repo but are not distributed. These help with development tasks like releasing.

Package skill names follow `work-chronicler-[manager-]<verb>-<object>`: a verb from `setup`, `import`, `detect`, `summarize`, `write` or `update`, then the object (`work-chronicler-write-self-review`, `work-chronicler-manager-write-team-summary`). Add `manager-` only when the skill needs a manager profile. Repo-local skills such as `release-notes` are exempt. Renaming a package skill is breaking: add the old → new pair to `RENAMED_SKILLS` in `src/cli/commands/skills/types.ts` so `skills install` migrates it, and note the rename in `CHANGELOG.md`.

When writing skill descriptions, use "Use when..." language to make skills discoverable by AI agents:
- **Good**: `Use when releasing a new version, after tagging, or when the user asks to update release notes.`
- **Bad**: `Generates release notes from git history and updates the GitHub release.`

The "Use when" framing helps agents match skills to user intent. The description should answer "when should I reach for this?" not "what does this do?"

<!-- OAT docs -->
## Documentation

- **Docs root:** `documentation`
- **Framework:** Fumadocs (Next.js + MDX)
- **Docs source index:** `documentation/docs/index.md`
- **Generated index:** `documentation/index.md` — regenerated by `oat docs generate-index`; do not hand-edit.
<!-- END OAT docs -->
