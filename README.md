# work-chronicler

Gather, analyze, and summarize your work history from GitHub PRs, JIRA tickets and other documents for performance reviews, resumes or self-evaluation.

## The Problem

Performance review time rolls around and you need to:
- Remember everything you accomplished in the past year
- Write compelling bullet points for your self-review
- Update your resume with recent achievements

But you didn't take notes, and now you're scrolling through months of PRs trying to piece together what you did.

## The Solution

`work-chronicler` fetches your PR descriptions and JIRA tickets, stores them locally as searchable markdown files, and provides AI-ready tooling to analyze and summarize your work.

## Quick Start

### Local Development (this repo)

Use `pnpm cli` instead of `work-chronicler`:

```bash
pnpm install
pnpm cli init
pnpm cli fetch:all
```

### Published Package Usage

After the package is published to npm:

```bash
# Install globally
npm install -g work-chronicler

# Initialize - interactive wizard guides you through setup
work-chronicler init

# Fetch your work history
work-chronicler fetch:all

# Analyze and generate stats
work-chronicler analyze --projects --timeline

# Check what you have
work-chronicler status
```

Data is stored in `~/.work-chronicler/profiles/<profile-name>/` with isolated configs, tokens, and work logs per profile.

## Usage

work-chronicler uses a portable workspace at `~/.work-chronicler/` with support for multiple profiles. Each profile has its own config, tokens, and work log.

```bash
# Initialize with interactive wizard (creates profile)
work-chronicler init

# Fetch from GitHub and JIRA
work-chronicler fetch:all

# Cross-reference PRs ↔ tickets
work-chronicler link

# Generate analysis files
work-chronicler analyze --projects --timeline

# Check status
work-chronicler status

# Use a specific profile for any command
work-chronicler fetch:all --profile work
work-chronicler status --profile personal
```

> **Note**: For local development in this repo, prefix all commands with `pnpm cli` (e.g., `pnpm cli init`).

### Profiles

Profiles let you maintain separate work histories (e.g., work vs personal, different employers):

```bash
# List all profiles
work-chronicler profile list

# Switch active profile
work-chronicler profile switch work

# Delete a profile
work-chronicler profile delete old-job

# Use a profile for a single command
work-chronicler fetch:all --profile personal
```

Profile data is stored at `~/.work-chronicler/profiles/<name>/`:
- `config.yaml` - GitHub orgs, JIRA config, etc.
- `.env` - Tokens (GitHub, JIRA)
- `work-log/` - Fetched PRs and tickets

## Directory Structure

work-chronicler uses a portable workspace at `~/.work-chronicler/`:

```
~/.work-chronicler/
├── config.json              # Global config (active profile)
└── profiles/
    └── <profile-name>/
        ├── config.yaml      # Profile-specific config
        ├── .env             # Tokens (600 permissions)
        └── work-log/
            ├── pull-requests/
            │   └── <org-name>/
            │       └── <repo-name>/
            │           ├── 2024-01-15_123.md
            │           └── 2024-02-20_456.md
            ├── jira/
            │   └── <org-name>/
            │       └── <project-key>/
            │           ├── PROJ-100.md
            │           └── PROJ-101.md
            ├── notes/                   # Additional context for AI analysis
            ├── performance-reviews/     # Add your own review docs here
            ├── .analysis/               # Generated analysis
            │   ├── stats.json           # Impact breakdown, repo stats, etc.
            │   ├── projects.json        # Detected project groupings
            │   └── timeline.json        # Chronological view by week/month
            └── filtered/                # Filtered subset (from filter command)
                ├── pull-requests/
                ├── jira/
                └── .analysis/
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `init` | Initialize workspace with interactive wizard |
| `fetch:github` | Fetch PRs from GitHub |
| `fetch:jira` | Fetch tickets from JIRA |
| `fetch:all` | Fetch both PRs and JIRA tickets |
| `link` | Cross-reference PRs and JIRA tickets |
| `analyze` | Classify PRs by impact and generate stats |
| `filter` | Filter work-log to a subset based on criteria |
| `status` | Show current state of fetched data |
| `profile list` | List all profiles |
| `profile switch <name>` | Switch active profile |
| `profile delete <name>` | Delete a profile |
| `mcp` | Start the MCP server for AI assistant integration |
| `workspace <subcommand>` | Output workspace paths (profile, work-log, analysis, root) |
| `skills install` | Install AI skills to Claude Code, Cursor, etc. |
| `skills uninstall` | Remove installed AI skills |
| `skills list` | Show where AI skills are installed |

### Global Options

| Option | Description |
|--------|-------------|
| `--profile <name>` | Use a specific profile (overrides active profile) |

### Analyze Command

Classifies PRs into four impact tiers and generates statistics:

```bash
# Interactive mode - prompts what to generate (tag-prs, projects, timeline)
work-chronicler analyze

