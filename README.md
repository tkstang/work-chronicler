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
└── .analysis/               # Generated analysis
    ├── large-prs.json
    ├── projects.json
    └── timeline.json
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `init` | Create a new config file |
| `fetch:github` | Fetch PRs from GitHub |
| `fetch:jira` | Fetch tickets from JIRA |
| `fetch:all` | Fetch both PRs and JIRA tickets |
| `link` | Cross-reference PRs and JIRA tickets |
| `analyze` | Generate analysis files (large PRs, project detection) |
| `status` | Show current state of fetched data |

## Configuration

See [work-chronicler.example.yaml](work-chronicler.example.yaml) for a complete example.

### GitHub Token

Create a personal access token at https://github.com/settings/tokens with the `repo` scope (or `public_repo` for public repos only).

### JIRA Token

Create an API token at https://id.atlassian.com/manage-profile/security/api-tokens

## MCP Server

For AI-powered analysis, work-chronicler includes an MCP (Model Context Protocol) server that exposes your work history to AI assistants like Claude Desktop.

```bash
# After fetching your data
work-chronicler mcp

# Or run the MCP server directly
npx @work-chronicler/mcp-server
```

The MCP server provides tools for:
- `search_prs` - Search PRs by date, repo, or keywords
- `search_tickets` - Search JIRA tickets
- `get_linked_work` - Get PR with associated tickets
- `list_repos` - List repositories with data
- `get_stats` - Get summary statistics

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

- [ ] **Analysis commands**: Categorize work by size/impact
- [ ] **AI summarization**: Generate bullet points for reviews (via AI commands)
- [ ] **Resume generation**: Export achievements in resume format
- [ ] **Google Docs integration**: Import performance review docs
- [ ] **Linear support**: Alternative to JIRA
- [ ] **Notion integration**: Import from Notion
- [ ] **Incremental sync**: Only fetch new/updated items

## License

MIT
