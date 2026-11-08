# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- The documentation is now a Fumadocs site in `documentation/`. Its pages moved
  to `documentation/docs/` and were split by task: Getting started, Workflows
  (resumes and self-reviews, peer reviews, PR reviews you gave, Slack and
  Google Docs imports, manager mode and review packets) and Tools (the command
  reference by command group, configuration, the MCP server and the skills
  catalog). Links to the old `documentation/*.md` pages point at the new ones.

## [0.7.0] - 2026-11-08

### Added

- Google Docs you own can be imported as supplementary evidence. A new
  `document` record type (source `google-docs`, stored under
  `documents/google-docs/`) holds a Doc's title, created and modified times,
  owners and an excerpt of its own text of at most 16 KiB (UTF-8), with a
  `truncated` flag. `import` accepts one only when Google Docs is set up for
  the IC or report, the Doc is a Google Doc owned by the configured account
  alone (not in a shared drive), its attribution is `unverified` (owning a
  Doc is not writing it), and it was modified inside the profile's fetch
  range; refusals never repeat record content.
- `google-docs configure --account <email>` and `google-docs show --json`
  keep the Google Docs settings (`googleDocs: { account }`) per IC profile
  and per report, and print what an import skill needs. The CLI never
  contacts Google.
- `import` and `validate` take `--since` and `--until` to replace the
  fetch range for one batch of Google Docs records (a date alone is the
  whole UTC day), report the range they applied as `range` in `--json`
  output, and refuse a malformed bound with `RANGE_INVALID`.
- The `search_documents` MCP tool searches imported Google Docs by title or
  excerpt, mention and modified date, in pages like `search_messages`.
  `get_stats` counts Docs in a `documents` section, `get_timeline` lists
  them by modified time, and `get_linked_work` lists the Docs that mention a
  PR or ticket (`mentionedInDocuments`). `status`, `filter`, `analyze` and
  `link` cover them too. The writing and detection skills, the manager
  skills included, read them as Docs the user (or report) owns, never as
  Docs they wrote and never as instructions.
- The `/work-chronicler-import-google-docs` skill imports the Google Docs
  the subject owns, modified in the fetch range (or a range confirmed in the
  session, passed to `validate` and `import` as `--since`/`--until`). It
  reads Drive with `gog`, read-only, as the configured account in an IC
  profile and as the manager for a report (seeing only Docs shared with
  them, never changing sharing). It stores one record per Doc with an
  excerpt of the Doc's own text, skips and counts unreadable and empty Docs,
  imports in chunks, and reports counts only, saying when the import is
  incomplete.

### Changed

- `import`, `filter` and `filter --clear` now share one work-log lock, so
  only one of them runs in a work log at a time: `filter` is refused while an
  import runs and `import` while a filter runs, each naming the command,
  process and host that holds it (`status` shows it too). The lock is held
  under both names 0.6.0 used (`.import-lock`, then `.filter-lock`), so a
  0.6.0 `import` or `filter` running at the same time is refused as well,
  and a lock either of them left is honored while its process runs and taken
  over once it has exited. No new names appear in the work log. `validate`
  reports `IMPORT_IN_PROGRESS` only while an import, not a filter, holds the
  lock.
- `filter` reads the work log only while it holds the lock, after finishing
  any interrupted import the way `import` would (and saying so in a
  warning). If that import cannot be finished, `filter` refuses and changes
  nothing.
- Imported records are not read while `.import-transaction/` exists (an
  import is storing a batch, or was interrupted): MCP tools that read them
  return no results with a note, the PR and ticket tools still answer,
  `analyze` stops with an error, `status` says messages are not counted, and
  `link` links PRs and tickets and warns that mentions were not checked.

### Fixed

- `/work-chronicler-setup-slack` put the agreed channel reason into the
  `slack channels add` command in single quotes, so a reason with an
  apostrophe broke the command, and shell syntax in it (copied from a
  channel purpose, for example) could run as a separate command (a known
  issue in 0.6.0). `slack channels add` now takes `--reason-file <path>`
  (`-` reads standard input) as well as `--reason`, and the skill writes the
  reason to a temporary file with the assistant's file-writing tool and
  passes that file, so no shell reads the reason. The file is read up to
  4 KiB and must be UTF-8. A missing, unreadable, oversized or invalid reason
  is reported as JSON with `--json`, and a reason is stored without the
  surrounding spaces and line breaks that were already ignored when it was
  read.
