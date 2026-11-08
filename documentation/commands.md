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
| `status [-c <path>]` | Show what has been fetched and imported for the active profile (PRs, tickets, PR reviews you gave, imported messages), the filtered subset in use, and an import that did not finish. |

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
date range, on other people's PRs in your configured orgs and repos, however
old the PR. PRs you authored are skipped. Pending (unsubmitted)
reviews and ordinary PR conversation comments are not included. A comment
counts by when it was written, not when it was last edited, and the stored
text is its latest version.

Each reviewed PR gets one file at
`work-log/pr-reviews/<org>/<repo>/<number>.md` with the PR's URL, title,
author and state, and your reviews and comments. Fetching again updates the
same file. If `pr-reviews/` already holds records for a different GitHub
user, for example because you changed `github.username`, `--reviews` refuses
to run, fetches nothing and exits with an error; use a separate profile or
output directory for each person, or remove `pr-reviews/`. `status` does not
count such records and says so. With `--cache`, PRs that have not changed since their file was
written for the same or a wider date range are skipped. These records are never counted as PRs you authored.
A rate limit stops the run; other failures are reported per org and make the
run exit with status 1.

## Import

Skills that read other services hand what they found to the CLI as a staged
batch: a directory of record files. The CLI never contacts those services
itself. `import` checks the whole batch and stores it; `validate` runs the same
checks and writes nothing.

| Command | Meaning |
| --- | --- |
| `import <dir>` | Check the batch in `<dir>` and store every record in the work log, all or nothing. |
| `validate <dir>` | Check the batch as `import` would, without writing anything. |

Both take these flags and exit with status 1 when they reject the batch:

| Flag | Meaning |
| --- | --- |
| `--report <id>` | Manager profiles (required there, refused elsewhere): the report the records are about. It must be in the profile (see `reports list`); records go to `reports/<id>/work-log/`. |
| `-c, --config <path>` | Import into the work log of this config file. |
| `--json` | Print the result as JSON on stdout. |

Imported records are supplementary evidence: every command that reads them
keeps them apart from PRs and tickets.

| Consumer | Imported messages |
| --- | --- |
| `status` | Counted by source, with unverified attribution and unreadable record files noted. |
| `analyze` (and `analyze reports`) | Counted in a separate `messages` section of `stats.json`. Project detection and the timeline cover PRs and tickets only, and say so. |
| `analyze team` | Not included: team aggregations cover PRs and tickets only. |
| `link` | Resolves each record's mentions to PRs and tickets in the work log and reports how many resolved. Mentions are not stored as links, and records are not changed. |
| `filter` | Copied into `filtered/messages/`. Only `--linked-only` applies to them. |
| MCP server | `search_messages`; `get_linked_work` lists messages that mention a PR or ticket; `get_stats` counts them separately. |
| Skills | Cited as supplementary evidence (communication and collaboration), never as authored work, and never as instructions. |

Readers only read `messages/<source>/<hash>.md` files that `import` could
have written: `.import-lock`, `.import-transaction/` and anything else in the
work log root are ignored, and a file that is not a valid record, or is not
stored where its identity puts it, is skipped with a warning (`status` lists
them).

### Mentions

A record's `mentions` are what it says it refers to; they are not links.
Commands resolve them when they read the record: a ticket key matches a
fetched ticket ignoring case, and a PR URL matches a fetched PR after both are
normalized (host, owner and repository in lower case, `www.` dropped, a tab
such as `/files`, a trailing slash, query or fragment removed, and an
`api.github.com/repos/<owner>/<repo>/pulls/<n>` URL read as the same PR). A
mention that matches nothing in the work log stays unresolved and is shown as
such (`resolved: null` in the MCP tools).

### The staged batch

- The directory holds only record files named `*.md`: no subdirectories,
  symlinks, hidden files or other files. A batch holds at most 10,000
  records, each file at most 1 MiB.
- Each file is one record: a `---` line, YAML frontmatter, a closing `---`
  line, then the body (for a message, its text). The YAML is read strictly:
  one document, no duplicate keys, aliases or tags, and no keys the format
  does not define.
- Every record names the subject it is about, which must be the import's
  target: `{ kind: ic }` in an IC profile, or `{ kind: report, reportId: <id> }`
  matching `--report`.