# Run all analysis at once
work-chronicler analyze --all

# Or run specific analysis:
work-chronicler analyze --tag-prs      # Tag PRs with impact levels
work-chronicler analyze --projects     # Detect project groupings
work-chronicler analyze --timeline     # Generate chronological timeline

# Analyze full work-log even if filtered/ exists
work-chronicler analyze --full
```

**Impact Tiers:**
- **flagship**: Large initiatives (500+ lines or 15+ files), migrations, platform changes
- **major**: Significant features (200+ lines or 8+ files), `feat:` or `refactor:` commits
- **standard**: Regular work, bug fixes, `fix:` or `test:` commits
- **minor**: Small changes (<20 lines), docs, chores, dependency updates

**Project Detection:**

The `--projects` flag groups related PRs and tickets into projects based on shared JIRA ticket references. PRs that reference the same ticket are grouped together as a project. PRs without ticket references remain unassigned.

Output is written to `.analysis/projects.json`.

**Timeline View:**

The `--timeline` flag generates a chronological view of your work:
- Groups PRs and tickets by ISO week and month
- Shows weekly/monthly stats (PR count, ticket count, additions/deletions)
- Identifies busiest week and month
- Tracks impact distribution over time

Output is written to `.analysis/timeline.json`.

### Filter Command

Create a filtered subset of your work-log:

```bash
# Interactive mode (prompts for filter options)
work-chronicler filter

# Filter by organization (useful for separating work vs personal)
work-chronicler filter --org my-work-org
work-chronicler filter --exclude-org personal-github

# Filter by repository
work-chronicler filter --repo my-org/important-repo
work-chronicler filter --exclude-repo my-org/experimental-repo

# Exclude minor PRs
work-chronicler filter --exclude-impact minor

# Only major+ merged PRs
work-chronicler filter --min-impact major --merged-only

# Only PRs linked to tickets with 100+ lines changed
work-chronicler filter --linked-only --min-loc 100

# Combine filters (e.g., work PRs that are major+)
work-chronicler filter --org my-work-org --min-impact major