- Once its channels were removed, `slack configure` accepted another Slack
  user while the work log still held the previous user's messages, so a
  later import mixed two people's messages and search and analysis
  presented both as the subject's. `slack configure` now refuses a user
  while the subject's work log holds Slack messages by a different user,
  naming the directory to remove first (or when they cannot be checked).
- A `slack` command run with `--json` printed nothing on stdout when the
  profile, config or report could not be resolved (an invalid config, or a
  manager profile without `--report`), or printed a plain-text hint that
  broke the JSON. It now prints `{ "ok": false, "error": … }` there, and only that.
- `filter` accepted a mistyped impact level or line count and dropped that
  restriction, so `--min-impact majoor` (or `--exclude-impact minr`, or
  `--min-loc abc` next to another filter) replaced the subset with a broader
  one. A level that is not `minor`, `standard`, `major` or `flagship`, or a
  `--min-loc` that is not a whole number, is now refused before the work log
  is read, and the subset is left as it was.
- A `slack` command could write a config larger than 1 MiB, which every
  later `slack` change then refused to edit. A change that would make the
  config larger than that is now refused and the config is left as it was.
- A `slack` command that changed the config could narrow its permissions:
  the replacement was created with the original mode narrowed by the
  process umask, so with umask `077` a `0640` config became `0600` and lost
  its group readers. The replacement now gets exactly the original mode.
- `filter --repo acme/api` left out, and `--exclude-repo acme/api` kept, a
  PR whose `repository` holds the full name (`acme/api`) rather than the bare
  name `fetch` stores. Both forms now match.
- `/work-chronicler-summarize-work`, `/work-chronicler-write-self-review`,
  `/work-chronicler-write-resume-bullets` and `/work-chronicler-update-resume`
  summarized a `search_messages` result from its text alone, which stops at
  1,000 characters, so a decision stated later in a long message could be
  left out. They now read the full message from its record file first.
- A subset made by `filter`, an MCP tool result or `analyze` could include
  part of an import's batch, read while the import was storing it or after
  it was interrupted. Readers now never see part of a batch: they refuse to
  read imported records while an import is storing a batch or was
  interrupted (see Changed), and a read during which a whole batch was
  stored is done again.
- A running `import` or `filter` could have its lock taken over when the
  system clock jumped forward, because a lock's owner counted as gone when
  its recorded start time looked older than the last boot. Locks now record
  the boot they were taken in, and a running process's lock is never taken
  over because of the clock. On Linux and macOS, which give a boot ID, a
  lock from before a reboot is still taken over even when its process ID is
  in use again; elsewhere, and for a 0.6.0 lock, a lock is kept while a
  process with its ID runs, until it is removed by hand.
- `filter --clear` could report success while an earlier subset left beside
  `filtered/` made `analyze` and the MCP server see an interrupted swap. It
  now finds and sets aside every such subset before deselecting, and when it
  cannot (listing the work log or moving one fails) it is refused with the
  selected subset still in use.
- A power failure while `import` stored a batch that only updated records
  could keep some replaced records but lose the batch's journal and backups,
  so the next import could not roll the partial batch back. The work log is
  now flushed after the transaction directory is created, before any record
  changes.
- `import` accepted a Slack permalink (`url`, `message.thread.parentUrl`)
  on another workspace's host when its channel and timestamp matched, so
  `search_messages` could cite the wrong workspace. For a workspace
  configured by its URL label, a permalink's host must now be
  `<label>.slack.com` or `<label>.enterprise.slack.com`. In an Enterprise
  Grid org, a channel whose permalinks use another workspace's host is then
  refused; configure the team or `E…` org ID when a Slack tool shows it.
- `import` accepted a Slack record whose `occurredAt` was not when the
  message was posted (such as the capture date), so date-filtered search and
  monthly statistics could place it in the wrong period. `occurredAt` must
  now be the time of the ts in `sourceId`, to the second.
