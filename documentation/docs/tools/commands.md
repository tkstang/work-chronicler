---
title: Command reference
description: Global options, setup, profile, manager-mode, skills, workspace and MCP commands, and where each other command group is documented.
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

## Command groups

| Group                | Commands                                                            | Where                                                                       |
| -------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Setup                | `init`, `status`                                                    | [Setup](#setup)                                                             |
| Fetch                | `fetch github`, `fetch jira`, `fetch all`                           | [Fetch commands](fetch.md)                                                  |
| Import               | `import`, `validate`                                                | [Import and validate](import.md), [Import record format](import-records.md) |
| Slack settings       | `slack configure`, `slack channels add\|remove\|list`, `slack show` | [Slack commands](slack.md)                                                  |
| Google Docs settings | `google-docs configure`, `google-docs show`                         | [Google Docs commands](google-docs.md)                                      |
| Enrichment           | `link`, `analyze`, `filter`                                         | [Link, analyze and filter](link-analyze-filter.md)                          |
| Profiles             | `profile list`, `profile switch`, `profile delete`                  | [Profiles](#profiles)                                                       |
| Manager mode         | `reports ...`, `analyze reports`, `analyze team`                    | [Manager mode](#manager-mode)                                               |
| AI skills and paths  | `skills ...`, `workspace ...`                                       | [AI skills and paths](#ai-skills-and-paths)                                 |
| MCP                  | `mcp`                                                               | [MCP](#mcp)                                                                 |

## Global options

| Option             | Meaning                                                            |
| ------------------ | ------------------------------------------------------------------ |
| `--profile <name>` | Use this profile instead of the active one, for this command only. |
| `-V, --version`    | Print the version.                                                 |
| `-h, --help`       | Show help for any command.                                         |

## Setup

| Command                     | Meaning                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`                      | Create a profile with the guided wizard.                                                                                                                                              |
| `init --profile <name>`     | Use this profile name instead of prompting.                                                                                                                                           |
| `init --mode <ic\|manager>` | Create an IC profile (default) or a manager profile.                                                                                                                                  |
| `status [-c <path>]`        | Show what has been fetched and imported for the active profile (PRs, tickets, PR reviews you gave, imported messages), the filtered subset in use, and an import that did not finish. |

## Profiles

| Command                      | Meaning                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| `profile list`               | List profiles and mark the active one.                      |
| `profile switch <name>`      | Make a profile active.                                      |
| `profile delete <name> [-f]` | Delete a profile and all its data. `-f` skips confirmation. |

## Manager mode

These commands need a manager profile. See [Manager mode](../workflows/manager-mode.md).

| Command                      | Meaning                                                                                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reports add [name]`         | Add a report. Non-interactive when both `--github <username>` and `--email <email>` are given; also takes `--repos <list>` and `--jira-projects <list>` (comma-separated). |
| `reports list`               | List reports.                                                                                                                                                              |
| `reports update <report-id>` | Change a report with `--add-repo`, `--remove-repo`, `--add-jira-project` or `--remove-jira-project`.                                                                       |
| `reports remove <id>`        | Remove a report. `--keep-data` keeps files; `--delete-data` deletes them.                                                                                                  |
| `analyze reports [id]`       | Analyze one report (prompts when `id` is omitted). Takes `--tag-prs`, `--projects`, `--timeline`, `--all` and `-v`; with no flags it runs all three.                       |
| `analyze team`               | Aggregate team-level analysis across reports.                                                                                                                              |

## AI skills and paths

| Command                            | Meaning                                                                                                                                                                                                                                                                  |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `skills install`                   | Copy or symlink the packaged skills into Claude Code, Cursor, Codex or Gemini, and migrate skills installed under old names. Prompts for anything not given as a flag.                                                                                                   |
| `skills install --tool <tool...>`  | Install for these tools: `claude`, `cursor`, `codex`, `gemini` or `all`. Skips the tool prompt.                                                                                                                                                                          |
| `skills install --method <method>` | `copy` or `symlink`. Skips the method prompt.                                                                                                                                                                                                                            |
| `skills install --yes`             | Never prompt: install for the detected tools (unless `--tool` is given) by copy (unless `--method` is given), keep anything already at a skill's name (a skill, file or link; broken links are repaired) and remove old-name skills once their replacement is installed. |
| `skills install --overwrite`       | Replace whatever is already at a skill's name (a skill, file or link) without asking. The new skill is staged and checked first, and the old entry is removed only once the new one is in place; a failed install keeps it.                                              |
| `skills install --keep-old`        | Keep skills installed under old names without asking.                                                                                                                                                                                                                    |
| `skills list`                      | Show which tools have the skills installed, flagging old names that `skills install` will migrate.                                                                                                                                                                       |
| `skills uninstall`                 | Remove installed skills.                                                                                                                                                                                                                                                 |
| `workspace profile`                | Print the active profile name.                                                                                                                                                                                                                                           |
| `workspace root`                   | Print the active profile directory.                                                                                                                                                                                                                                      |
| `workspace work-log`               | Print the work-log directory.                                                                                                                                                                                                                                            |
| `workspace analysis`               | Print the analysis directory.                                                                                                                                                                                                                                            |

Skills call the `workspace` commands at runtime to find your data; see
[AI skills](skills.md).

## MCP

| Command      | Meaning                                                          |
| ------------ | ---------------------------------------------------------------- |
| `mcp`        | Start the MCP server on stdio.                                   |
| `mcp --info` | Print the tool list and a sample client config without starting. |

See [MCP server](mcp-server.md).
