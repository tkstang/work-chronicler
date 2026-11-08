---
oat_template: false
oat_status: complete
oat_ready_for: oat-project-implement
oat_blockers: []
oat_last_updated: 2026-11-08
oat_phase: plan
oat_phase_status: complete
oat_plan_hill_phases: [] # [] = none for brief modes
oat_plan_parallel_groups: [] # groups of phases that run concurrently in worktrees; [] = fully sequential
oat_plan_source: goal
oat_auto_review_at_hill_checkpoints: false # brief: no checkpoints
oat_import_reference: null
oat_import_source_path: null
oat_import_provider: null
oat_generated: false
---

# Project Brief: work-chronicler-evidence-expansion

> Execute this brief using `oat-project-implement`. Phases are the units of
> progress: each `## Phase pNN:` block carries intent and exit evidence instead
> of planned tasks, and only the next phase must be concrete. Execution records
> (`### Task pNN-tNN:`) live in `implementation.md`, never here.

**Commit Convention:** `{type}({scope}): {description}` - e.g., `feat(p01-t01): add user auth endpoint`

**Phase block grammar (strict):** each phase is one `## Phase pNN: <name>`
heading followed by a blank line and these exact lines:

```markdown
**Intent:** one or more non-empty lines
**Exit evidence:** one or more non-empty lines
**Provisional:** no
```

Phase IDs are stable and document order governs execution. `**Provisional:**`
accepts `yes` or `no`; absent means `no`. The first phase must not be
provisional. Do not add `### Task` headings to phases.

## Goal

Make work-chronicler gather review-relevant evidence beyond authored PRs and
JIRA tickets — PR reviews the user gave, Slack messages and owned Google Docs —
so self-reviews, resumes and manager review packets reflect the whole of
someone's work. New evidence flows through the same work log, filters, MCP
server and skills as PRs and tickets, under one verb-first skill naming rule,
with each milestone merged to `main` and released to npm. The user needs this
now to update their resume.

## Outcomes

1. **Package skills follow `work-chronicler-[manager-]<verb>-<object>` and
   `skills install` migrates the five renamed skills safely on every selected
   host.** — Evidence: migration tests (copy, live symlink, dangling symlink,
   replacement conflict, overwrite refusal, repeat install, per host); a
   packaged-install smoke test from the packed tarball into a temp `HOME`; a
   grep showing old names only in the migration map, its tests and
   CHANGELOG/upgrade notes.
2. **IC users can fetch the PR reviews they gave inside the fetch range,
   stored as their own records and never counted as authored work.** —
   Evidence: mocked tests for an old PR reviewed inside the range, repeated
   reviews on one PR, pending reviews excluded, pagination, edited comments,
   rate limiting, a reviewed PR absent from the work log, and equal PR numbers
   across repos; documentation of the invocation.
3. **A staged import contract lets skills hand records to the CLI:
   `work-chronicler import <dir>` validates, places and commits records
   atomically, and `work-chronicler validate` diagnoses them.** — Evidence:
   tests for malformed YAML, schema violations, duplicate identities, path
   escape, rejected batches leaving existing records intact, interrupted and
   repeated imports; nonzero exit and machine-readable errors on rejection.
4. **Imported evidence is visible to every consumer.** `filter`, `status`,
   stats, timeline, MCP tools, project detection and the writing and detection
   skills either include `messages` and `documents` or state their PR/ticket-only
   coverage, and mentions resolve to PRs and tickets where possible. —
   Evidence: a mixed work-log test with an existing filtered subset; MCP tool
   tests over imported records; linking tests for PR-URL normalization and
   ticket mentions; skill text reviewed against the CLI.
5. **Slack messages can be imported for an IC and, opt-in per report, for a
   manager's report**, through `work-chronicler-setup-slack` and
   `work-chronicler-import-slack`, under the privacy rules in Approach. —
   Evidence: synthetic import → validate → link → MCP acceptance test;
   negative tests (wrong identity, unconfigured report, prohibited channel, DM,
   malformed record, repeated import); a live read-only walkthrough against the
   user's own Slack with only redacted counts recorded.
6. **Google Docs the subject owns can be imported for an IC and, opt-in per
   report, for a manager's report (docs the report owns that are shared with the
   manager)**, through `work-chronicler-import-google-docs`. — Evidence:
   synthetic acceptance test; negative tests (doc not owned by the subject,
   unconfigured report, out-of-range doc, malformed record, repeated import); a
   live read-only walkthrough against the user's own Drive via `gog` with only
   redacted counts recorded.
7. **Each milestone is squash-merged to `main` and released: 0.5.0 (m01),
   0.6.0 (m02), 0.7.0 (m03).** — Evidence: merged PR URLs, green `release.yml`
   runs, `npm view work-chronicler@<version> version`, and a GitHub Release with
   notes from `/release-notes`.