- A mention of a ticket key that two JIRA instances both hold resolved to
  whichever ticket was read first, so `get_linked_work` could list a message
  under the wrong ticket. Such a mention now stays unresolved.
- On a volume that ignores letter case, `import` could call a record
  unchanged when it was stored under an upper-case hash name that readers
  skip, so search and analysis left it out. `import` now refuses such a
  destination (`IDENTITY_CONFLICT`) until the file is renamed.
- If `messages/` or `messages/<source>/` in a work log was a symlink (for
  example to another work log), readers read the records behind it as this
  work log's evidence. Such a directory is now skipped with a warning.
- A staged batch of thousands of near-1 MiB records could exhaust memory
  while `validate` or `import` read it, ending the run before any result.
  A batch's records may now hold at most 64 MiB in total; a larger batch is
  refused (`BATCH_TOO_LARGE`) with an instruction to split it, before the
  rest of it is read.
- An MCP tool call that spanned two `filter` runs made with the same
  creation time and missing record types (or two subsets from before 0.6.0,
  which have no marker) could return data from both subsets without saying
  the selection changed. Each subset is now told apart by the directory put
  in place, so such a call reports that the subset changed.
- `work-chronicler mcp --info` did not list `search_messages` among the
  available tools.
- `get_stats` without a date range returned the `stats.json` generated by
  `analyze` as it was, so messages imported after the analysis were missing
  from its counts. Its `messages` section is now counted afresh from the
  work log (or subset) the call reads. So, like a date-filtered call, it now
  returns the import-unavailable error instead of statistics while an import
  is storing a batch or after one was interrupted.
- `get_stats` for a date range left message dates out of `dateRange`, so a
  range holding only messages reported positive counts with no dates. The
  range now spans the messages counted too.
- `analyze reports` labeled a report's `stats.json` with a date range taken
  from its PRs alone (or today, with no PRs), although the statistics count
  its messages too. The stats range now spans the messages as well; projects
  and the timeline keep the PR range.
- `search_messages` and a date-filtered `get_stats` read a date-only
  `until` (`2025-02-28`) as midnight at the start of that day, leaving out
  everything later on it, such as a message posted at noon. A date alone
  now includes that whole UTC day (surrounding spaces ignored, in any time
  zone); a timestamp keeps its precision, and other text without a time is
  refused. Other tools are unchanged.