# Clear filtered data
work-chronicler filter --clear
```

Filtered files are written to `work-log/filtered/` with their own analysis (stats, projects, timeline).

### Interactive Prompts

Most commands will prompt for options when run without flags:

- **fetch:github/jira/all** - Prompts whether to use cache mode if data already exists
- **analyze** - Prompts what to generate (tag-prs, projects, timeline) and whether to use filtered data
- **filter** - Prompts for all filter options

Use flags like `--cache`, `--all`, `--full`, etc. to skip prompts in scripts.

## Configuration

The `init` command runs an interactive wizard that:
1. Creates a new profile (or uses "default")
2. Prompts for your GitHub username, orgs, and repo selection (manual, auto-discover, or all)
3. Optionally configures JIRA
4. Stores tokens securely in `.env` with restricted permissions

See [work-chronicler.example.yaml](work-chronicler.example.yaml) for a complete config example.

### GitHub Token

Create a personal access token at https://github.com/settings/tokens with the `repo` scope (or `public_repo` for public repos only).

### JIRA Token

Create an API token at https://id.atlassian.com/manage-profile/security/api-tokens

### Environment Variables

| Variable | Description |
|----------|-------------|
| `WORK_CHRONICLER_HOME` | Override workspace root directory (default: `~/.work-chronicler`) |
| `WORK_CHRONICLER_PROFILE` | Override active profile |
| `WORK_CHRONICLER_DIR` | Legacy: directory containing config (for MCP server) |
| `WORK_CHRONICLER_CONFIG` | Legacy: full path to config file |

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

| Skill | Description |
|-------|-------------|
| `/work-chronicler-summarize-work` | Summarize work for reviews and 1:1s |
| `/work-chronicler-generate-resume-bullets` | Create achievement-focused resume bullet points |
| `/work-chronicler-write-self-review` | Draft self-review content for performance reviews |
| `/work-chronicler-update-resume` | Update existing resume with recent accomplishments |
| `/work-chronicler-detect-projects` | Identify major project groupings from work history |
| `/work-chronicler-detect-themes` | Find recurring themes for career narrative |

### Supported AI Tools

Skills can be installed to:
- **Claude Code** (`~/.claude/skills/`)
- **Cursor** (`~/.cursor/skills/`)
- **Codex** (`~/.codex/skills/`)
- **Gemini** (`~/.gemini/skills/`)

The install wizard auto-detects which tools you have installed.

### Workspace Path Commands

Skills use dynamic workspace resolution. These commands output paths for the active profile:

```bash
work-chronicler workspace profile    # Active profile name
work-chronicler workspace work-log   # Work-log directory path
work-chronicler workspace analysis   # Analysis directory path
work-chronicler workspace root       # Profile root directory path
```

## MCP Server

work-chronicler includes an MCP (Model Context Protocol) server that exposes your work history to AI assistants like Claude Desktop and Cursor.

### Setup

1. First, fetch and analyze your data:
   ```bash
   work-chronicler fetch:all
   work-chronicler analyze --projects --timeline
   ```

2. Configure your AI assistant.

   The MCP server loads your configuration the same way the CLI does:
   - If you use the portable workspace (recommended), it reads `~/.work-chronicler/profiles/<profile>/config.yaml`.
   - You can select a profile via `WORK_CHRONICLER_PROFILE`.
   - For legacy configs, you can still point to a `work-chronicler.yaml` via `WORK_CHRONICLER_DIR` / `WORK_CHRONICLER_CONFIG`.

   **Published Package** (installed via npm):

   Use `npx work-chronicler mcp` which runs through the CLI. This is the recommended approach for installed packages.

   **Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "work-chronicler": {
         "command": "npx",
         "args": ["work-chronicler", "mcp"],
         "env": {
           "WORK_CHRONICLER_PROFILE": "default"
         }
       }
     }
   }
   ```

   **Cursor** (`.cursor/mcp.json` in your project):
   ```json
   {
     "mcpServers": {
       "work-chronicler": {
         "command": "npx",
         "args": ["work-chronicler", "mcp"],
         "env": {
           "WORK_CHRONICLER_PROFILE": "default"
         }
       }
     }
   }
   ```

   **Local Development** (running from source):

   For local development, use `node bin/mcp.js` which starts the MCP server directly without CLI overhead. This is faster for development iteration.

   ```json
   {
     "mcpServers": {
       "work-chronicler": {
         "command": "node",
         "args": ["/path/to/work-chronicler/bin/mcp.js"],
         "env": {
           "WORK_CHRONICLER_PROFILE": "default",
           "WORK_CHRONICLER_HOME": "/Users/you/.work-chronicler"
         }
       }
     }
   }
   ```

   > **Note:** Replace `/path/to/work-chronicler` with your actual project path. Run `pnpm build` first to generate the dist files.

   Alternatively, you can use the CLI approach for local development too:
   ```json
   {
     "mcpServers": {
       "work-chronicler": {
         "command": "node",
         "args": ["/path/to/work-chronicler/bin/work-chronicler.js", "mcp"],
         "env": {
           "WORK_CHRONICLER_PROFILE": "default",
           "WORK_CHRONICLER_HOME": "/Users/you/.work-chronicler"
         }
       }
     }
   }
   ```

