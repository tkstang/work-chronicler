---
title: Link, analyze and filter
description: link PRs to tickets, analyze impact, projects and timeline, and filter the work log into a subset for a review.
---

# Link, analyze and filter

| Command                 | Meaning                                                                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `link [-c <path>] [-v]` | Cross-reference PRs and tickets by ticket keys found in PR titles and bodies, and report how many mentions in imported records resolve. |
| `analyze`               | Write `.analysis/stats.json`, and prompt for the optional steps below.                                                                  |
| `analyze --tag-prs`     | Write an `impact` level into each PR file.                                                                                              |
| `analyze --projects`    | Group PRs that share ticket references into `.analysis/projects.json`.                                                                  |
| `analyze --timeline`    | Write a week and month timeline to `.analysis/timeline.json`.                                                                           |
| `analyze --all`         | Run all three.                                                                                                                          |
| `analyze --full`        | Analyze the full work log even when `filtered/` exists.                                                                                 |
| `filter`                | Replace the subset of the work log in `work-log/filtered/`, prompting for criteria.                                                     |

`analyze` also takes `-c, --config <path>` and `-v, --verbose`.

`link` only counts keys from the projects listed under `jira.instances[].projects`
when any are configured. Without configured projects it accepts any `ABC-123`
key except common standard and version names such as `UTF-8`, `ISO-8601`,
`SHA-256`, `GPT-4`, `RFC-3339` and `CVE-2024`, unless a fetched ticket has that
exact key (for example a `TLS-1` ticket). Running `link` again adds only
new links and leaves unchanged files untouched. A ticket's `linkedPRs` are
compared in normalized form (see [Mentions](import.md#mentions)), so a PR is not linked
twice under another capitalization.

`filter` flags:

| Flag                                              | Meaning                                                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--exclude-impact <levels...>`                    | Drop PRs at these levels (`minor`, `standard`, `major`, `flagship`).                                                                                                     |
| `--min-impact <level>`                            | Keep PRs at this level or higher.                                                                                                                                        |
| `--min-loc <lines>`                               | Keep PRs with at least this many lines changed (a whole number).                                                                                                         |
| `--linked-only`                                   | Keep only PRs linked to tickets, tickets linked to PRs, and messages and Google Docs that mention a PR or ticket in the subset.                                          |
| `--merged-only`                                   | Keep only merged PRs.                                                                                                                                                    |
| `--exclude-status <statuses...>`                  | Drop tickets with these statuses, for example `"To Do"`.                                                                                                                 |
| `--org <orgs...>` / `--exclude-org <orgs...>`     | Keep or drop PRs from these GitHub orgs.                                                                                                                                 |
| `--repo <repos...>` / `--exclude-repo <repos...>` | Keep or drop PRs from these repos (`org/repo`, ignoring case). A record whose `repository` holds the bare name (`api`) or the full name (`acme/api`) matches either way. |
| `--clear`                                         | Remove the subset, so read commands use the full work log.                                                                                                               |
| `-c, --config <path>`, `-v, --verbose`            | As above.                                                                                                                                                                |

Impact filters use the PR's stored `impact`, or classify untagged PRs on the fly.
An impact level that is not one of the four, or a `--min-loc` that is not a
whole number, is refused (exit 1) and the subset is left as it was.
Most filters describe authored PRs or tickets. For other evidence:

| Record type                         | Filters that apply                                                                                         |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| PRs (`pull-requests/`)              | All except `--exclude-status`.                                                                             |
| Tickets (`jira/`)                   | `--exclude-status`, and `--linked-only` (linked to a PR in the subset).                                    |
| PR reviews you gave (`pr-reviews/`) | `--org`, `--exclude-org`, `--repo`, `--exclude-repo`, applied to the reviewed PR.                          |
| Imported messages (`messages/`)     | `--linked-only` only: a message is kept when one of its mentions resolves to a PR or ticket in the subset. |
| Imported Google Docs (`documents/`) | `--linked-only` only, as for messages.                                                                     |

`filter` builds the whole subset (every record type, its `.analysis/` and a
`.filter.json` record of the filters and counts) in a directory beside
`filtered/`, reads it back, and only then swaps it in. Records that no longer
match, of every type, go with the old subset. If anything fails before the
swap, the previous subset stays exactly as it was and `filter` exits with an
error. If the new subset cannot be put in place and the previous one cannot
be put back either, `filter` says so (not that the subset is unchanged) and
the next `filter` restores it. Once the new subset is in place, a failure to
tidy up what earlier runs left is only a warning. The subset always has `pull-requests/`, `jira/`, `pr-reviews/` and
`messages/`, even when empty.

The subset is in use whenever `filtered/` exists, even when nothing matched:
`analyze` (unless `--full`) and the MCP server read it and never fall back to
the full work log, and `status` shows the filters and counts. Run
`filter --clear` to go back to the full work log. A subset made before you
first fetched reviews or imported messages lacks that directory: `status`
says so, and `search_pr_reviews` and `search_messages` return no results with
a note, instead of reading the full work log. Re-run `filter` to add them.

`filter` and `filter --clear` run under the work-log lock they share with
`import` (`.import-lock` and `.filter-lock`; see [All or nothing](import.md#all-or-nothing)):
a second `filter`, or a `filter` while an import runs, is refused and leaves
the subset as it is. A lock left by a process on this machine that has
exited, or that ran before the last reboot (by its recorded boot ID, never
the clock; Linux and macOS only), is taken over, by one run at a time.
Elsewhere, and for a 0.6.0 lock, a lock is kept while a process with its ID
runs. A lock held by a running
process, or recorded under another host name (for example after the machine
was renamed), is not: the error and `status` name the lock, the command,
process and host that hold it, and say to remove the lock if you know no such
run is going. A takeover runs under a short-lived `<lock>.takeover` guard; if
a run exits while holding it, later runs are refused with the guard's path,
to remove once no import or filter is running.

`filter` reads the work log only while it holds the lock, after finishing any
interrupted import the way `import` would (a batch that was still being
prepared is discarded, one that was being stored is rolled back, one that was
recorded as stored is completed) and saying so in a warning. A subset
therefore never holds part of an import's batch. If the interrupted import
cannot be finished (for example, one of its records was edited since),
`filter` refuses and changes nothing; run `work-chronicler import` with an
empty directory to see what it needs.

`filter --clear` first lists, under the lock, any earlier subset an
interrupted or warned run left beside `filtered/`, and sets each aside while
the selected subset is still in place; only then is the subset deselected.
If it cannot list the work log or set one aside, it is refused and the
selected subset stays in use, so readers are never left facing an
interrupted swap.

If `filter` is interrupted between moving the old subset aside and moving the
new one into place, `analyze` stops with an error and MCP tools return no
results with a `note`, rather than read the full work log (`analyze --full`
still runs); the next `filter`
restores the old subset before it does anything else, and `filter --clear`
discards it.
