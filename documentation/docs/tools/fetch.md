---
title: Fetch commands
description: fetch github, fetch jira and fetch all, their flags and date range, and how --reviews records the PR reviews you gave.
---

# Fetch commands

| Command        | Meaning                                                       |
| -------------- | ------------------------------------------------------------- |
| `fetch github` | Fetch your PRs from the configured orgs and repos.            |
| `fetch jira`   | Fetch your tickets from the configured JIRA projects.         |
| `fetch all`    | Fetch both, then run `link`. Add `--no-link` to skip linking. |

The fetch commands accept these flags; where a row names commands, only those accept it (`fetch jira` rejects `--reviews`):

| Flag                  | Meaning                                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-c, --config <path>` | Use this config file instead of the profile's.                                                                                                      |
| `-v, --verbose`       | Show detailed output.                                                                                                                               |
| `--cache`             | Skip items already in the work log. Without it, you are asked when data exists.                                                                     |
| `--reviews`           | `fetch github` and `fetch all` only: also fetch the PR reviews you gave (see below). IC profiles only; manager profiles print a notice and skip it. |
| `--report <id>`       | Manager mode: fetch for one report.                                                                                                                 |
| `--all-reports`       | Manager mode: fetch for every report.                                                                                                               |

The date range comes from `fetch.since` and `fetch.until` in the config; there
are no date flags.

## PR reviews you gave

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
same file. With no `github.orgs` configured, `--reviews` fetches nothing: it prints that it
skipped PR reviews, does not check `pr-reviews/`, and does not fail. With orgs
configured, if `pr-reviews/` already holds records for a different GitHub
user, for example because you changed `github.username`, `--reviews` refuses
to run, fetches nothing and exits with an error; use a separate profile or
output directory for each person, or remove `pr-reviews/`. `status` does not
count such records and says so. With `--cache`, a reviewed PR is skipped when its last update is the
one its file recorded and the file's date range starts on or before this
fetch's start and either ends on or after this fetch's end or ends after
the PR's last update (no review can be newer than that update). These records are never counted as PRs you authored.
A rate limit stops the run; other failures are reported per org and make the
run exit with status 1.

For the steps from fetching reviews to querying them, see [Record the PR reviews you gave](../workflows/pr-reviews-given.md).
