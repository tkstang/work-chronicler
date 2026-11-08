---
title: Record the PR reviews you gave
description: Fetch the reviews and inline comments you gave on other people's PRs, check them, and query them through the MCP server, filters and skills.
---

# Record the PR reviews you gave

PR reviews you gave are review work, never PRs you wrote. work-chronicler
fetches them only when you pass `--reviews`, and only in IC profiles; manager
profiles print a notice and skip it.

## Before you start

- Set `github.username` in the profile's `config.yaml` (see
  [Configuration](../tools/configuration.md)). Records written for any other
  GitHub user are not attributed to you.
- `--reviews` costs extra GitHub requests. What it stores and when it refuses
  to run are on [Fetch commands](../tools/fetch.md#pr-reviews-you-gave).

## Fetch your reviews

```bash
work-chronicler fetch all --reviews     # PRs, tickets, link, and the reviews you gave
work-chronicler fetch github --reviews  # GitHub only
```

Each reviewed PR gets one file at `work-log/pr-reviews/<org>/<repo>/<number>.md`.
Fetching again updates the same file. With `--cache`, PRs that have not changed
since their file was written for the same or a wider date range are skipped.

## Check what was stored

`work-chronicler status` shows the PR reviews you gave. It does not count
records for a different GitHub user, and says so.

## Use them

- **MCP server:** `search_pr_reviews` returns the reviews and inline review
  comments you gave, filtered by date range, org, repository, review state or
  keywords; for example, "Which PRs did I request changes on last quarter?".
  `search_prs`, `get_stats`, `get_projects` and `get_timeline` never count
  them. See [MCP server](../tools/mcp-server.md).
- **Skills:** PR reviews you gave are cited as review work, never as authored
  PRs (see [AI skills](../tools/skills.md)).

## Filtered subsets

`filter` applies `--org`, `--exclude-org`, `--repo` and `--exclude-repo` to the
reviewed PR. A subset made before you first fetched reviews has no
`pr-reviews/`: `status` says so, and `search_pr_reviews` returns no results with
a note instead of reading the full work log. Re-run `filter` to add them (see
[Link, analyze and filter](../tools/link-analyze-filter.md)).