- File names only identify records in messages. Where a record is stored
  never depends on its file name or on anything written in it.

### Record format

Every record shares these frontmatter fields:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | `1`. |
| `type` | The record type: `message`. |
| `source` | Where the record came from: `slack`. |
| `sourceAccount` | The workspace or account the ID belongs to. For Slack, the configured workspace: its team ID or URL label. |
| `sourceId` | The item's stable ID within that account. For Slack, `<channel ID>/<message ts>`. |
| `url` | Link to the item, or `null` (the default). |
| `occurredAt` | When it happened (ISO 8601). |
| `updatedAt` | When it was last edited, or `null` (the default). Not earlier than `occurredAt`. |
| `capturedAt` | When the skill read it. Not earlier than `occurredAt`. |
| `subject` | Who it is about: `{ kind: ic }` or `{ kind: report, reportId: <id> }`. |
| `attribution` | Who wrote it: `status` is `verified` (the skill confirmed the author is the subject; `authorId` required) or `unverified`, with the source's `authorId` when known. |
| `mentions` | `tickets` (keys such as `PROJ-12`, uppercased) and `pullRequests` (URLs) the record mentions. Both default to empty. |

A `message` record adds a `message` field: `container` (`id` and optional
`name` of the channel or conversation), `thread` (`null`, or the `parentId` and
optional `parentUrl` of the thread it replies in: a reference, never the
parent's text), and `replyCount` and `replyParticipantCount` (counts only;
default `0`). This example uses invented data:

```markdown
---
schemaVersion: 1
type: message
source: slack
sourceAccount: T0EXAMPLE
sourceId: C0EXAMPLE/1767261600.000100
occurredAt: "2026-01-01T10:00:00Z"
capturedAt: "2026-01-05T09:00:00Z"
subject: { kind: ic }
attribution: { status: verified, authorId: U0EXAMPLE }
mentions: { tickets: [BILL-311], pullRequests: [] }
message:
  container: { id: C0EXAMPLE, name: billing-launch }
  replyCount: 3
  replyParticipantCount: 2
---

Usage-based invoices are live for every account (BILL-311).
```

### Where records are stored

A record's identity is its `type`, `source`, `sourceAccount` and `sourceId`.
It is stored at `work-log/messages/<source>/<hash>.md`, where `<hash>` is
derived from the identity alone. Importing a record with the same identity again replaces the stored
one (upsert); an identical record is left as it is, so repeating an import
changes nothing. Records that are not in the batch are never removed.

### Slack records

