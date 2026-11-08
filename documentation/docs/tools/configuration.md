---
title: Configuration
description: Profiles, config.yaml fields, GitHub and JIRA tokens, environment variables and the on-disk workspace layout.
---

# Configuration

`work-chronicler init` writes everything described here. Edit the files by hand
afterwards when you need to change orgs, repos or the date range.

## Profiles

A profile is an isolated work history with its own config, tokens and data.
Use separate profiles for separate employers, or for work and personal GitHub.

```bash
work-chronicler init --profile work         # create a profile without the name prompt
work-chronicler profile list                # list profiles; the active one is marked
work-chronicler profile switch personal     # change the active profile
work-chronicler profile delete old-job      # delete a profile and all its data (-f skips the prompt)
work-chronicler status --profile personal   # run one command against another profile
```

The active profile is stored in `~/.work-chronicler/config.json`. The global
`--profile <name>` option and the `WORK_CHRONICLER_PROFILE` variable both
override it.

`init --mode manager` creates a manager profile instead; see
[Manager mode](../workflows/manager-mode.md).

## The `init` wizard

For an IC profile, `init` asks for:

1. A profile name (skipped with `--profile`).
2. Data sources: GitHub, JIRA or both.
3. How far back to fetch, or an explicit start and end date.
4. Your GitHub username and orgs. For each org, choose manual entry,
   auto-discovery (repos where you have recent PRs) or all repos.
5. JIRA instance name, URL, email and projects.
6. Tokens, which are written to the profile's `.env` with mode `600`.
7. Whether to fetch now.

## `config.yaml`