## Approach

The existing architecture holds: the CLI and MCP server fetch, store and serve
data and never call an LLM; skills inside the user's assistant do AI work and
call external services (the Slack connector, `gog` or a Google Workspace MCP).
New sources therefore split into a **skill** that reads the service and writes a
staging batch, and the **CLI** that validates and stores it. GitHub reviews are
the exception: the CLI already talks to GitHub, so they are fetched directly.

### Design

- **Naming (m01).** Rule `work-chronicler-[manager-]<verb>-<object>`, verbs
  `setup`, `import`, `detect`, `summarize`, `write`, `update`. Renames:
  `generate-resume-bullets` → `write-resume-bullets`;
  `mgmt-write-peer-review` → `write-peer-review`;
  `mgmt-write-review-packet` → `manager-write-review-packet`;
  `mgmt-quarterly-highlights` → `manager-write-quarterly-highlights`;
  `mgmt-team-summary` → `manager-write-team-summary`. `release-notes` is
  repo-local and exempt. `skills install` carries an explicit old → new map;
  per selected host it installs and verifies the replacement before removing
  the old entry, unlinks symlinks (live or dangling) without touching targets,
  removes copies only after the replacement exists, respects the overwrite
  refusal, and leaves unselected hosts alone (documented). Removing old names is its own confirmed step: declining it keeps both old and new entries and prints a notice. `skills install` gains documented non-interactive flags (host selection, install method, `--yes`) so agents and the packaged smoke test can run it without prompts.
- **PR reviews given (m01).** REST-first. Inclusion by review `submitted_at`
  and inline comment `created_at` inside the fetch range, regardless of the
  reviewed PR's age or author. Pending reviews excluded; ordinary PR
  conversation comments excluded. Records keep review and comment IDs distinct,
  the canonical reviewed-PR URL and minimal parent metadata. Cache by stable
  record identity. Existing fatal rate-limit handling, sequential requests and per-repo failure reporting are preserved. IC-only.
- **Import envelope (m02).** Thin common frontmatter: schema version, source,
  stable source ID scoped to workspace/account, URL, event timestamps, capture
  time, subject (the IC or report the record is about), attribution with an
  honest `unverified` state, and mentions (ticket keys, PR URLs). Record types
  `messages` (m02) and `documents` (m03). Skills write a staging directory; the
  CLI validates every record, computes contained destination paths, and commits
  the batch atomically with defined upsert-by-identity. Manager mode stores
  records under `reports/<id>/work-log/`.
- **Consumers (m02).** Each consumer is extended or labelled PR/ticket-only;
  PR-only filters are defined for other evidence; a selected filtered subset is
  never silently bypassed. Linking distinguishes mentions from resolved links
  and adds PR-URL normalization; no general graph framework.
- **Slack (m02).** Config `slack: { workspace, user, channels: [{id, name,
  reason, private?}] }` per IC profile and per manager report (field names settled in p06);
  absent config imports nothing. CLI `work-chronicler slack channels
  add|remove|list` and a read command that prints the resolved subject, range
  and settings for the skill. One `messages` record per message the subject wrote — top-level messages, threads they started and their own replies in others' threads — with a parent-thread reference that holds only an ID or URL, never another person's text. Slack records require attribution verified as the configured subject; `unverified` is rejected for Slack.
  Privacy, applied in discovery and import: the subject's own words verbatim;
  others' replies as counts only, with no reply bodies or needless participant
  identities; public channels by default, private channels only with explicit
  opt-in; all DMs excluded. Manager mode: only channels the manager and the
  report both belong to.
- **Google Docs (m03).** `documents` records for docs the subject owns, by
  Drive owner metadata; docs merely edited or commented on and shared-drive
  docs with no individual owner are excluded. Manager mode: docs the report
  owns that are shared with the manager. Metadata and bounded excerpts by
  default; source text kept separate from generated interpretation. Config is opt-in per IC profile and per report and names the subject's Google account (the report's, in manager mode); field names settled in p09.

## Constraints and Out of Scope

- **Constraint:** the CLI and MCP server never call an LLM; the MCP server
  stays read-only; the CLI never stores Slack or Google credentials.
- **Constraint:** imported content is evidence, never instructions; skills say
  so.
- **Constraint:** no private details (message text, doc titles or contents,
  channel or doc names, IDs, people) in anything tracked or pushed: code,
  fixtures, PRs, issues, logs, or OAT artifacts. Live evidence is recorded as
  redacted counts and pass/fail only. Live scratch output goes to a temp
  `WORK_CHRONICLER_HOME` and is deleted afterwards.
- **Constraint:** never read or write `~/.work-chronicler/` except the one
  user-authorized personal import in Delivery endpoint and authority.
