---
title: Command reference
description: Every work-chronicler CLI command, argument and flag, grouped by task, as defined in src/cli.
---

# Command reference

Run `work-chronicler <command> --help` for the same information from the CLI.
From a source checkout, use `pnpm cli <command>`.

Some commands are interactive by design: `init` and `skills uninstall` always
prompt, even when you pass flags. `skills install` prompts unless you pass its
flags (`--yes` runs it with no prompts). Most other commands prompt only for a
choice you did not give as a flag. When a `filtered/` subset
exists, `analyze` asks whether to use it unless you pass `--full`, so use
`analyze --all --full` for an unattended analysis of the full work log.

## Global options

| Option | Meaning |
| --- | --- |
| `--profile <name>` | Use this profile instead of the active one, for this command only. |
| `-V, --version` | Print the version. |
| `-h, --help` | Show help for any command. |

## Setup

| Command | Meaning |
| --- | --- |
| `init` | Create a profile with the guided wizard. |
| `init --profile <name>` | Use this profile name instead of prompting. |
| `init --mode <ic\|manager>` | Create an IC profile (default) or a manager profile. |
| `status [-c <path>]` | Show what has been fetched for the active profile, including PR reviews you gave. |

## Fetch

All three accept:

| Flag | Meaning |
| --- | --- |
| `-c, --config <path>` | Use this config file instead of the profile's. |
| `-v, --verbose` | Show detailed output. |
| `--cache` | Skip items already in the work log. Without it, you are asked when data exists. |
| `--reviews` | `fetch github` and `fetch all` only: also fetch the PR reviews you gave (see below). IC profiles only; manager profiles print a notice and skip it. |
| `--report <id>` | Manager mode: fetch for one report. |
| `--all-reports` | Manager mode: fetch for every report. |

| Command | Meaning |
| --- | --- |
| `fetch github` | Fetch your PRs from the configured orgs and repos. |
| `fetch jira` | Fetch your tickets from the configured JIRA projects. |
| `fetch all` | Fetch both, then run `link`. Add `--no-link` to skip linking. |

The date range comes from `fetch.since` and `fetch.until` in the config; there
are no date flags.

### PR reviews you gave

`--reviews` is opt-in because it costs extra GitHub requests: an account
lookup and a search per org (more search pages when you reviewed many PRs),
plus at least two requests per reviewed PR.
It stores the reviews and inline review comments you submitted inside the
date range, on any PR in your configured orgs and repos, however old the PR
and whoever wrote it. PRs you authored are skipped. Pending (unsubmitted)
reviews and ordinary PR conversation comments are not included. A comment
counts by when it was written, not when it was last edited, and the stored
text is its latest version.

Each reviewed PR gets one file at
`work-log/pr-reviews/<org>/<repo>/<number>.md` with the PR's URL, title,
author and state, and your reviews and comments. Fetching again updates the
same file. With `--cache`, PRs that have not changed since their file was
written for the same or a wider date range are skipped. These records are never counted as PRs you authored.
A rate limit stops the run; other failures are reported per org and make the
run exit with status 1.

## Link, analyze and filter

| Command | Meaning |
| --- | --- |
| `link [-c <path>] [-v]` | Cross-reference PRs and tickets by ticket keys found in PR titles and bodies. |
| `analyze` | Write `.analysis/stats.json`, and prompt for the optional steps below. |
| `analyze --tag-prs` | Write an `impact` level into each PR file. |
| `analyze --projects` | Group PRs that share ticket references into `.analysis/projects.json`. |
| `analyze --timeline` | Write a week and month timeline to `.analysis/timeline.json`. |
| `analyze --all` | Run all three. |
| `analyze --full` | Analyze the full work log even when `filtered/` exists. |
| `filter` | Write a subset of the work log to `work-log/filtered/`, prompting for criteria. |

`analyze` also takes `-c, --config <path>` and `-v, --verbose`.

`link` only counts keys from the projects listed under `jira.instances[].projects`
when any are configured. Without configured projects it accepts any `ABC-123`
key except common standard and version names such as `UTF-8`, `ISO-8601`,
`SHA-256`, `GPT-4`, `RFC-3339` and `CVE-2024`, unless a fetched ticket has that
exact key (for example a `TLS-1` ticket). Running `link` again adds only
new links and leaves unchanged files untouched.