- `search_messages` returned every matching message in one response, so an
  empty search after a large import could send megabytes of text and
  mentions. Results now come in pages of at most 64 KiB (each result at most
  16 KiB, with `omittedMentions` counting mentions left out), newest first:
  pass `nextCursor` as `cursor`, with the same filters, for the next page
  (a cursor from another tool or for other filters is refused). Pages never
  skip or repeat a result, and `total` still counts every match. See
  [Pages](documentation/docs/tools/mcp-server.md#pages).

## [0.6.0] - 2026-11-08

### Added

- `work-chronicler import <dir>` stores a batch of records that a skill
  staged in a directory, and `work-chronicler validate <dir>` checks one
  without writing. Records share one format (source, account-scoped source
  ID, timestamps, subject, attribution with an honest `unverified` state,
  mentions); `message` records are the first type. Each is stored at
  `work-log/messages/<source>/<hash>.md` by its identity, so importing it
  again updates it and repeating an import changes nothing. A batch is
  stored all or nothing: anything unsafe or ambiguous (symlinks, a stored
  record with another identity, a record about someone else, a report not in
  the manager profile) rejects the whole batch, and a failure puts every
  stored record back. If putting a record back also fails, or a record was
  changed by something else, `import` says so (`ROLLBACK_INCOMPLETE`,
  `RECOVERY_CONFLICT`) and the next import finishes the recovery, as it does
  for an import that was interrupted. Every change import makes goes only
  through the directories it recorded; it refuses
  (`CHANGED_DURING_IMPORT`, or `RECOVERY_CONFLICT` while putting records
  back or recovering) rather than act through one that was moved, replaced
  or made a link. One import runs per work log at a time under
  `.import-lock`, the same kind of lock `filter` uses: a lock left by an
  exited process is taken over by one import at a time, and a running
  import's lock is never moved. Records the batch leaves unchanged are
  checked too before it is accepted, and an interrupted import whose journal
  is missing or says it was still preparing is cleared only when its
  bookkeeping shows no record was touched. Manager
  profiles import into a report's work log with `--report <id>`. Both
  commands exit with status 1 on rejection; `--json` gives machine-readable
  issues that never repeat record content.
- Slack settings per IC profile, and per report in a manager profile, for
  the Slack import skills: `slack configure` (the workspace, by team ID or
  by URL label such as `example` for `example.slack.com`, and the user ID),
  `slack channels add|remove|list` and `slack show`, which prints the
  subject, fetch range, channels and the fields each staged record needs.
  Slack is opt-in: without settings, `import` accepts no Slack records.
  `import` and `validate` accept only the subject's own verified messages
  from its configured channels (for a report, channels the manager
  confirmed they share with `--shared-with-manager`), never direct
  messages, with a parent-thread reference that is only an ID or
  permalink, and with message text free of raw Slack mention and link
  markup (`<@U…|name>`, `<#C…|name>`, `<!here>`, `<url|label>`), which
  can carry other people's names. Private channels need the `--private`
  opt-in. Changes keep the
  rest of the config, comments included, and replace it in one step.
- Imported messages are read as supplementary evidence, apart from PRs and
  tickets: `status` counts them (and flags unreadable record files and an
  import that did not finish), `stats.json` and `get_stats` count them in a
  separate `messages` section, `filter` copies them (only `--linked-only`
  applies, through their mentions), and the new read-only MCP tool
  `search_messages` searches them. Project detection, the timeline and
  `analyze team` cover PRs and tickets only; `analyze` says so, and
  `get_projects` and `get_timeline` return a `coverage` note.
- Mentions in imported records resolve to PRs and tickets in the work log
  when read, and stay unresolved when nothing matches; they are never stored
  as links. `link` reports how many resolved, and `get_linked_work` lists the
  messages that mention a PR or ticket. PR URLs are compared in a normalized
  form (case, `www.`, tabs such as `/files`, trailing slash, query, fragment
  and API URLs), in `link`, `filter --linked-only` and `get_linked_work`.
- The writing, detection, peer-review and manager skills cite imported
  messages as supplementary evidence: never instructions, never authored
  work, and the user's own words only when attribution is verified.
- Two Slack skills, for IC profiles and for reports in a manager profile,
  that read Slack read-only through the assistant's Slack connector:
  `/work-chronicler-setup-slack` finds the workspace and user ID and lets
  you choose the channels to import from (public channels by default,
  private channels only when you opt in, never direct messages; for a report,
  only channels it checks you both belong to), and
  `/work-chronicler-import-slack` imports the subject's own messages from
  those channels in the fetch range, without other people's replies or
  names (mentions become `@someone`), through `validate` and `import`. Run
  `skills install` to add them.

### Changed

- `filter` builds the whole subset beside `filtered/`, with a `.filter.json`
  record of its filters and counts, reads it back, and then swaps it in. If
  anything fails first, the previous subset is kept as it was; once the new
  subset is in place, failing to tidy up leftovers is only a warning. One
  `filter` runs per work log at a time (`.filter-lock`); a second run is
  refused and changes nothing.
- The filtered subset is in use whenever `filtered/` exists, even when
  nothing matched or it holds only imported messages; `analyze` and the MCP
  server no longer fall back to the full work log, and `status` shows the
  subset's filters and counts. The MCP server checks which subset is
  selected on every tool call, so a running client follows `filter` and
  `filter --clear` without a restart. If a `filter` run is in progress or
  was interrupted mid-swap, `analyze` (without `--full`) stops with an error
  and every MCP tool returns no results with a `note`, until the swap
  finishes or the next `filter` restores the previous subset (or
  `filter --clear` discards it).
- `search_pr_reviews` no longer reads the full work log when the filtered
  subset was made before reviews were fetched: it returns no results and a
  `note` asking you to re-run `filter`. Without a configured
  `github.username`, `search_pr_reviews` and `status` no longer present any
  review record as yours: they return or count none and say why. The four
  writing skills get review
  records from `search_pr_reviews` first, use `status` for diagnostics, and
  keep the reviewer check when they read review files directly.

### Fixed

- `filter` removes records that no longer match, of every type, instead of
  leaving them in `filtered/` until `--clear`.
- A filtered subset in which no authored PR matched is no longer ignored in
  favor of the full work log.
- The 0.5.0 notes below say "your first `fetch --reviews`"; the command is
  `fetch github --reviews` (or `fetch all --reviews`).
- `skills install --overwrite` no longer deletes an installed skill before
  its replacement is in place. Each skill is staged beside its destination
  and checked first; the old entry is moved aside and removed only once the
  new one checks out, so a failed copy or link keeps the previous skill. A
  temporary or replaced entry that cannot be removed is reported with its
  location instead of stopping the run, and the next install cleans up after
  an install that was interrupted part-way.

## [0.5.0] - 2026-11-08

### Added

- `skills install` migrates skills installed under old names on each tool you
  select: it installs and checks the new name first, then asks before removing
  the old one (declining keeps both). Old symlinks, working or broken, are
  unlinked without touching their targets; old copies are removed only after
  the new name is in place, and are kept when the new name is held by
  something else or fails to install, or while any installed skill in any
  tool resolves into the old copy (such as a symlink to it). Tools you do not
  select are left alone and named so you can migrate them separately.
  `skills list` flags old names.
- `fetch github --reviews` and `fetch all --reviews` record the PR reviews
  and inline review comments you gave inside the fetch range, on other
  people's PRs in your configured orgs and repos, however old the PR (your
  own PRs are skipped). Pending reviews and
  ordinary PR conversation comments are left out. Each reviewed PR is stored
  once at `work-log/pr-reviews/<org>/<repo>/<number>.md` and updated on later
  fetches; it is never counted as a PR you authored. If `pr-reviews/` already
  holds another GitHub user's records, the fetch refuses and writes nothing.
  Opt-in because it costs extra GitHub requests. IC profiles only: manager
  profiles print a notice and skip it.