- **Constraint:** Slack and Google access is read-only: no posting, reacting,
  creating, editing or sharing.
- **Constraint:** repo Definition of Done on every PR (lint, format,
  typecheck, tests, build and pack checks where relevant, ready-PR CI,
  CHANGELOG entry).
- **Out of scope:** publishing outputs to Google Docs (the user's
  `context-to-gdoc` skill covers it), Linear, Calendar, scheduled fetches, a
  Google Docs setup skill, manager-mode PR reviews given, provider
  abstractions with one implementation.

## Decisions

- **Goal mode fits** (agent, GOAL-04). Three dependent releases; each
  milestone builds on the previous one's merged code. Rejected: one brief
  project (too large for one delivery), separate projects (shared contract
  across sources).
- **Verb-first naming** (user). Rejected: source-first grouping
  (`work-chronicler-slack-import`) — verb-first reads better and matches
  existing skills.
- **Delivery: one squash-merged PR per milestone, endpoint `merged`** (user,
  2026-11-07). Phases are commits in that PR, version bump included. Rejected:
  stacked PRs per phase, `open` endpoint.
- **Milestone branches chain** (agent). m01 uses `oat/evidence-expansion-m01` from `origin/main`. Each later milestone uses `oat/evidence-expansion-mNN`, started locally from the previous milestone's recorded last-phase `**Head:**` (the remote branch is deleted on merge) with `origin/main` merged in, so phase anchors stay ancestors across
  milestones while `main` stays squash-only. Rejected: branching each
  milestone from `main` (breaks anchor ancestry), reusing one head branch
  (ambiguous delivery lookup).
- **m01 bundles the renames with PR reviews given, released as 0.5.0**
  (user). Rejected: renames-only m01.
- **PR reviews given are IC-only** (user). Rejected: manager mode now.
- **Manager-mode Slack and Docs are in scope, opt-in per report** (user,
  2026-11-07): Slack messages in channels the manager and report share; Docs
  the report owns and has shared with the manager. An unconfigured report
  contributes nothing. Supersedes the earlier IC-only proposal.
- **Google Docs: owned only** (user). Rejected: edited/commented docs (needs
  attribution the APIs do not give reliably).
- **Publishing outputs to Google Docs dropped** (user, 2026-11-07). Rejected:
  skill-text offer in writing skills.
- **Releases pre-approved** (user, 2026-11-07): the agent pushes each version
  tag after the milestone merges and verifies publication. Rejected: approval
  per tag.
- **Autonomous run** (user, 2026-11-07): the agent runs every milestone
  through implementation, review, merge, release and re-alignment without
  stopping, consulting Codex `gpt-6-astra` (high) as advisor on any
  re-alignment change. The user agreed this brief's design in the interview and pre-authorized its approval; milestone amendments (GOAL-11) and re-alignment (GOAL-12) resolve under this authority within the limits in Delivery endpoint and authority. The terminal declaration stays the user's. Rejected: approval stop per milestone.
- **Live verification allowed, read-only** (user, 2026-11-07): Slack through
  the Slack plugin connector and Google Docs through the user's configured
  `gog`. Rejected: synthetic-only evidence.
- **Ledger: the OAT project only** (user). Rejected: GitHub tracking issue.
- **m02 re-alignment** (agent, 2026-11-08, GOAL-12 under the autonomous-run decision; Codex `gpt-6-astra` high advised and supports it). m02 incorporates m01's filesystem lessons through fail-closed import (p04), safe filtered-subset replacement and centralized reviewer attribution (p05), and installer replacement safety before release (new p12). p04–p08 are concrete. Remaining m01 deferrals stay recorded in the journal as post-goal follow-ups. Outcomes, Constraints, user Decisions, endpoint and authority are unchanged. Rejected: carrying every m01 deferral into m02 (dilutes the Slack delivery); deferring installer replacement safety past the goal (same data-loss class as m01's findings).

## Known Unknowns

- How `skills install` detects the five old names on each host (copy vs
  symlink layout) and whether any host caches skill names. — Settled by: p01
- Invocation of PR reviews given (part of `fetch github` by default, a flag,
  or a subcommand), and whether GraphQL contribution discovery is complete
  enough to use. — Settled by: p02
- Where imported records live in the work log and how upsert identity is
  keyed per source. — Settled by: p04
- Which consumers are extended versus labelled PR/ticket-only. — Settled by:
  p05
- Slack config field names and inclusion settings. — Settled by: p06
- Whether the Slack connector exposes author identity, channel visibility,
  membership, pagination and reply counts without retrieving others' text. —
  Settled by: p06
- Whether `gog` can list docs filtered by owner (the user, or a report
  sharing with the manager) with created/modified times and pagination, and
  which timestamp the date range applies to. — Settled by: p09

## Delivery endpoint and authority

