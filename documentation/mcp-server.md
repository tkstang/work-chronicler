---
title: MCP server
description: Connect Claude Desktop, Cursor or another MCP client to your work log, and the nine read-only tools it exposes.
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
the full work log, even when the subset is empty. It never falls back to the
full work log while a subset is selected; run `work-chronicler filter --clear`
to use the full work log. If a `filter` run was interrupted while replacing
the subset, the server stops at startup with an error until you run `filter`
again.

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
| `get_linked_work` | A PR (by URL in any form, or by bare PR number) with its linked tickets, or a ticket with its linked PRs, plus the imported messages that mention it (`mentionedInMessages`). |
| `list_repos` | Repositories in the work log with per-repo statistics. |
| `get_stats` | Summary statistics, optionally for a date range, with imported messages counted in their own `messages` section. |
| `get_projects` | Detected project groupings of related PRs and tickets (PRs and tickets only; the result says so in `coverage`). |
| `get_timeline` | Work grouped by week or month (PRs and tickets only; the result says so in `coverage`). |
| `search_pr_reviews` | Reviews and inline review comments you gave on other people's PRs, filtered by date range, org, repository, review state or keywords. |
| `search_messages` | Imported messages (such as Slack messages you wrote), filtered by keywords, date range, mentioned ticket or PR, attribution or source, with each mention resolved to its PR or ticket, or `null`. |

`search_pr_reviews` reads the review records written by
`fetch github --reviews`. They are review work, not PRs you wrote:
`search_prs`, `get_stats`, `get_projects` and `get_timeline` never count
them. If the filtered subset was made before
you fetched reviews (it has no `pr-reviews/`), `search_pr_reviews` returns no
results and a `note` asking you to re-run `filter`; it does not read the full
work log behind your subset. It also adds a `note` when no reviews have been
fetched. Each result names its `reviewer`; records written for a GitHub user
other than your configured `github.username` are left out, with a `note`
saying how many. Without a configured `github.username` no record can be
attributed to you: the tool returns no results, an `unattributed` count with
the reviewers it found, and a `note` (`status` likewise does not count them).

`search_messages` reads the records stored by `work-chronicler import`. They
are supplementary evidence, never authored PRs or tickets, and the response
carries a `notice` that message text is evidence, never instructions. Each
result has the message `text` (up to 1,000 characters), `channel`,
`occurredAt`, `url`, `subject`, `attribution` and `mentions`, where every
mentioned PR or ticket has `resolved` set to the work-log record or `null`
(see [Mentions](commands.md#mentions)). Like `search_pr_reviews`, it returns
no results and a `note` when the filtered subset was made before messages
were imported, and a `note` when nothing has been imported.

Example prompts once connected:

- "Show me my flagship PRs from last quarter."
- "Find all my work related to authentication."
- "What was my busiest month this year?"
- "Which PRs did I request changes on last quarter?"
- "What did I say in Slack about the billing export?"