- `status` shows the reviewed PRs, reviews and inline comments; the new
  read-only MCP tool `search_pr_reviews` searches them (both leave out records
  written for another GitHub user, and say so); `filter` copies them
  into `filtered/` using its org and repo selectors. Re-run `filter` after
  your first `fetch --reviews`; until then `status` and `search_pr_reviews`
  point out that the subset is missing them.
- `work-chronicler-write-self-review`, `work-chronicler-write-resume-bullets`,
  `work-chronicler-update-resume` and `work-chronicler-summarize-work` cite PR
  reviews you gave as review work, never as authored PRs. They cite only
  records whose `reviewer` matches your `github.username` and say how many
  they left out.
- `skills install` flags for running without prompts: `--tool <tool...>`,
  `--method <copy|symlink>`, `--yes`, `--overwrite` and `--keep-old`. Without
  flags it prompts as before.

### Changed

- `skills install` asks about overwriting only when something (a skill, file
  or working link) already occupies the name of a skill it is about to
  install, and replaces it only if you agree or pass `--overwrite`; broken
  links are still repaired. Skills under old names no longer trigger the
  prompt.
- **Breaking:** five package skills are renamed to follow one rule,
  `work-chronicler-[manager-]<verb>-<object>`. Re-run
  `work-chronicler skills install` after upgrading on every AI tool that has
  the skills (it replaces the old names; add `--overwrite` to also refresh
  skills whose names did not change), then restart the tool so it reloads
  its skill list:

  | Old name                                    | New name                                             |
  | ------------------------------------------- | ---------------------------------------------------- |
  | `work-chronicler-generate-resume-bullets`   | `work-chronicler-write-resume-bullets`               |
  | `work-chronicler-mgmt-write-peer-review`    | `work-chronicler-write-peer-review`                  |
  | `work-chronicler-mgmt-write-review-packet`  | `work-chronicler-manager-write-review-packet`        |
  | `work-chronicler-mgmt-quarterly-highlights` | `work-chronicler-manager-write-quarterly-highlights` |
  | `work-chronicler-mgmt-team-summary`         | `work-chronicler-manager-write-team-summary`         |

  `work-chronicler-write-peer-review` drops the manager prefix because its
  quick mode works in any profile; evidence-backed reviews still need the
  colleague added as a report in a manager profile.