- **Endpoint:** `merged` — a milestone is delivered when its PR is
  squash-merged to `main`; its release follows immediately.
- **Release (per milestone, after merge):** tag `vX.Y.0` on the squash-merge commit on `origin/main`, push the tag, watch `release.yml`, verify `npm view work-chronicler@X.Y.0 version`, run `/release-notes`, and record the PR URL, run URL, `npm view` output and Release URL in `implementation.md` `## Reviews and Gates` under the milestone. The next milestone activates only after that record exists. Outcome 7 is audited from these records.
- **Squash messages:** each merge uses an explicit Conventional Commit subject and body (`gh pr merge --squash --subject ... --body ...`), never GitHub's commit-list default.
- **Authority (agent, without asking):** edits and commits on named branches
  in T3 worktrees; pushes; PRs; squash-merge with
  `--match-head-commit` after independent review approval and green CI;
  version-tag pushes for 0.5.0, 0.6.0 and 0.7.0 after each merge, then
  `/release-notes`; additive config-schema changes; brief amendments and
  milestone activation under the autonomous-run decision, with Astra advising
  re-alignment; read-only live reads of the user's own Slack (Slack plugin) and
  Google Drive (`gog`) into a temp `WORK_CHRONICLER_HOME`.
- **Ask or stop first:** new runtime dependencies, CI or release workflow
  changes, breaking config-schema changes beyond the agreed skill renames, any change to an Outcome, Constraint, the endpoint or this authority, a failed release, any change to Out of Scope, reversal of a Decision marked (user), and any other Decision reversal or Approach departure Astra does not support (one it supports is logged in Decisions and the project log).
