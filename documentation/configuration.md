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
[Manager mode](manager-mode.md).

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
[`work-chronicler.example.yaml`](../work-chronicler.example.yaml) is an annotated
example.

| Field | Required | Meaning |
| --- | --- | --- |
| `github.username` | when `github.orgs` is set | Your GitHub login. Only PRs you authored are fetched, plus with `--reviews` the reviews you gave. |
| `github.token` | no | Token; `GITHUB_TOKEN` in `.env` or the environment is used otherwise. |
| `github.orgs[].name` | yes | Org or user login as in `github.com/<name>`. |
| `github.orgs[].repos` | no | Repo names, or `["*"]` (the default) for every repo in the org. |
| `jira.instances[].name` | yes | Label for the instance; used in the storage path. |
| `jira.instances[].url` | yes | HTTPS URL, for example `https://acme.atlassian.net`. |
| `jira.instances[].email` | no | Account email; `JIRA_EMAIL` is used otherwise. |
| `jira.instances[].token` | no | API token; `JIRA_TOKEN` is used otherwise. |
| `jira.instances[].projects` | no | Project keys to fetch; surrounding spaces are removed and keys are upper-cased. |
| `output.directory` | no | Work-log location, relative to the config file. Default `./work-log`. |
| `fetch.since` | yes | Start date, `YYYY-MM-DD`. |
| `fetch.until` | no | End date, or `null` for today. |
| `analysis.thresholds` | no | Override the impact size thresholds (see below). |

JIRA fetches tickets in each project that are assigned to you and were created
inside the date range.

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

| Variable | Purpose |
| --- | --- |
| `WORK_CHRONICLER_HOME` | Workspace root. Default `~/.work-chronicler`. |
| `WORK_CHRONICLER_PROFILE` | Profile to use instead of the active one. |
| `GITHUB_TOKEN` | GitHub token when `github.token` is not set. |
| `JIRA_TOKEN`, `JIRA_EMAIL` | JIRA credentials when not set per instance. |
| `WORK_CHRONICLER_CONFIG` | MCP server only: explicit path to a legacy `work-chronicler.yaml`. |
| `WORK_CHRONICLER_DIR` | MCP server only: directory containing a legacy `work-chronicler.yaml`. |

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
        ├── notes/               # your own notes, read by skills
        ├── performance-reviews/ # past reviews you add, read by skills
        ├── resumes/             # an existing resume, for update-resume
        ├── .analysis/           # stats.json, projects.json, timeline.json
        └── filtered/            # subset written by `filter`, with its own .analysis/
```

`init` creates `notes/`, `performance-reviews/` and `.analysis/`; create
`resumes/` yourself. When `filtered/` exists, `analyze` asks whether to use it,
and the MCP server reads it instead of the full work log.

Manager profiles use a different layout under `reports/<id>/`; see
[Manager mode](manager-mode.md).
