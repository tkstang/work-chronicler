---
title: Command reference
description: Every work-chronicler CLI command, argument and flag, grouped by task, as defined in src/cli.
---

# Command reference

Run `work-chronicler <command> --help` for the same information from the CLI.
From a source checkout, use `pnpm cli <command>`.

Commands that need a choice and get no flags prompt for it. Pass flags to run
them non-interactively.

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
| `status [-c <path>]` | Show what has been fetched for the active profile. |

## Fetch

All three accept:

| Flag | Meaning |
| --- | --- |
| `-c, --config <path>` | Use this config file instead of the profile's. |
| `-v, --verbose` | Show detailed output. |
| `--cache` | Skip items already in the work log. Without it, you are asked when data exists. |
| `--report <id>` | Manager mode: fetch for one report. |
| `--all-reports` | Manager mode: fetch for every report. |

| Command | Meaning |
| --- | --- |
| `fetch github` | Fetch your PRs from the configured orgs and repos. |
| `fetch jira` | Fetch your tickets from the configured JIRA projects. |
| `fetch all` | Fetch both, then run `link`. Add `--no-link` to skip linking. |

The date range comes from `fetch.since` and `fetch.until` in the config; there
are no date flags.

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
| `skills install` | Copy or symlink the packaged skills into Claude Code, Cursor, Codex or Gemini. |
| `skills list` | Show which tools have the skills installed. |
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