### Fixed

- The MCP server reports the package version to clients instead of a
  hardcoded `0.1.0`.

## [0.4.0] - 2026-11-07

### Added

- MIT `LICENSE` file, `CONTRIBUTING.md` and this changelog.
- `documentation/` pages for configuration, the command reference and the MCP
  server, with a `documentation/index.md` entry point.
- `analyze team` writes a real `team-timeline.json`: each report's
  `analysis/timeline.json` merged by month and week, with team totals and
  per-report attribution. Each week is filed under the month of its start
  date, and a report listed twice counts once. Reports whose timeline is
  missing, malformed or has non-canonical dates are listed in
  `skippedReports`. It used to be written as `{}`.

### Changed

- **Breaking:** requires Node.js 22.22.1 or later (24 recommended).
- **Breaking:** the package no longer has a programmatic entry point; importing
  `work-chronicler` used to run the CLI and now fails. Use the
  `work-chronicler` binary (including `work-chronicler mcp` for the MCP server).
- **Breaking:** stricter config validation. A profile with `github.orgs`
  configured now needs a non-empty `github.username`, and every manager report
  needs a non-empty `github` name (an empty one stops the whole manager config
  from loading, including JIRA-only commands). GitHub names are trimmed and a
  leading `@` is dropped; a name still containing `@` (such as `@@acme`) is
  rejected. Fix the reported field in `config.yaml` and re-run.
- **Breaking:** skills installed as symlinks before 0.4 point into the removed
  `.agent/skills/` directory and stop working after the upgrade. Run
  `work-chronicler skills install` again to replace them. If an older copy of
  the package is still installed elsewhere, its links keep working and keep
  serving the 0.3 skills; answer yes to "Overwrite existing skills?" to
  replace them.
- An unexpected error thrown outside a command's own error handling (for
  example a prompt closed on non-interactive stdin) now prints
  `Error: <message>` and exits 1 instead of dumping a Node.js stack trace.
- Built-in validation messages follow Zod 4 wording, and commands reject
  unexpected extra arguments (Commander 15).
- Releases publish through npm trusted publishing with provenance.
- Toolchain: pnpm 12, TypeScript 7, Zod 4, oxlint + oxfmt (replacing Biome),
  Vitest with co-located tests, and security-only Dependabot.
- Skills moved from `.agent/skills/` to `.agents/skills/`; `skills install`
  reads them from the new location.
- The npm package now ships only `dist`, `bin` and the `work-chronicler-*`
  skills. The repo-local `release-notes` skill and other agent files are no
  longer published.
- README rewritten around a pipeline overview, a sample work-log file and a
  scoped feature list; detailed reference moved to `documentation/`.
- Package description, keywords, `homepage` and `bugs` metadata updated.
- Pull request template follows the Purpose / Changes / Testing / Notes shape.
- Impact classification (`analyze --tag-prs`) was relabeled. A breaking
  marker (`feat!:`, `feat(api)!:`) is flagship. Dependency updates (a
  dependency label, or a `chore(deps)` / `build(deps)` title) stay minor at
  any size. A flagship keyword such as `migration` or `platform` no longer
  promotes a PR that is otherwise minor (`fix typo in migration guide`,
  `docs: platform setup guide`). A `chore`, `docs`, `style`, `ci` or `build`
  PR of major size is now major instead of minor. Re-run
  `analyze --tag-prs` to relabel existing PRs.

### Removed

- `CLAUDE.md`; `AGENTS.md` is the only agent instruction file.
- Legacy agent scaffolding: `.agent/README.md`, `.agent/projects/`,
  `.agent/scripts/`, `.agents/projects/`, `.claude/commands/`, `.cursor/` and
  `.cursorignore`.

### Fixed

- MCP `get_stats`, `get_projects` and `get_timeline` looked for
  `stats.json.json`-style paths and never found generated analysis.
