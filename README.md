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

# Create a dedicated directory for your work history
mkdir ~/work-history
cd ~/work-history

# Initialize - creates .env and work-chronicler.yaml in current directory
work-chronicler init

# Edit .env with your tokens:
#   GITHUB_TOKEN=ghp_xxxx
#   JIRA_EMAIL=you@company.com
#   JIRA_TOKEN=xxxx

# Edit work-chronicler.yaml with your GitHub username, orgs, and JIRA config

# Fetch your work history
work-chronicler fetch:all

# Analyze and generate stats
work-chronicler analyze --projects --timeline

# Check what you have
work-chronicler status
```

All data is stored in the current directory under `work-log/`. You can version control this directory or keep it private.

## Usage

All commands operate on the current directory. The CLI looks for `work-chronicler.yaml` in the current directory first, then falls back to `~/.config/work-chronicler/config.yaml`.

```bash
# Create config files (.env and work-chronicler.yaml)
work-chronicler init

# Fetch from GitHub and JIRA
work-chronicler fetch:all

# Cross-reference PRs ↔ tickets
work-chronicler link

# Generate analysis files
work-chronicler analyze --projects --timeline

# Check status
work-chronicler status
```

> **Note**: For local development in this repo, prefix all commands with `pnpm cli` (e.g., `pnpm cli init`).

## Directory Structure

After fetching, your data is organized like this:

```
work-log/
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
| `init` | Create a new config file |
| `fetch:github` | Fetch PRs from GitHub |
| `fetch:jira` | Fetch tickets from JIRA |
| `fetch:all` | Fetch both PRs and JIRA tickets |
| `link` | Cross-reference PRs and JIRA tickets |
| `analyze` | Classify PRs by impact and generate stats |
| `filter` | Filter work-log to a subset based on criteria |
| `status` | Show current state of fetched data |
| `mcp` | Start the MCP server for AI assistant integration |

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

See [work-chronicler.example.yaml](work-chronicler.example.yaml) for a complete example.

### GitHub Token

Create a personal access token at https://github.com/settings/tokens with the `repo` scope (or `public_repo` for public repos only).

### JIRA Token

Create an API token at https://id.atlassian.com/manage-profile/security/api-tokens

## MCP Server

work-chronicler includes an MCP (Model Context Protocol) server that exposes your work history to AI assistants like Claude Desktop and Cursor.

### Setup

1. First, fetch and analyze your data:
   ```bash
   work-chronicler fetch:all
   work-chronicler analyze --projects --timeline
   ```

2. Configure your AI assistant.

   The MCP server needs to find your `work-chronicler.yaml` config. Use the `WORK_CHRONICLER_DIR` environment variable to point to your work history directory.

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
           "WORK_CHRONICLER_DIR": "/Users/you/work-history"
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
           "WORK_CHRONICLER_DIR": "/Users/you/work-history"
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
           "WORK_CHRONICLER_DIR": "/path/to/work-chronicler"
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
           "WORK_CHRONICLER_DIR": "/path/to/work-chronicler"
         }
       }
     }
   }
   ```

3. Restart your AI assistant to load the MCP server.

**Environment Variables:**
- `WORK_CHRONICLER_DIR` - Directory containing your `work-chronicler.yaml`
- `WORK_CHRONICLER_CONFIG` - Full path to config file (alternative to DIR)

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
- [ ] **AI summarization**: Claude/Cursor commands + CLI commands for summaries
- [ ] **Supporting documents**: Import past reviews, resumes, notes for context
- [ ] **Google Docs integration**: Import performance review docs
- [ ] **Linear support**: Alternative to JIRA
- [ ] **Notion integration**: Import from Notion
- [ ] **Incremental sync**: Only fetch new/updated items

## License

MIT
