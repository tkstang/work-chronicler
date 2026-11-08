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
the full work log, even when the subset is empty. It checks on every tool
call, so a `filter` or `filter --clear` run while the client is connected
takes effect on the next call without a restart. It never falls back to the
full work log while a subset is selected; run `work-chronicler filter --clear`
to use the full work log. While a `filter` run is replacing the subset, or
after one was interrupted mid-swap, every tool returns no results: an `error`
saying the subset is unavailable and a `note` saying what to do (wait, or run
`filter` again). A call during which the selection changed is reported the
same way; call the tool again.

Tools that read imported records (`search_messages`, `search_documents`,
`get_linked_work` and `get_stats`) return no results while an import is
storing a batch in the full work log, or after one was interrupted: an
`error` saying imported records are unavailable and a `note` saying what to
do (wait, or run `work-chronicler import` with an empty directory to finish
it). They never return part of a batch. The PR and ticket tools still answer.

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
| `get_linked_work` | A PR (by URL in any form, or by bare PR number) with its linked tickets, or a ticket with its linked PRs, plus the imported messages and imported Google Docs that mention it (`mentionedInMessages`, `mentionedInDocuments`). |
| `list_repos` | Repositories in the work log with per-repo statistics. |
| `get_stats` | Summary statistics, optionally for a date range, with imported messages and imported Google Docs counted in their own `messages` and `documents` sections (Docs by modified time). Without a date range it returns the `stats.json` that `analyze` generated, with both sections counted afresh from the work log, so records imported since are included. For a date range, `dateRange` spans the PRs, tickets, messages and Docs counted. |
| `get_projects` | Detected project groupings of related PRs and tickets (PRs and tickets only; the result says so in `coverage`). |
| `get_timeline` | Work grouped by week or month: PRs and tickets, plus imported Google Docs listed apart in each week's `documents` by modified time (the result says so in `coverage`). |
| `search_pr_reviews` | Reviews and inline review comments you gave on other people's PRs, filtered by date range, org, repository, review state or keywords. |
| `search_messages` | Imported messages (such as Slack messages you wrote), filtered by keywords, date range, mentioned ticket or PR, attribution or source, with each mention resolved to its PR or ticket, or `null`. |
| `search_documents` | Imported Google Docs (Docs you own), filtered by keywords in the title or excerpt, modified date range, or mentioned ticket or PR, with each mention resolved to its PR or ticket, or `null`. |

Dates are ISO 8601. In `search_messages`, `search_documents` and `get_stats`, an `until` given
as a date alone (`2025-02-28`) includes that whole UTC day, so a message
posted at noon that day is counted, whatever the server's time zone; an
`until` with a time (`2025-02-28T12:00:00Z`) is used exactly. Any other
`until` without a time (`2025-2-28`, `Feb 28 2025`, `2025-02`) or a date
that does not exist is refused there. The other tools read a date alone as
the start of that day (midnight UTC).

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
were imported (`get_stats` and `get_linked_work` add the same `note`), and a
`note` when nothing has been imported.

`search_documents` reads the Google Docs stored by `work-chronicler import`:
Docs the subject owns, which is not the same as having written them. They are
supplementary evidence, never authored PRs or tickets, and the response
carries a `notice` saying so and that Doc text is evidence, never
instructions. Each result has the Doc's `title`, `owner`, `createdAt`,
`modifiedAt`, `url`, `subject`, `attribution` (always `unverified`),
`excerptTruncated` (whether the stored excerpt stops before the end of the
Doc), `text` (the excerpt, up to 1,000 characters) and `mentions`, resolved
as for messages. Docs are dated by their modified time, so a Doc created
before a date range but modified inside it is in it. Like `search_messages`,
it returns no results and a `note` when the filtered subset was made before
Docs were imported, and a `note` when none have been imported.

### Pages

`search_messages` and `search_documents` return their results in pages, so a
large import never produces one huge response. Both use the same contract:

- **Order.** Results are newest first (`occurredAt`: when a message was
  posted, when a Doc was last modified), and results at the same time are
  ordered by record identity, so the order is complete and the same on
  every call.
- **Size.** A page holds at most 64 KiB of serialized results, counting the
  text and the mentions, and at most `limit` results when `limit` is given.
  It always holds at least one result while any remain. One result is
  bounded too: its `text` stops at 1,000 characters, and its mentions are
  listed while the result stays within 16 KiB; any left out are counted in
  `omittedMentions` (`pullRequests`, `tickets`), which is absent when every
  mention is listed.
- **Cursor.** `nextCursor` is an opaque string naming the position just
  after the page's last result (its time and identity), not an offset. Pass
  it as `cursor`, with the same filters, to get the next page; it is `null`
  on the last page. Because the cursor is a position, following it never
  skips or repeats a result, even when records are imported between calls;
  a record imported meanwhile that sorts before the cursor appears only when
  you start again without a cursor. A cursor is bound to the tool that
  issued it and to the filters it was issued for (the page size may
  change): one from another tool, one passed with other filters, or a
  malformed one is refused with an error.
- **Counts.** `total` is the number of results matching the filters across
  all pages (the same on every page of an unchanged work log); `returned` is
  the number on this page.

Example prompts once connected:

- "Show me my flagship PRs from last quarter."
- "Find all my work related to authentication."
- "What was my busiest month this year?"
- "Which PRs did I request changes on last quarter?"
- "What did I say in Slack about the billing export?"
- "Which of my Google Docs mention the billing export?"