- **Personal import (user-authorized, after 0.7.0 is published):** with `npx work-chronicler@0.7.0` (no global install, no `skills install` into the user's skill folders; the agent follows the packaged skill text directly), the agent may add Slack and Google Docs settings to the user's live `default` profile (backing up its config file alongside first) and import there the Docs the user owns and the user's own messages in public channels they posted in during the `default` profile's configured fetch range (or a range the user confirms in session). Private channels only if the user opts in during the session. The range, chosen channel list and counts are reported to the user in chat only. Nothing else under `~/.work-chronicler/` is touched, and none of that data is written to tracked files, PRs, issues, logs or any service beyond the Slack connector, `gog` and the assistant already in the loop.
- **Never:** storing credentials; posting or writing to Slack or Google;
  putting imported content in tracked files, PRs, issues or logs; declaring
  the goal met (the user's call).
- **Reviews:** implementers are Claude; every phase gets an independent
  review, and each milestone an integrated cross-provider review by Codex
  `gpt-6.1-sol` (high). The root dispositions every finding; material fixes get
  independent confirmation.
- **Brief approved:** 2026-11-07 by autonomous run (GOAL-11) under the user's in-session pre-authorization at 623465e4f00261e22326b09af5f7844357a385fa
- **Milestone m02 approved:** 2026-11-08 by autonomous run (GOAL-11) under the user's standing pre-authorization at b142daa862caf6233013c7669deadfdb76867743

## Milestones

| Milestone | Phases                       |
| --------- | ---------------------------- |
| m01       | p01, p02, p03                |
| m02       | p04, p05, p06, p07, p12, p08 |
| m03       | p09, p10, p11                |

## Phase p01: Verb-first skill names and install migration

**Intent:** Rename the five package skills to the verb-first rule (directories, frontmatter `name`, invocation examples, cross-references, README, `documentation/`, AGENTS.md naming rule), and teach `skills install` an explicit old → new migration that is safe per selected host.
**Exit evidence:** Migration tests for copy, live symlink, dangling symlink, replacement conflict, overwrite refusal, declined old-name removal (both kept, notice printed) and repeat install across hosts pass; a packaged-install smoke run (recorded in the journal; needs network for dependencies) seeds old-name skills in a temp `HOME` by copying the `work-chronicler-*` directories from the published 0.4.0 tarball (`npm pack work-chronicler@0.4.0`) into one host's skills path and symlinking them into another, then installs the `npm pack` tarball there and, using the new non-interactive flags, installs only new names and migrates old ones; `rg` shows old names only in the migration map, its tests and CHANGELOG/upgrade notes; full DoD batch green.
**Provisional:** no

## Phase p02: PR reviews given (IC)

**Intent:** Fetch the reviews and inline review comments the IC submitted inside the fetch range on any PR, store them as review records linked to the canonical reviewed-PR URL, show them in `status` and the MCP server, and let the writing skills cite them as review work, never as authored PRs.
**Exit evidence:** Mocked tests for an old PR reviewed inside the range, repeated reviews, pending reviews excluded, pagination, edited comments, rate limiting, reviewed PR absent from the work log, and equal PR numbers across repos pass; a mixed work-log test shows authored-PR results from `analyze`, `get_stats`, `search_prs`, `get_timeline`, `filter` and project detection are unchanged by review records; manager profiles explicitly skip it; docs and CHANGELOG updated; full DoD batch green.
**Provisional:** no

## Phase p03: 0.5.0 release preparation

**Intent:** Bump `package.json` to 0.5.0 and move the Unreleased CHANGELOG entries under `[0.5.0]`, including breaking notes for the skill renames (re-run `skills install`).
**Exit evidence:** Version and CHANGELOG committed; the local DoD batch (`pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `npm pack --dry-run`) passes and the tarball lists only renamed skills. Ready-PR CI is the merge precondition, not phase evidence.
**Provisional:** no

## Phase p04: Staged import contract

**Intent:** Add the shared import envelope and the `messages` record type, plus `work-chronicler import <dir>` (validate, contained destination paths, atomic commit, upsert by identity, manager-report targeting) and `work-chronicler validate`.
**Exit evidence:** Before implementation, the journal records the import/validate filesystem threat matrix and the batch commit and recovery contract: the whole batch is rejected whenever containment, identity, authorization (the target subject is the IC or a report present in the manager profile; per-source opt-in is enforced from p06) or safe replacement cannot be established. The record location and per-source identity key are settled and recorded in the journal. Tests cover malformed YAML, schema violations, duplicate identities, an import targeting a report not in the manager profile, path escape, symlinked ancestors and files, case-insensitive aliases, POSIX backslashes in names, permission failures (not relying only on non-root execution), paths changing between validation and commit, and interruption at each destructive boundary; they assert existing records stay intact on rejection, recovery never reports a partial batch as successful, repeated imports are idempotent, and rejection exits nonzero with machine-readable errors. Docs updated.
**Provisional:** no

## Phase p05: Consumers and linking for imported evidence

**Intent:** Extend or label each consumer (`filter`, `status`, stats, timeline, MCP tools, project detection, writing and detection skills) for imported records, and add mention resolution with PR-URL normalization.
Also, from the m01 review: `filter` builds and validates a complete replacement subset before replacing the existing one, removes stale records of every type only through that replacement, and publishes its selection marker with its contents (including empty and supplementary-evidence-only results), so a failure keeps the previous subset and consumers never silently fall back to the full log; the writing skills prefer `search_pr_reviews` for attributable review evidence and `status` for diagnostics, keep the reviewer check on any path that reads review files directly, and still describe reviews as review work; an Unreleased CHANGELOG entry corrects the 0.5.0 note's `fetch --reviews` to `fetch github --reviews` (the released section stays as shipped).
**Exit evidence:** The journal records the extend-or-label decision for each consumer (settling that Known Unknown). A mixed work-log test with an existing filtered subset passes, including a re-filter that removes stale records of every type, an empty result, a supplementary-evidence-only result, and a failure that preserves the previous subset; `status`, stats, timeline and project detection include imported records or label their PR/ticket-only coverage over a mixed work log; MCP tool tests over imported records pass; linking tests cover PR-URL normalization and ticket mentions, including mentions that stay unresolved; every path a skill uses to read review records (MCP or direct file) still excludes and discloses foreign-reviewer records, and the m01 attribution tests stay green; skill text is reviewed against the CLI and names supplementary evidence explicitly; the CHANGELOG correction is committed.
**Provisional:** no

## Phase p06: Slack configuration and CLI

**Intent:** Add the Slack config for IC profiles and manager reports, `work-chronicler slack channels add|remove|list`, and the read command the skills use, enforcing opt-in, channel and privacy rules in the CLI.
**Exit evidence:** Config and command tests including unconfigured report, private channel without opt-in, DM rejection and non-destructive config updates pass; `validate`/`import` reject `messages` records whose author is not the configured subject, that carry reply bodies, that list participants beyond counts, whose attribution is `unverified`, whose channel is not in the subject's configured list, or whose parent-thread reference carries message text, exiting nonzero with errors that do not echo the content; a malformed `messages` record is rejected and a repeated import is idempotent; in manager mode a channel the manager and the report do not both belong to is refused (or, if the CLI cannot check membership, the p07 skill text states the rule and is reviewed against the Approach); the Slack connector capability unknown is settled and recorded.
**Provisional:** no

## Phase p07: Slack skills and live walkthrough

**Intent:** Write `work-chronicler-setup-slack` (interactive channel discovery that populates config) and `work-chronicler-import-slack` (staging batch → `import`), for IC and opted-in reports.
**Exit evidence:** Synthetic acceptance test (import → validate → link → MCP) passes, including a manager-mode case where a channel the manager and report do not share is excluded in discovery and refused on import (when p06 took the skill-text fallback, the refusal is the skill rule — excluded in discovery, never staged — verified by reviewing the skill text, and the CLI test shows the configured-list refusal), plus the Outcome 5 negative cases (wrong identity, unconfigured report, prohibited channel, DM, malformed record, repeated import); a live read-only walkthrough against the user's own Slack into a temp home records only redacted counts, validation results and rerun behavior in the journal.
**Provisional:** no

## Phase p12: Installer replacement safety

**Intent:** `skills install` stages and verifies a replacement before it replaces an existing installed skill, so a failed copy or link keeps the previous installation; a failure removing staging or the replaced copy is reported, does not abort the remaining skills or the migration report, and never removes the only working copy. From the m01 review (CodeRabbit 4504863000, 4504866388); behavior that predates 0.5.0.
**Exit evidence:** Tests show an injected copy failure and a failed link during `--overwrite` leave the previous skill intact and readable, report the failure, and do not stop the remaining skills or the migration report; an injected cleanup failure is reported without aborting the run; the injected failures do not depend on non-root `chmod`; an Unreleased CHANGELOG "Fixed" entry is added; full DoD batch green.
**Provisional:** no

## Phase p08: 0.6.0 release preparation

**Intent:** Bump to 0.6.0 and finalize the CHANGELOG for m02 (import contract, Slack, filter and installer replacement fixes, 0.5.0 wording correction).
**Exit evidence:** Version and CHANGELOG committed; the local DoD batch (`pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `npm pack --dry-run`) passes. Ready-PR CI is the merge precondition, not phase evidence.
**Provisional:** no

## Phase p09: Google Docs documents record and config

**Intent:** Add the `documents` record type on the envelope and opt-in Google Docs config for IC profiles and manager reports, with ownership as the inclusion test and a defined date-range field.
**Exit evidence:** Import tests for owned versus non-owned docs, unconfigured report, out-of-range docs, malformed records and repeated imports pass; consumers from p05 cover `documents`; the `gog` capability unknown is settled and recorded.
**Provisional:** yes

## Phase p10: Google Docs import skill and live walkthrough

**Intent:** Write `work-chronicler-import-google-docs` (via `gog` or a Google Workspace MCP) for the IC and for opted-in reports.
**Exit evidence:** Synthetic acceptance test passes; a live read-only walkthrough against the user's own Drive via `gog` into a temp home records only redacted counts and validation results in the journal.
**Provisional:** yes

## Phase p11: 0.7.0 release preparation

**Intent:** Bump to 0.7.0 and finalize the CHANGELOG for Google Docs.
**Exit evidence:** Version and CHANGELOG committed; the local DoD batch (`pnpm lint`, `pnpm format:check`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `npm pack --dry-run`) passes. Ready-PR CI is the merge precondition, not phase evidence.
**Provisional:** yes

---

## Parallelism

Phases that have no overlapping file modifications may run concurrently. To declare parallelism:

```yaml
oat_plan_parallel_groups: [['p02', 'p03']]
```

Each inner array is a group of phases that execute in parallel (each in its own worktree) and merge back in plan order after all pass. Groups may be declared whenever the phases become concrete.

Default is `[]` (fully sequential, no worktrees).

---

## Reviews

| Scope   | Type     | Status          | Date       | Artifact                                                                                                                     | Reviewed Head                            | Invocation                               | Gate Target       |
| ------- | -------- | --------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------- | ----------------- |
| plan    | artifact | passed          | 2026-11-07 | structured (no file); 3 attempts, 0 Critical/High residual; attempt-3 Low folded without re-review                           | 723168a978b9e76cf9eda18afebf3b1c264bc48e | oat-reviewer-claude-claude-opus-5-5-high | -                 |
| p01     | code     | passed          | 2026-11-07 | reviews/archived/p01-review-2026-11-07T233956Z.md (0 C/H, 5 Low fixed in 6014af5)                                            | 8f8e9883f370e5c748b2e4992db332befb411a3c | oat-reviewer-claude-claude-opus-5-5-high | -                 |
| p02     | code     | passed          | 2026-11-08 | reviews/archived/p02-review-2026-11-08T000100Z.md (0 C/H; 2 Med, 4 Low fixed in 7d04ae4..23a4f1a)                            | 57a1470018120c3d0aa9a1914896db8bfbaaaf90 | oat-reviewer-claude-claude-opus-5-5-high | -                 |
| p03     | code     | passed          | 2026-11-08 | reviews/archived/p03-review-2026-11-08T000907Z.md (0 C/H/M; 1 Low fixed in 8101714)                                          | 7d148a7283165fc803573e2b80080c58e7b6e292 | oat-reviewer-claude-claude-opus-5-5-high | -                 |
| final   | code     | fixes_completed | 2026-11-08 | reviews/archived/final-review-2026-11-08T001944Z.md                                                                          | 81017148924eb180394a8b92dde7e48fa80d0590 | gate                                     | codex-6-sol-xhigh |
| final   | code     | fixes_completed | 2026-11-08 | reviews/archived/final-review-2026-11-08T003901Z.md                                                                          | 966fbd2dbeb1bc3761ac9052978791db5d906247 | gate                                     | codex-6-sol-xhigh |
| final   | code     | passed          | 2026-11-08 | reviews/archived/final-review-2026-11-08T014902Z.md (0 C/H/M/L)                                                              | fcb2a87994ef8ef608427ca5fdb0eb849382f969 | gate                                     | codex-6-sol-xhigh |
| m01     | code     | fixes_completed | 2026-11-08 | reviews/archived/m01-review-2026-11-08T015940Z.md                                                                            | fcb2a87994ef8ef608427ca5fdb0eb849382f969 | manual                                   | -                 |
| final   | code     | fixes_completed | 2026-11-08 | reviews/archived/final-review-2026-11-08T020915Z.md                                                                          | 5cfd2b75d24d416b85bb41fa256453a5923768c5 | gate                                     | codex-6-sol-xhigh |
| final   | code     | passed          | 2026-11-08 | reviews/archived/final-review-2026-11-08T021601Z.md                                                                          | ed8b20df93efb15f5dbdeee10733453e7cd52f0d | gate                                     | codex-6-sol-xhigh |
| m01     | code     | passed          | 2026-11-08 | reviews/archived/m01-review-2026-11-08T022438Z.md                                                                            | ed8b20df93efb15f5dbdeee10733453e7cd52f0d | manual                                   | -                 |
| p01-p03 | code     | fixes_completed | 2026-11-08 | reviews/archived/range-review-2026-11-08T034405Z.md (1 H)                                                                    | 27f398fd461d57ec0cee3e295d5ed65c9f0e9763 | gate                                     | codex-6-sol-xhigh |
| p01-p03 | code     | fixes_completed | 2026-11-08 | reviews/archived/range-review-2026-11-08T035400Z.md (1 H)                                                                    | 0e90c256429242e8dc2d7957dd7840105045b9ee | gate                                     | codex-6-sol-xhigh |
| p01-p03 | code     | passed          | 2026-11-08 | reviews/archived/range-review-2026-11-08T040057Z.md (0 C/H/M/L)                                                              | aa1da62cea9621cebedd98cd18852853f7965567 | gate                                     | codex-6-sol-xhigh |
| m01     | code     | fixes_completed | 2026-11-08 | reviews/archived/m01-review-2026-11-08T040821Z.md (1 H)                                                                      | aa1da62cea9621cebedd98cd18852853f7965567 | manual                                   | -                 |
| p01-p03 | code     | passed          | 2026-11-08 | reviews/archived/range-review-2026-11-08T041806Z.md (0 C/H/M/L)                                                              | b7a300e0259cfc2a3df8d48de8dd1bbb50c641d8 | gate                                     | codex-6-sol-xhigh |
| m01     | code     | fixes_completed | 2026-11-08 | reviews/archived/m01-review-2026-11-08T042422Z.md (2 H)                                                                      | b7a300e0259cfc2a3df8d48de8dd1bbb50c641d8 | manual                                   | -                 |
| p01-p03 | code     | passed          | 2026-11-08 | reviews/archived/range-review-2026-11-08T043358Z.md (0 C/H/M/L)                                                              | b079cd77e9306bdc2a179660a6536afba12f0847 | gate                                     | codex-6-sol-xhigh |
| m01     | code     | passed          | 2026-11-08 | reviews/archived/m01-review-2026-11-08T044332Z.md                                                                            | b079cd77e9306bdc2a179660a6536afba12f0847 | manual                                   | -                 |
| p04     | code     | fixes_completed | 2026-11-08 | reviews/archived/p04-review-2026-11-08T060424Z.md (0 C, 1 H, 1 M, 1 L)                                                       | 773e5722a12b7c94a796a555d9594ed9e187c353 | oat-reviewer-claude-claude-opus-5-5-high | -                 |
| p05     | code     | fixes_completed | 2026-11-08 | reviews/archived/p05-review-2026-11-08T065300Z.md (0 C/H, 3 M, 3 L)                                                          | f750036a84b1aa8f6bf6fad9c871ea302343a8ea | oat-reviewer-claude-claude-opus-5-5-high | -                 |
| p06     | code     | fixes_completed | 2026-11-08 | reviews/archived/p06-review-2026-11-08T075843Z.md (0 C/H, 1 M, 2 L)                                                          | b5b900b9d3ea4bbb0c02a227edec50ef9699e8a8 | oat-reviewer-claude-claude-opus-5-5-high | -                 |
| p07     | code     | fixes_completed | 2026-11-08 | reviews/archived/p07-review-2026-11-08T083240Z.md (0 C/H/M, 2 L)                                                             | cf5e68f2ac616aef5ef8e2448c698fa38a2a435d | oat-reviewer-claude-claude-opus-5-5-high | -                 |
| p12     | code     | fixes_completed | 2026-11-08 | reviews/archived/p12-review-2026-11-08T090005Z.md (0 C/H, 1 M)                                                               | 80aa589f2c0c261c91798e99db6d2c6a2a6a5581 | oat-reviewer-claude-claude-opus-5-5-high | -                 |
| p08     | code     | passed          | 2026-11-08 | reviews/archived/p08-review-2026-11-08T091055Z.md (0 C/H; 1 M fixed in p08-t02, a one-line link fix)                         | 3c4e449cb7d98c1c991d3e65a5dcf012619f7d05 | oat-reviewer-claude-claude-opus-5-5-high | -                 |
| plan    | artifact | passed          | 2026-11-08 | structured (no file); m02 amendment; 2 attempts, 0 Critical/High/Medium residual; attempt-2 Low (3) folded without re-review | 4dc87a15d08c6bff56a51c8fabb3105f56e8323e | oat-reviewer-claude-claude-opus-5-5-high | -                 |
| p04     | code     | passed          | 2026-11-08 | reviews/archived/p04-review-2026-11-08T061551Z.md (0 C/H/M; 2 Low fixed in p04-t09)                                          | bf256dd4d3f60d4f3fc686ef6c040d9d18a7c0ad | oat-reviewer-claude-claude-opus-5-5-high | -                 |
| p05     | code     | fixes_completed | 2026-11-08 | reviews/archived/p05-review-2026-11-08T071332Z.md (0 C/H/M, 3 L)                                                             | 8bc34a535ea8cee5aa9e0aa07e369eb595ba895f | oat-reviewer-claude-claude-opus-5-5-high | -                 |
| p05     | code     | passed          | 2026-11-08 | reviews/archived/p05-review-2026-11-08T073033Z.md (0 C/H/M; 2 Low fixed in p05-t16)                                          | 5d723ff03ce1a3e3c284e99368982ccfbf16b48d | oat-reviewer-claude-claude-opus-5-5-high | -                 |
| p06     | code     | passed          | 2026-11-08 | reviews/archived/p06-review-2026-11-08T080639Z.md (0 C/H/M/L)                                                                | 6bfcfecd44b80efa12b280a6f41f7fe4b0c4e57f | oat-reviewer-claude-claude-opus-5-5-high | -                 |
| p07     | code     | passed          | 2026-11-08 | reviews/archived/p07-review-2026-11-08T084045Z.md (0 C/H/M; 2 Low fixed in p07-t13)                                          | 5d53367c2567b325854ef56f4f09d96c9ea6e79a | oat-reviewer-claude-claude-opus-5-5-high | -                 |
| p12     | code     | passed          | 2026-11-08 | reviews/archived/p12-review-2026-11-08T090704Z.md (0 C/H/M; 1 Low fixed in p12-t06)                                          | 3b5ac311a459321ee28fcdb184ef80dbdc30fd0c | oat-reviewer-claude-claude-opus-5-5-high | -                 |
| final   | code     | fixes_completed | 2026-11-08 | reviews/archived/final-review-2026-11-08T092006Z.md (2 H, 1 M)                                                               | a30a11836b7fce248cefc50d4ba3b4c8c593db0e | gate                                     | codex-6-sol-xhigh |
| final   | code     | fixes_completed | 2026-11-08 | reviews/archived/final-review-2026-11-08T094553Z.md (1 H)                                                                    | ce900184bb444954f45978a233c4478ffac09694 | gate                                     | codex-6-sol-xhigh |
| final   | code     | passed          | 2026-11-08 | reviews/archived/final-review-2026-11-08T100413Z.md (0 C/H/M/L)                                                              | 890358f95e9adde796635336ae741de206fc0e2d | gate                                     | codex-6-sol-xhigh |
| m02     | code     | fixes_completed | 2026-11-08 | reviews/archived/m02-review-2026-11-08T101759Z.md (1 H)                                                                      | 890358f95e9adde796635336ae741de206fc0e2d | manual                                   | -                 |

Add one `code` row per phase as phases become concrete. For code-review events,
`Reviewed Head` is the full 40-character SHA at the head of the reviewed range.
Writers must preserve every existing row and every unknown trailing cell.

**Status values:** `pending` → `received` → `fixes_added` → `fixes_completed` → `passed`

---

## Implementation Complete

**Summary:** filled at closeout.

Ready for final code review and PR preparation.

---

## References

- Journal: `implementation.md`
- Research: `references/research/`
- Project log: `project-log.md` (when enabled)