Each profile keeps its config at `~/.work-chronicler/profiles/<profile>/config.yaml`.
[`work-chronicler.example.yaml`](https://github.com/tkstang/work-chronicler/blob/main/work-chronicler.example.yaml) is an annotated
example.

| Field                       | Required                  | Meaning                                                                                                              |
| --------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `github.username`           | when `github.orgs` is set | Your GitHub login. Only PRs you authored are fetched, plus with `--reviews` the reviews you gave.                    |
| `github.token`              | no                        | Token; `GITHUB_TOKEN` in `.env` or the environment is used otherwise.                                                |
| `github.orgs[].name`        | yes                       | Org or user login as in `github.com/<name>`.                                                                         |
| `github.orgs[].repos`       | no                        | Repo names, or `["*"]` (the default) for every repo in the org.                                                      |
| `jira.instances[].name`     | yes                       | Label for the instance; used in the storage path.                                                                    |
| `jira.instances[].url`      | yes                       | HTTPS URL, for example `https://acme.atlassian.net`.                                                                 |
| `jira.instances[].email`    | no                        | Account email; `JIRA_EMAIL` is used otherwise.                                                                       |
| `jira.instances[].token`    | no                        | API token; `JIRA_TOKEN` is used otherwise.                                                                           |
| `jira.instances[].projects` | no                        | Project keys to fetch; surrounding spaces are removed and keys are upper-cased.                                      |
| `output.directory`          | no                        | Work-log location, relative to the config file. Default `./work-log`.                                                |
| `fetch.since`               | yes                       | Start date, `YYYY-MM-DD`.                                                                                            |
| `fetch.until`               | no                        | End date, or `null` for today.                                                                                       |
| `analysis.thresholds`       | no                        | Override the impact size thresholds (see below).                                                                     |
| `slack`                     | no                        | Slack settings for the Slack import skills (see below). Absent means no Slack records are imported.                  |
| `googleDocs`                | no                        | Google Docs settings for the Google Docs import skill (see below). Absent means no Google Docs records are imported. |

JIRA fetches tickets in each project that are assigned to you and were created
inside the date range.

### Slack

Slack import is opt-in. The `slack` section names whose messages a Slack
import skill may collect and from which channels; `import` refuses any Slack
record that does not match it. The CLI never contacts Slack and never stores
Slack credentials. Set it with the `slack` commands (see
[Slack commands](slack.md)) rather than by hand; they keep the rest of the
file intact. The `/work-chronicler-setup-slack` skill finds the IDs and runs
them for you (see [Import Slack messages](../workflows/import-slack.md)).

```yaml
slack:
  workspace: T0EXAMPLE # team ID, or the URL label (example for example.slack.com)
  user: U0EXAMPLE # your Slack user ID
  channels:
    - id: C0EXAMPLE
      name: billing-launch
      reason: Launch coordination for usage-based billing
      private: false
```

| Field                      | Required | Meaning                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `slack.workspace`          | yes      | The workspace: its team ID, `T…` (or `E…` for an Enterprise org), or, when no Slack tool shows the ID, its URL label: the first part of its host name, in lower case (`example` for `example.slack.com` or `example.enterprise.slack.com`). Records' `sourceAccount` must be exactly this value, so keep it once messages are imported. With a URL label, only permalinks on that label's host are accepted: in an Enterprise Grid org, messages from channels whose permalinks use another workspace's host (`team-a.slack.com`) are refused, so configure the team or `E…` org ID when a Slack tool shows it, or only channels on the label's host. |
| `slack.user`               | yes      | Your Slack user ID, `U…` or `W…`. Only messages this user wrote are imported. `slack configure` refuses another user while the work log holds Slack messages by a different user.                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `slack.channels[].id`      | yes      | Channel ID, `C…` or `G…`. Direct messages (`D…`) are never allowed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `slack.channels[].name`    | yes      | Channel name without `#`. Group direct messages (`mpdm-…`) are never allowed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `slack.channels[].reason`  | yes      | One line saying why the channel holds review-relevant work.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `slack.channels[].private` | no       | `true` opts in to a private channel; the default `false` means public. A `G…` ID needs `true`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

A manager profile keeps the same section under each report (`reports[].slack`),
naming the report's Slack user, and each report channel also has
`sharedWithManager: true`: the manager confirmed they and the report are both
members. See [Import Slack messages](../workflows/import-slack.md#for-a-report).

### Google Docs

Google Docs import is opt-in. The `googleDocs` section names the Google
account whose Docs an import skill may collect: only Google Docs that account
owns, modified inside the `fetch` range, are imported, and `import` refuses
any other. The CLI never contacts Google and never stores Google credentials.
Set it with `google-docs configure` (see [Google Docs commands](google-docs.md))
rather than by hand.

```yaml
googleDocs:
  account: you@example.com # the Google account that owns the Docs
```

| Field                | Required | Meaning                                                                                                                                                                                                                                    |
| -------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `googleDocs.account` | yes      | The subject's Google account email address, read in lower case. Records' `sourceAccount` and the Doc's owner must be this account. `google-docs configure` refuses another account while the work log holds Docs owned by a different one. |

A manager profile keeps the same section under each report
(`reports[].googleDocs`), naming the report's account, which is not the account
the skill reads Drive as: it reads as the manager, so only Docs the report owns
and shared with the manager can be found. See
[Import Google Docs](../workflows/import-google-docs.md#for-a-report).

### Names

GitHub org and user names are logins. A leading `@` is stripped (`@acme` is read
as `acme`); any other `@` is rejected.

### When an org fetches nothing

If nothing can be fetched from an org (every repository fails, or with
`repos: ["*"]` the org cannot be listed, for example because the name is
misspelled or the token lacks access), `fetch github` and `fetch all` print a
warning naming the org, finish the remaining orgs and steps, and exit with
status 1 so scheduled runs notice.

### Impact thresholds

`analyze --tag-prs` classifies each PR from its conventional-commit prefix,
title patterns, labels and size. The first matching rule wins:

1. A breaking marker (`feat!:`, `feat(api)!:`) is flagship.
2. A dependency update (a `dependencies`, `renovate` or `dependabot` label, or a
   `chore(deps)` / `build(deps)` title) is minor at any size.
3. Flagship size is flagship.
4. A flagship keyword in the title (`migration`, `platform`, `rewrite`,
   `breaking`, ...) is flagship, unless the PR also has a minor signal: a minor
   type (`docs`, `chore`, `style`, `ci`, `build`), a minor title or label at
   minor size, or a change of at most 10 lines in at most 2 files.
5. A minor type below major size, a minor title or label at minor size, or a
   change of at most 10 lines in at most 2 files is minor.
6. A `feat` or `refactor` type, major size or a title starting with `Add`,
   `Implement` or `New` is major.
7. Otherwise `fix`, `perf` and `test` are standard, and so is everything else.

Size thresholds (additions + deletions, and changed files) default to:

```yaml
analysis:
  thresholds:
    minor: { maxLines: 20, maxFiles: 3 }
    major: { minLines: 200, minFiles: 8 }
    flagship: { minLines: 500, minFiles: 15 }
```

## Tokens

- **GitHub:** create a personal access token at
  <https://github.com/settings/tokens> with `repo` (or `public_repo` for public
  repos only). Add `read:org` if `init` should discover repos in an
  organization; without it, enter repos by hand.
- **JIRA:** create an API token at
  <https://id.atlassian.com/manage-profile/security/api-tokens>.

## Environment variables

| Variable                   | Purpose                                                                |
| -------------------------- | ---------------------------------------------------------------------- |
| `WORK_CHRONICLER_HOME`     | Workspace root. Default `~/.work-chronicler`.                          |
| `WORK_CHRONICLER_PROFILE`  | Profile to use instead of the active one.                              |
| `GITHUB_TOKEN`             | GitHub token when `github.token` is not set.                           |
| `JIRA_TOKEN`, `JIRA_EMAIL` | JIRA credentials when not set per instance.                            |
| `WORK_CHRONICLER_CONFIG`   | MCP server only: explicit path to a legacy `work-chronicler.yaml`.     |
| `WORK_CHRONICLER_DIR`      | MCP server only: directory containing a legacy `work-chronicler.yaml`. |

## Workspace layout

```txt
~/.work-chronicler/
├── config.json                  # active profile
└── profiles/<profile>/
    ├── config.yaml
    ├── .env                     # tokens, mode 600
    ├── outputs/                 # documents written by AI skills
    └── work-log/
        ├── pull-requests/<org>/<repo>/<YYYY-MM-DD>_<number>.md
        ├── pr-reviews/<org>/<repo>/<number>.md   # reviews you gave, from `fetch github --reviews`
        ├── jira/<instance>/<project>/<KEY>.md
        ├── messages/<source>/<hash>.md   # messages stored by `import`
        ├── documents/<source>/<hash>.md  # Google Docs stored by `import`
        ├── notes/               # your own notes, read by skills
        ├── performance-reviews/ # past reviews you add, read by skills
        ├── resumes/             # an existing resume, for update-resume
        ├── .analysis/           # stats.json, projects.json, timeline.json
        └── filtered/            # subset written by `filter`, with its own .analysis/ and .filter.json
```

`init` creates `notes/`, `performance-reviews/` and `.analysis/`; create
`resumes/` yourself. While `import`, `filter` or `filter --clear` runs, the
work log holds the work-log lock, `.import-lock/` and `.filter-lock/` (one
run at a time). While `import` stores a batch, or after one was interrupted,
it also holds `.import-transaction/`, and imported records are not read until
it is gone; see [Import and validate](import.md). When `filtered/` exists, even
empty, `analyze` asks whether to use it, and the MCP server reads it instead
of the full work log. While `filter` replaces the subset, the work log
briefly holds `.filter-staging-<id>/` and `.filter-previous-<id>/`; see
[Link, analyze and filter](link-analyze-filter.md).

Manager profiles use a different layout under `reports/<id>/`; see
[Manager mode](../workflows/manager-mode.md).
