---
title: MCP server
description: Connect Claude Desktop, Cursor or another MCP client to your work log, and the eight read-only tools it exposes.
---

# MCP server

`work-chronicler mcp` starts a Model Context Protocol server on stdio. It gives
an MCP client read-only query access to the active profile's work log. It
never writes files and never calls the network.

## Before you start

Fetch data, and run the analysis that `get_projects` and `get_timeline` read:

```bash
work-chronicler fetch all
work-chronicler analyze --all
```

If `work-log/filtered/` exists, the server reads the filtered subset instead of
the full work log.

## Client configuration

Clients start the server themselves. Add an entry like this to the client's MCP
config, for example `~/Library/Application Support/Claude/claude_desktop_config.json`
for Claude Desktop or `.cursor/mcp.json` for Cursor:

```json
{
  "mcpServers": {
    "work-chronicler": {
      "command": "npx",
      "args": ["work-chronicler", "mcp"],
      "env": { "WORK_CHRONICLER_PROFILE": "default" }
    }
  }
}
```

Restart the client after editing its config. `work-chronicler mcp --info`
prints the same example.

The server resolves the profile once, at startup. After `profile switch`,
restart the client, or pin a profile with `WORK_CHRONICLER_PROFILE` as above.

### Running from a source checkout

Run `pnpm build`, then point the client at the built entry point.
`bin/mcp.js` starts the server without loading the CLI:

```json
{
  "mcpServers": {
    "work-chronicler": {
      "command": "node",
      "args": ["<checkout>/bin/mcp.js"],
      "env": { "WORK_CHRONICLER_PROFILE": "default" }
    }
  }
}
```

Replace `<checkout>` with the absolute path of your clone.

### Config discovery

The server looks for a config in this order:

1. `WORK_CHRONICLER_CONFIG`: path to a legacy `work-chronicler.yaml`.
2. `WORK_CHRONICLER_DIR`: a directory containing `work-chronicler.yaml`.
3. The active profile in the workspace (`WORK_CHRONICLER_HOME` and
   `WORK_CHRONICLER_PROFILE` apply).
4. The current directory, then `~/.config/work-chronicler/`.

## Tools

| Tool | Returns |
| --- | --- |
| `search_prs` | PRs filtered by date range, repository, keywords or impact level. |
| `search_tickets` | JIRA tickets filtered by project, status or keywords. |
| `get_linked_work` | A PR (by URL, or by bare PR number) with its linked tickets, or a ticket with its linked PRs. |
| `list_repos` | Repositories in the work log with per-repo statistics. |
| `get_stats` | Summary statistics, optionally for a date range. |
| `get_projects` | Detected project groupings of related PRs and tickets. |
| `get_timeline` | Work grouped by week or month. |
| `search_pr_reviews` | Reviews and inline review comments you gave on other people's PRs, filtered by date range, org, repository, review state or keywords. |

`search_pr_reviews` reads the review records written by
`fetch github --reviews`. They are review work, not PRs you wrote: the other
tools never count them, and `get_stats`, `get_projects`, `get_timeline` and
`search_prs` cover authored PRs only.

Example prompts once connected:

- "Show me my flagship PRs from last quarter."
- "Find all my work related to authentication."
- "What was my busiest month this year?"
- "Which PRs did I request changes on last quarter?"