- `analyze reports` wrote per-report analysis to `analysis/.analysis/`, where
  `analyze team` and the manager skills never looked; it now writes to
  `reports/<id>/analysis/`.
- The team contributor matrix credited every report with every project; each
  report now lists only the projects from its own analysis.
- `skills list`, `install` and `uninstall` now see symlinked skills whose target
  is gone (such as links into the old `.agent/skills/` path) and replace or
  remove them instead of failing with `EEXIST`.
- `link` no longer records standard and version names such as `UTF-8`,
  `ISO-8601`, `SHA-256` or `GPT-4` as JIRA tickets when no JIRA projects are
  configured. Links written by earlier versions stay until the PRs are
  re-fetched without `--cache`.
- `link` still links a fetched ticket whose key looks like a standard (such as
  `TLS-1`) when no JIRA projects are configured; only unknown references are
  ignored.
- Reading a PR or ticket file no longer strips the indentation of the first
  body line, so a description that starts with an indented code block keeps
  it when `link` or `analyze --tag-prs` rewrites the file.
- `analyze team` no longer crashes when a report ID matches a built-in object
  property such as `constructor`.
- `fetch jira` no longer requests the same page forever when JIRA repeats a
  page token; it reports the project as incomplete and exits non-zero.
- `fetch jira` keeps paging past an empty page that JIRA does not mark as the
  last one, instead of dropping the tickets on later pages.
- `fetch jira` and `fetch all` stop on a JIRA rate limit (HTTP 429) and say
  when to retry, using the `Retry-After` header, instead of sending the next
  project's request into the same limit. Other project failures still let
  the remaining projects fetch.
- `fetch jira` and `fetch all` exit non-zero when a JIRA project fails to
  fetch; the other projects are still fetched.
- `fetch jira` prints its final summary line as a yellow warning, not a green
  success, when a project or report failed, as `fetch github` does.
- `fetch jira` and `fetch all` count the tickets a project wrote before it
  failed partway through, while still reporting it as incomplete and exiting
  non-zero.
- `init`'s first fetch lists an incomplete JIRA project in its summary instead
  of printing `Done!`.
- `link` ignores numbered standard names such as `SHA3-256` or `MD5-1` when no
  JIRA projects are configured, and matches configured project keys even with
  surrounding spaces.
- Reading a PR or ticket file keeps blank lines at the start of the body;
  only the separator the writer adds is removed.
