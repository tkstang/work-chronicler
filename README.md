# work-chronicler

Gather, analyze, and summarize your work history from GitHub PRs and JIRA tickets for performance reviews and resumes.

## The Problem

Performance review time rolls around and you need to:
- Remember everything you accomplished in the past year
- Write compelling bullet points for your self-review
- Update your resume with recent achievements

But you didn't take notes, and now you're scrolling through months of PRs trying to piece together what you did.

## The Solution

`work-chronicler` fetches your PR descriptions and JIRA tickets, stores them locally as searchable markdown files, and provides AI-ready tooling to analyze and summarize your work.

## Quick Start (Local Development)

```bash
# Install dependencies
pnpm install

# Run the CLI
pnpm cli init
pnpm cli status
pnpm cli fetch:all
```

## Installation (Published Package)

```bash
npm install -g @work-chronicler/cli
# or
npx @work-chronicler/cli
```

## Usage

```bash
# 1. Create config files (.env and work-chronicler.yaml)
work-chronicler init

# 2. Add your API tokens to .env
# 3. Edit work-chronicler.yaml with your GitHub username and orgs

# 4. Fetch everything
work-chronicler fetch:all

# 5. Link PRs to JIRA tickets
work-chronicler link

# 6. Check status
work-chronicler status
```

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
# Generate stats only
work-chronicler analyze

# Tag all PRs with impact levels
work-chronicler analyze --tag-prs

# Detect project groupings
work-chronicler analyze --projects

# Generate chronological timeline
work-chronicler analyze --timeline
```

**Impact Tiers:**
- **flagship**: Large initiatives (500+ lines or 15+ files), migrations, platform changes
- **major**: Significant features (200+ lines or 8+ files), `feat:` or `refactor:` commits
- **standard**: Regular work, bug fixes, `fix:` or `test:` commits
- **minor**: Small changes (<20 lines), docs, chores, dependency updates

**Project Detection:**

The `--projects` flag groups related PRs and tickets into projects using:
- **Ticket-based** (high confidence): PRs that share JIRA ticket references
- **Time-based** (low confidence): PRs in same repo within a 14-day window

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
# Exclude minor PRs
work-chronicler filter --exclude-impact minor

# Only major+ merged PRs
work-chronicler filter --min-impact major --merged-only

# Only PRs linked to tickets with 100+ lines changed
work-chronicler filter --linked-only --min-loc 100
```

Filtered files are written to `work-log/filtered/` with their own stats.

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

2. Configure your AI assistant:

   **Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
   ```json
   {
     "mcpServers": {
       "work-chronicler": {
         "command": "npx",
         "args": ["@work-chronicler/mcp-server"],
         "cwd": "/path/to/your/work-log-directory"
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
         "args": ["@work-chronicler/mcp-server"]
       }
     }
   }
   ```

3. Restart your AI assistant to load the MCP server.

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

## Monorepo Structure

This project is organized as a Turborepo monorepo:

```
work-chronicler/
├── apps/
│   ├── cli/                    # CLI application (@work-chronicler/cli)
│   └── mcp-server/             # MCP server (@work-chronicler/mcp-server)
├── packages/
│   └── core/                   # Shared types, config, storage (@work-chronicler/core)
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