`import` and `validate` read the target's Slack settings (see
[Slack](#slack)) and refuse a Slack record (`SOURCE_RULE`) when:

- Slack is not set up for the IC profile or report: without settings, no
  Slack records are imported;
- `sourceAccount` is not the configured workspace;
- `attribution` is `unverified`, or `authorId` is not the configured user
  (only the subject's own messages are imported);
- the channel (`message.container.id`) is not in the configured channels,
  is a direct message (`D…`), or, for a report, is not confirmed as one the
  manager and the report both belong to;
- `message.container.name` is not `null` or the channel's configured name
  (use the `name` that `slack show` lists);
- `message.thread.parentId` is not a message ts, or `parentUrl` (and the
  record's own `url`) is anything but the bare Slack permalink of that
  message (`https://<host>.slack.com/archives/<channel>/p<ts>`, any
  `slack.com` host such as `example.enterprise.slack.com`, with at
  most `thread_ts` and `cid` in the query);
- a reply in a thread carries reply counts, or `replyParticipantCount`
  exceeds `replyCount`;
- the body (the message text) still holds raw Slack markup that can carry
  another person's name or label text: a user mention (`<@U…>`, `<@W…|name>`),
  a channel link (`<#C…|name>`), a special mention (`<!here>`,
  `<!subteam^…|@team>`) or a link in markup (`<https://…>`,
  `<https://…|label>`). The import skill writes these as `@someone`,
  `#channel`, `@here` and the bare URL. A line starting with `>` is ordinary
  text and is accepted.

Reply bodies, the parent's text and lists of participants cannot be written
at all: the format has no field for them, so a record that carries one is
rejected (`SCHEMA_INVALID`).

### All or nothing

- `import` reads and checks every record and every destination before it
  writes anything. Anything it cannot show to be safe rejects the whole batch:
  a symlink, file or unreadable entry where a directory below the work log
  should be, a destination that is not a regular file, or a stored file there
  that is not a valid record or has a different identity or subject. The work
  log itself must exist, and must be on a filesystem that supports hard links.
- One import runs per work log at a time, under `.import-lock`. A lock left
  by a process that has exited, or from before the last reboot, is taken
  over; one held by a running process or from another machine is not
  (`IMPORT_IN_PROGRESS`).
- The batch is written to `.import-transaction/` first and checked, with a
  copy of every record it replaces. Each record is then put in place only
  after the work log, the directories leading to it and the destination are
  checked again. If anything fails or changes on the way, every record already
  stored is put back and the import reports that no records were changed
  (`CHANGED_DURING_IMPORT` or `COMMIT_FAILED`).
- If putting a record back fails too, or `import` cannot confirm whether the
  batch was recorded as stored, it reports `ROLLBACK_INCOMPLETE` (or
  `RECOVERY_CONFLICT` for a record something else changed), says the work
  log needs recovery, and keeps `.import-transaction/`. Run `import` again
  (an empty directory will do) to finish: it puts the records back if the
  batch was not recorded as stored, or completes the batch if it was.
- Once every record is stored and checked, the batch is recorded as stored and
  is not undone. A cleanup step that fails after that is reported as a
  warning, and the next `import` finishes the cleanup (or stops with
  `RECOVERY_CONFLICT` if one of those records was changed in the meantime).
- If `import` is interrupted, the next `import` (with any batch, even an
  empty directory) finishes it first: an unfinished batch is rolled back and
  reported as rolled back, so none of its records are kept. A batch is
  reported as completed only when it was recorded as stored and every record
  still holds its new version. `validate` reports `RECOVERY_REQUIRED` while
  this is pending.
- If a record was changed by something else before recovery or cleanup
  finished (including after a successful import whose cleanup failed),
  recovery leaves it as it is and stops with `RECOVERY_CONFLICT`. The journal
  stays in `.import-transaction/journal.json`, and any version the batch
  replaced stays in `.import-transaction/backup/` (a newly created record has
  none). Sort the record out by hand, then remove `.import-transaction/`.

### Errors and `--json`

With `--json`, stdout holds one JSON object: `ok`, `command`, `target`,
`workLog`, `summary` (`records`, `created`, `updated`, `unchanged`), `records`
(each staged file with its `action`), `issues`, `warnings` and `recovery`
(an interrupted import this run finished, or `null`). Each issue has a `code`
and a `message`, and where they apply the staged `file`, the frontmatter
`field`, the `line` and `column`, and the `destination` relative to the work
log. Messages never repeat record content: an unknown frontmatter key, for
example, is reported by count and position, not by name.

| Codes | Meaning |
| --- | --- |
| `TARGET_INVALID`, `REPORT_NOT_FOUND`, `WORK_LOG_NOT_FOUND` | The profile, report or work log cannot take the batch. |
| `STAGING_NOT_FOUND`, `STAGING_UNREADABLE`, `UNEXPECTED_ENTRY`, `BATCH_TOO_LARGE`, `FILE_TOO_LARGE`, `READ_FAILED`, `FILE_CHANGED` | The staging directory or a file in it. |
| `INVALID_ENCODING`, `FRONTMATTER_MISSING`, `YAML_INVALID`, `SCHEMA_INVALID`, `SOURCE_RULE`, `SUBJECT_MISMATCH`, `DUPLICATE_IDENTITY` | A record, or two records with the same identity. |
| `UNSAFE_DESTINATION`, `IDENTITY_CONFLICT`, `DESTINATION_COLLISION` | Where a record would be stored. |
| `IMPORT_IN_PROGRESS`, `RECOVERY_REQUIRED`, `RECOVERY_CONFLICT`, `CHANGED_DURING_IMPORT`, `COMMIT_FAILED`, `ROLLBACK_INCOMPLETE` | The lock, the commit or recovery. |

## Slack

These commands keep the Slack settings the Slack import skills use
(`/work-chronicler-setup-slack` runs them; `/work-chronicler-import-slack`
reads `slack show`). The CLI never contacts Slack and never stores Slack
credentials; the skill reads Slack through your assistant's Slack connector
and hands the messages to `import`.
Settings are kept per IC profile, and per report in a manager profile (pass
`--report <id>` there; it is refused in an IC profile). Without settings, no
Slack records are imported. See [Configuration](configuration.md#slack) for
the fields.

| Command | Meaning |
| --- | --- |
| `slack configure --workspace <workspace> --user <user-id>` | Set up Slack: the workspace and the subject's Slack user ID (yours, or the report's). The workspace is its team ID (`T…`/`E…`) or, when no Slack tool shows the ID, its URL label (`example` for `example.slack.com` or `example.enterprise.slack.com`). The workspace or user cannot change while channels are configured; remove them first. |
| `slack channels add <channel-id> --name <name> --reason <text>` | Add a channel whose messages by the subject may be imported. `--name` is the channel name (a leading `#` is dropped); `--reason` says why it holds review-relevant work. |
| `slack channels remove <channel-id>` | Remove a channel. Records already imported from it are kept; later imports refuse it. An ID that is not configured is refused (exit 1) with the configured IDs listed, so a mistyped ID is never reported as removed. |
| `slack channels list` | List the configured channels. |
| `slack show` | Print what an import skill uses (read-only). |

`slack channels add` flags:

| Flag | Meaning |
| --- | --- |
| `--private` | Opt in to a private channel. Channels are public otherwise, and a `G…` ID (a private conversation) is refused without it. |
| `--shared-with-manager` | Manager profiles: confirm that you and the report are both members of the channel. Required for every report channel; the CLI cannot check membership, so the setup skill checks it before passing this flag. |

Direct messages (`D…` IDs) and group direct messages (`mpdm-…` names) are
always refused. A change that leaves every setting as it was (configuring
the same IDs again, adding a channel exactly as configured) writes nothing
and reports `changed: false`. Every command takes `-c, --config <path>` and `--json`, and
exits with status 1 when a change is refused.

Changes keep everything else in the config, comments included: the file is
edited in its parsed form, the result must validate and differ only in the
Slack settings, and it is written to a new file beside the config (with the
same permissions) that replaces the config in one rename, after checking the
config did not change meanwhile. A config that is a symbolic link, has other hard links, is invalid,
or changed during the update is refused and left as it was.

### `slack show --json`

`slack show --json` prints one JSON object:

| Field | Meaning |
| --- | --- |
| `profile` | The profile, or `null` with `--config`. |
| `mode` | `ic` or `manager`. |
| `subject`, `subjectName` | The record subject (`{ kind: ic }` or `{ kind: report, reportId }`) and the report's name. |
| `configured` | Whether Slack is set up for the subject. When `false`, nothing can be imported. |
| `range` | The profile's fetch range: `since`, and `until` (`null` means now). |
| `workspace`, `user` | The configured workspace (team ID or URL label) and user ID, or `null`. |
| `channels` | Each channel's `id`, `name`, `reason`, `private`, for reports `sharedWithManager`, and `importable` (false for a report channel not confirmed as shared). |
| `record` | The fields every staged record must carry: `source`, `sourceAccount`, `subject` and verified `attribution`; `null` when not configured. |
| `importCommand` | The `import` command line for this subject, with `<staging-dir>` to fill in. |
| `workLog` | Where the records will be stored. |

## Link, analyze and filter

| Command | Meaning |
| --- | --- |
| `link [-c <path>] [-v]` | Cross-reference PRs and tickets by ticket keys found in PR titles and bodies, and report how many mentions in imported records resolve. |
| `analyze` | Write `.analysis/stats.json`, and prompt for the optional steps below. |
| `analyze --tag-prs` | Write an `impact` level into each PR file. |
| `analyze --projects` | Group PRs that share ticket references into `.analysis/projects.json`. |
| `analyze --timeline` | Write a week and month timeline to `.analysis/timeline.json`. |
| `analyze --all` | Run all three. |
| `analyze --full` | Analyze the full work log even when `filtered/` exists. |
| `filter` | Replace the subset of the work log in `work-log/filtered/`, prompting for criteria. |

`analyze` also takes `-c, --config <path>` and `-v, --verbose`.

`link` only counts keys from the projects listed under `jira.instances[].projects`
when any are configured. Without configured projects it accepts any `ABC-123`
key except common standard and version names such as `UTF-8`, `ISO-8601`,
`SHA-256`, `GPT-4`, `RFC-3339` and `CVE-2024`, unless a fetched ticket has that
exact key (for example a `TLS-1` ticket). Running `link` again adds only
new links and leaves unchanged files untouched. A ticket's `linkedPRs` are
compared in normalized form (see [Mentions](#mentions)), so a PR is not linked
twice under another capitalization.

`filter` flags:

| Flag | Meaning |
| --- | --- |
| `--exclude-impact <levels...>` | Drop PRs at these levels (`minor`, `standard`, `major`, `flagship`). |
| `--min-impact <level>` | Keep PRs at this level or higher. |
| `--min-loc <lines>` | Keep PRs with at least this many lines changed. |
| `--linked-only` | Keep only PRs linked to tickets, tickets linked to PRs, and messages that mention a PR or ticket in the subset. |
| `--merged-only` | Keep only merged PRs. |
| `--exclude-status <statuses...>` | Drop tickets with these statuses, for example `"To Do"`. |
| `--org <orgs...>` / `--exclude-org <orgs...>` | Keep or drop PRs from these GitHub orgs. |
| `--repo <repos...>` / `--exclude-repo <repos...>` | Keep or drop PRs from these repos (`org/repo`). |
| `--clear` | Remove the subset, so read commands use the full work log. |
| `-c, --config <path>`, `-v, --verbose` | As above. |

Impact filters use the PR's stored `impact`, or classify untagged PRs on the fly.
Most filters describe authored PRs or tickets. For other evidence:

| Record type | Filters that apply |
| --- | --- |
| PRs (`pull-requests/`) | All except `--exclude-status`. |
| Tickets (`jira/`) | `--exclude-status`, and `--linked-only` (linked to a PR in the subset). |
| PR reviews you gave (`pr-reviews/`) | `--org`, `--exclude-org`, `--repo`, `--exclude-repo`, applied to the reviewed PR. |
| Imported messages (`messages/`) | `--linked-only` only: a message is kept when one of its mentions resolves to a PR or ticket in the subset. |

`filter` builds the whole subset (every record type, its `.analysis/` and a
`.filter.json` record of the filters and counts) in a directory beside
`filtered/`, reads it back, and only then swaps it in. Records that no longer
match, of every type, go with the old subset. If anything fails before the
swap, the previous subset stays exactly as it was and `filter` exits with an
error. The subset always has `pull-requests/`, `jira/`, `pr-reviews/` and
`messages/`, even when empty.

The subset is in use whenever `filtered/` exists, even when nothing matched:
`analyze` (unless `--full`) and the MCP server read it and never fall back to
the full work log, and `status` shows the filters and counts. Run
`filter --clear` to go back to the full work log. A subset made before you
first fetched reviews or imported messages lacks that directory: `status`
says so, and `search_pr_reviews` and `search_messages` return no results with
a note, instead of reading the full work log. Re-run `filter` to add them.

One `filter` (or `filter --clear`) runs per work log at a time, under
`.filter-lock`; a second run is refused and leaves the subset as it is. A lock
left by a process on this machine that has exited, or from before the last
reboot, is taken over, by one run at a time. A lock held by a running process,
or recorded under another host name (for example after the machine was
renamed), is not: the error and `status` name the lock, the process and host
that hold it, and say to remove `.filter-lock` if you know no filter is
running. `filter --clear` is refused while the lock is held too. A takeover
runs under a short-lived `.filter-lock.takeover` guard; if a run exits while
holding it, later runs are refused with the guard's path, to remove once no
filter is running.

If `filter` is interrupted between moving the old subset aside and moving the
new one into place, `analyze` and the MCP server stop with an error rather
than read the full work log (`analyze --full` still runs); the next `filter`
restores the old subset before it does anything else, and `filter --clear`
discards it.

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
| `skills install --yes` | Never prompt: install for the detected tools (unless `--tool` is given) by copy (unless `--method` is given), keep anything already at a skill's name (a skill, file or link; broken links are repaired) and remove old-name skills once their replacement is installed. |
| `skills install --overwrite` | Replace whatever is already at a skill's name (a skill, file or link) without asking. The new skill is staged and checked first, and the old entry is removed only once the new one is in place; a failed install keeps it. |
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
