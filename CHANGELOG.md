# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

### Removed

- `CLAUDE.md`; `AGENTS.md` is the only agent instruction file.
- Legacy agent scaffolding: `.agent/README.md`, `.agent/projects/`,
  `.agent/scripts/`, `.agents/projects/`, `.claude/commands/`, `.cursor/` and
  `.cursorignore`.

### Fixed

- fix(github): normalize @-prefixed org names, warn and exit non-zero when an
  org fetches nothing (#14)
- Manager-mode and skills guides no longer show CLI flags that do not exist
  (`--since`, `--until`, `--no-cache`, `--discover-repos`, `--skip-fetch`).

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

[Unreleased]: https://github.com/tkstang/work-chronicler/compare/v0.3.2...HEAD
[0.3.2]: https://github.com/tkstang/work-chronicler/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/tkstang/work-chronicler/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/tkstang/work-chronicler/compare/v0.2.2...v0.3.0
[0.2.2]: https://github.com/tkstang/work-chronicler/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/tkstang/work-chronicler/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/tkstang/work-chronicler/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/tkstang/work-chronicler/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/tkstang/work-chronicler/releases/tag/v0.1.0