`filter` flags:

| Flag | Meaning |
| --- | --- |
| `--exclude-impact <levels...>` | Drop PRs at these levels (`minor`, `standard`, `major`, `flagship`). |
| `--min-impact <level>` | Keep PRs at this level or higher. |
| `--min-loc <lines>` | Keep PRs with at least this many lines changed. |
| `--linked-only` | Keep only PRs linked to tickets, and tickets linked to PRs. |
| `--merged-only` | Keep only merged PRs. |
| `--exclude-status <statuses...>` | Drop tickets with these statuses, for example `"To Do"`. |
| `--org <orgs...>` / `--exclude-org <orgs...>` | Keep or drop PRs from these GitHub orgs. |
| `--repo <repos...>` / `--exclude-repo <repos...>` | Keep or drop PRs from these repos (`org/repo`). |
| `--clear` | Remove existing filtered data. |
| `-c, --config <path>`, `-v, --verbose` | As above. |

Impact filters use the PR's stored `impact`, or classify untagged PRs on the fly.
Review records (`pr-reviews/`) are copied into `filtered/` when they pass the
`--org`, `--exclude-org`, `--repo` and `--exclude-repo` selectors; the other
filters describe authored PRs and do not apply to them. `filter` always writes
`filtered/pr-reviews/`, even when empty. Re-run `filter` after your first
`fetch --reviews`: a subset made before that has no `pr-reviews/`, and
`status` says so.

## Profiles

| Command | Meaning |
| --- | --- |
| `profile list` | List profiles and mark the active one. |
| `profile switch <name>` | Make a profile active. |
| `profile delete <name> [-f]` | Delete a profile and all its data. `-f` skips confirmation. |

## Manager mode

These commands need a manager profile. See [Manager mode](manager-mode.md).

| Command | Meaning |
| --- | --- |
| `reports add [name]` | Add a report. Non-interactive when both `--github <username>` and `--email <email>` are given; also takes `--repos <list>` and `--jira-projects <list>` (comma-separated). |
| `reports list` | List reports. |
| `reports update <report-id>` | Change a report with `--add-repo`, `--remove-repo`, `--add-jira-project` or `--remove-jira-project`. |
| `reports remove <id>` | Remove a report. `--keep-data` keeps files; `--delete-data` deletes them. |
| `analyze reports [id]` | Analyze one report (prompts when `id` is omitted). Takes `--tag-prs`, `--projects`, `--timeline`, `--all` and `-v`; with no flags it runs all three. |
| `analyze team` | Aggregate team-level analysis across reports. |

## AI skills and paths

| Command | Meaning |
| --- | --- |
| `skills install` | Copy or symlink the packaged skills into Claude Code, Cursor, Codex or Gemini, and migrate skills installed under old names. Prompts for anything not given as a flag. |
| `skills install --tool <tool...>` | Install for these tools: `claude`, `cursor`, `codex`, `gemini` or `all`. Skips the tool prompt. |
| `skills install --method <method>` | `copy` or `symlink`. Skips the method prompt. |
| `skills install --yes` | Never prompt: install for the detected tools (unless `--tool` is given) by copy (unless `--method` is given), keep existing skills with the same name and remove old-name skills once their replacement is installed. |
| `skills install --overwrite` | Replace existing skills with the same name without asking. |
| `skills install --keep-old` | Keep skills installed under old names without asking. |
| `skills list` | Show which tools have the skills installed, flagging old names that `skills install` will migrate. |
| `skills uninstall` | Remove installed skills. |
| `workspace profile` | Print the active profile name. |
| `workspace root` | Print the active profile directory. |
| `workspace work-log` | Print the work-log directory. |
| `workspace analysis` | Print the analysis directory. |

Skills call the `workspace` commands at runtime to find your data; see
[AI skills](available-skills.md).

## MCP

| Command | Meaning |
| --- | --- |
| `mcp` | Start the MCP server on stdio. |
| `mcp --info` | Print the tool list and a sample client config without starting. |

See [MCP server](mcp-server.md).