- GitHub org names with a leading `@` are normalized, and `fetch github` and
  `fetch all` warn and exit non-zero when an org's repositories cannot be
  listed or every selected repository fails. An org whose repositories have
  no matching PRs still succeeds (#14).
- Manager-mode and skills guides no longer show CLI flags that do not exist
  (`--since`, `--until`, `--no-cache`, `--discover-repos`, `--skip-fetch`).
- MCP `get_linked_work` no longer returns PR 123 when asked for `23` or for a
  `…/pull/23` URL. It matches the exact URL first, and treats bare digits as
  the whole PR number; a number shared by several repos asks for the full URL.
- Manager mode is read from `mode: manager` in the profile's `config.yaml`
  instead of the profile being named `manager`. A manager profile with another
  name (as `init --mode manager` allows) now works with `reports`,
  `analyze reports`, `analyze team` and the manager `fetch` paths, and an IC
  profile named `manager` is no longer treated as a manager profile.
- `analyze team` prints the team analysis directory as its output path, not
  a report directory named after the profile.
- `init --mode manager` auto-discovers a report's repos with the GitHub token
  entered in the wizard, instead of failing when `GITHUB_TOKEN` is not set. The
  token is still saved only to the profile's `.env`.
- `analyze team` lists a report in `skippedReports` when its timeline's date
  range is reversed or is not a real `YYYY-MM-DD` date (such as `2025-02-30`),
  instead of merging it into the team date range.
- `analyze --timeline` and `analyze reports --timeline` compute weeks and
  months in UTC. West of UTC, a week starting on the 1st was filed under the
  previous month, and a PR merged late on Sunday local time (Monday in UTC)
  landed in the previous week. Re-run the timeline to regroup existing
  analysis.
- Manager `fetch jira` and `fetch all` label a report whose JIRA project
  failed as a yellow `⚠ <name> incomplete (...; JIRA failed for <projects>)`
  instead of a green `✓ <name> complete`.
- JIRA project keys in `config.yaml` (`jira.instances[].projects`) and in
  manager reports (`jiraProjects`) are trimmed when the config is read, so
  `fetch jira` no longer queries `" PROJ "` or stores tickets under a
  directory with stray spaces. Case is kept, so existing tickets stay in their
  project directory; `link` already matches keys case-insensitively.
- Repo auto-discovery in `reports add` and `init --mode manager` searches the
  profile's `fetch.since`/`fetch.until` range. It used to pass an invalid
  date, so it listed repos and PRs of any age.
- Repo auto-discovery with a `fetch.until` date no longer skips a repo whose
  latest activity is after `until` when the user has PRs inside the range.
- `reports update --add-jira-project` and `--remove-jira-project` trim the
  key they are given, so ` PROJ ` removes the stored `PROJ` and adding an
  existing key no longer stores it twice.
- `analyze reports --tag-prs` classifies with `analysis.thresholds` from the
  manager profile's `config.yaml`, as `analyze --tag-prs` does for IC profiles.
  The manager config used to drop the setting and always apply the defaults.
  PRs are classified before `stats.json` and `timeline.json` are written, so
  both report the same impact as the tagged PR files; untagged PRs use the
  profile's thresholds there too.

## [0.3.2] - 2026-03-10

### Fixed

- `analyze reports` no longer requires a report ID; it prompts for one.

## [0.3.1] - 2026-03-10

### Fixed

- Manager-mode `fetch all`, `fetch github` and `fetch jira` no longer fail
  config validation.
- The manager `init` wizard asks for the fetch date range.

### Changed

- All skills save generated documents to `outputs/` and also reply in the
  conversation.
- GitHub token scope guidance (`read:org` for org discovery) is clearer in the
  wizard and in error messages.

## [0.3.0] - 2026-02-13

### Added

- `work-chronicler-mgmt-write-peer-review` skill, with a quick mode that needs no
  setup and a full mode that cites a colleague's work log.
- `documentation/available-skills.md` skills guide.

## [0.2.2] - 2026-02-11

### Fixed

- The CLI reads its version from `package.json` instead of a hard-coded value.

## [0.2.1] - 2026-02-10

### Added

- Repo-local `release-notes` skill for maintainers.

### Changed

- Quick start and `init` next steps walk through fetch, status, filter, analyze
  and skills install.

## [0.2.0] - 2026-02-10

### Added

- Interactive `init` wizard with GitHub repo discovery.
- Profiles: `profile list|switch|delete` and the global `--profile` option.
- `workspace` command for resolving profile paths.
- `skills install|uninstall|list` and six IC skills.
- Manager mode: `init --mode manager`, `reports add|list|update|remove`,
  `--report` and `--all-reports` on fetch commands, `analyze reports` and
  `analyze team`, and three manager skills.

### Security

- Profile `.env` files are written with mode `600`, and profile names are
  validated.

## [0.1.1] - 2026-01-28

### Changed

- Prompts migrated to `@inquirer/prompts`; default output directory updated.

## [0.1.0] - 2026-01-20

### Added

- First release: `init`, `fetch github`, `fetch jira`, `fetch all`, `link`,
  `analyze`, `filter`, `status`, the MCP server, and Claude Code and Cursor
  commands for summaries, resume bullets, self-reviews, projects and themes.

[Unreleased]: https://github.com/tkstang/work-chronicler/compare/v0.7.0...HEAD
[0.7.0]: https://github.com/tkstang/work-chronicler/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/tkstang/work-chronicler/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/tkstang/work-chronicler/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/tkstang/work-chronicler/compare/v0.3.2...v0.4.0
[0.3.2]: https://github.com/tkstang/work-chronicler/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/tkstang/work-chronicler/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/tkstang/work-chronicler/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/tkstang/work-chronicler/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/tkstang/work-chronicler/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/tkstang/work-chronicler/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/tkstang/work-chronicler/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/tkstang/work-chronicler/releases/tag/v0.1.0