3. Restart your AI assistant to load the MCP server.

**Environment Variables:**
- `WORK_CHRONICLER_HOME` - Workspace root (default: `~/.work-chronicler`)
- `WORK_CHRONICLER_PROFILE` - Profile name (default: active profile in `~/.work-chronicler/config.json`)
- `WORK_CHRONICLER_DIR` - Legacy: directory containing your `work-chronicler.yaml`
- `WORK_CHRONICLER_CONFIG` - Legacy: full path to config file (alternative to DIR)

### Available Tools

| Tool | Description |
|------|-------------|
| `search_prs` | Search PRs by date range, repo, keywords, impact level, or state |
| `search_tickets` | Search JIRA tickets by project, status, or keywords |
| `get_linked_work` | Get a PR with its linked JIRA tickets (or vice versa) |
| `list_repos` | List all repositories with statistics |
| `get_stats` | Get summary statistics (reads from stats.json or computes on-the-fly) |
| `get_projects` | Get detected project groupings with confidence levels |
| `get_timeline` | Get chronological timeline of work grouped by week or month |

### Example Prompts

Once configured, you can ask your AI assistant:

- "Show me my flagship PRs from last quarter"
- "What projects did I work on with high confidence groupings?"
- "Find all my work related to authentication"
- "Summarize my work from January to March"
- "What was my busiest week?"

### CLI Commands

```bash
# Show MCP server info
work-chronicler mcp --info

# Start MCP server (stdio transport)
work-chronicler mcp
```

## Project Structure

```
work-chronicler/
├── src/
│   ├── cli/                    # CLI application (Commander)
│   │   ├── commands/           # CLI commands
│   │   ├── fetchers/           # GitHub and JIRA fetchers
│   │   ├── linker/             # Cross-reference linking
│   │   ├── analyzer/           # Impact analysis
│   │   └── prompts/            # Interactive prompts
│   ├── mcp/                    # MCP server for AI assistants
│   └── core/                   # Shared types, config, storage
│       ├── config/             # Config loading and schema
│       ├── storage/            # Markdown file reader/writer
│       └── types/              # Zod schemas and types
├── bin/                        # CLI entry point
└── tools/
    └── git-hooks/              # Git hook management
```

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run type checking
pnpm type-check

# Run linting
pnpm lint

# Run tests
pnpm test
```

## Publishing

The package is published to npm as `work-chronicler`.

### Release Process

1. Update the version in `package.json`
2. Commit and push to main
3. Create and push a version tag:
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```
4. The GitHub Action will automatically publish to npm

### Manual Publishing

```bash
# Build the package
pnpm build

# Dry run to verify what will be published
pnpm publish --dry-run --no-git-checks

# Publish (requires NPM_TOKEN or npm login)
pnpm publish --access public --no-git-checks
```

## Roadmap

- [x] **Analysis commands**: Categorize work by size/impact (4-tier classification)
- [x] **Project detection**: Group related PRs/tickets into initiatives
- [x] **Timeline view**: Chronological view of work grouped by week/month
- [x] **MCP server**: Full implementation for AI assistant integration
- [x] **Profiles**: Multiple isolated profiles with interactive setup wizard
- [x] **AI skills**: Portable skills for Claude Code, Cursor, Codex, Gemini
- [ ] **AI summarization**: CLI commands for automated summaries
- [ ] **Supporting documents**: Import past reviews, resumes, notes for context
- [ ] **Google Docs integration**: Import performance review docs
- [ ] **Linear support**: Alternative to JIRA
- [ ] **Notion integration**: Import from Notion
- [ ] **Incremental sync**: Only fetch new/updated items

## License

MIT
