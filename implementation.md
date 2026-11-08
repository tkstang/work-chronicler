---
oat_status: in_progress
oat_ready_for: null
oat_blockers: []
oat_last_updated: 2026-11-08
oat_current_task_id: p10
oat_generated: false
---

# Implementation: work-chronicler-evidence-expansion

**Started:** 2026-11-07
**Last Updated:** 2026-11-08

> This journal records execution of the Project Brief in `plan.md` and is used
> to resume interrupted sessions.
>
> Conventions:
>
> - Progress counts phase-units: each `## Phase pNN:` in `plan.md` is one unit,
>   accepted only by the exact line `**Status:** completed` in its section here.
>   A provisional phase never counts as complete.
> - `oat_current_task_id` points at the **next unit to do**: a phase ID (`p02`)
>   or an open execution record (`p02-t03`). Set it to `null` when every phase
>   is accepted.
> - Marker lines are exact, one per line, directly under the phase heading:
>   `**Status:** pending | in_progress | completed | failed | extracted`,
>   `**Base:** <full SHA>`, `**Head:** <full SHA>`, and
>   `**Executor:** root | phase-implementer:<id> | worker:<id> | inline:<exception-ref> | reconciled`.
>   `**Status:** extracted` always pairs with `**Extracted to:** <slug>` naming
>   the linked project; without it the phase reads as `pending`.
>   Phase ownership ends at the next heading, so a task record's status is never
>   read as its phase's status.
> - `### Task pNN-tNN:` blocks are execution records, opened when work starts
>   and closed at commit with the SHA or a terminal status
>   (`completed | failed | cancelled | no-change`). They never change phase totals.
> - Reviews are **not** units. Track review status in `plan.md` under `## Reviews`.

## Progress Overview

| Phase | Status      | Units | Accepted |
| ----- | ----------- | ----- | -------- |
| p01   | completed   | 1     | 1/1      |
| p02   | completed   | 1     | 1/1      |
| p03   | completed   | 1     | 1/1      |
| p04   | completed   | 1     | 1/1      |
| p05   | completed   | 1     | 1/1      |
| p06   | completed   | 1     | 1/1      |
| p07   | completed   | 1     | 1/1      |
| p12   | completed   | 1     | 1/1      |
| p08   | completed   | 1     | 1/1      |
| p13   | completed   | 1     | 1/1      |
| p14   | pending     | 1     | 0/1      |
| p15   | completed   | 1     | 1/1      |
| p16   | completed   | 1     | 1/1      |
| p17   | pending     | 1     | 0/1      |
| p09   | pending     | 1     | 0/1      |
| p10   | in_progress | 1     | 0/1      |
| p11   | pending     | 1     | 0/1      |

**Total:** 14/16 phases accepted

---

## Phase p01: Verb-first skill names and install migration

**Status:** completed
**Base:** a3b950d7c33b3bc829994c3f98d9537f974fc483
**Executor:** phase-implementer:wce-p01-impl-1
**Head:** 6014af5a9a414134f70b4e87def8f5b38cd23025

Worktree: `/Users/thomas.stang/.t3/worktrees/work-chronicler/fix-github-org-at-prefix` on `oat/evidence-expansion-m01`; committing owner: the phase implementer (code commits). The root owns this journal (synced OAT project, outside the code branch) and writes execution records from the implementer's report. Parallelism: no declared group; root fan-out rejected because the renames, installer migration and docs share `src/cli/commands/skills/` and cross-referencing docs; one phase implementer.

Verification at Head: `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build` pass (187 tests); `npm pack --dry-run` lists only new skill names; `rg` finds old names only in `types.ts` (migration map), `install.test.ts` and `CHANGELOG.md`. Root re-ran typecheck, the test suite and the `rg` check at Head: pass.

Packaged smoke run (temp `HOME`/`WORK_CHRONICLER_HOME`, network available): seeded the ten 0.4.0 skills as copies in `.claude/skills` and symlinks in `.codex/skills`; installed the packed branch tarball; `skills list` flagged the 5 old names; `skills install --tool claude codex --method copy --yes` exited 0, installed 5 new names and removed 5 old per host; symlink targets intact; repeat install was a no-op; temp dirs deleted.

Known Unknown settled (p01): all four hosts use `~/.<tool>/skills/<name>`; old names are detected by `lstat` against the explicit `RENAMED_SKILLS` map (copy, live link, dangling link); host caching not verified empirically, so docs and installer output tell users to restart their assistant.

Implementer notes: added `--overwrite` and `--keep-old` beyond the brief's flag list so every prompt has a no-prompt form; fixed the overwrite prompt counting old names as conflicts. A smoke `npm install` briefly wrote into a stray `/tmp/package.json` fixture outside the repo; the implementer restored it and removed the artifacts (root confirmed the file content).

### Task p01-t01: Verb-first skill renames

**Status:** completed
**Commit:** ad75f398741ed82207578c1b9f4812c8246a0ec7
**Executor:** phase-implementer:wce-p01-impl-1

Renamed five skill directories, frontmatter names, cross-references, docs, AGENTS.md naming rule, CHANGELOG breaking entry. Proof: `pnpm format:check && pnpm lint` plus a name/frontmatter consistency script.

### Task p01-t02: Install migration and no-prompt flags

**Status:** completed
**Commit:** e2a08d2492f1f535517eeaa7cc748074b4090fca
**Executor:** phase-implementer:wce-p01-impl-1

`RENAMED_SKILLS` map, verified-replacement-then-remove migration, symlink-safe removal, confirmed old-name removal, `--tool/--method/--yes/--overwrite/--keep-old`, `skills list` flags old names. Proof: `pnpm exec vitest run src/cli/commands/skills` (11 pass), typecheck, lint.

### Task p01-t03: Upgrade-note fix

**Status:** completed
**Commit:** 8f8e9883f370e5c748b2e4992db332befb411a3c
**Executor:** phase-implementer:wce-p01-impl-1

Documented that `--yes` without `--overwrite` keeps unchanged copied skills. Found by the smoke run.

### Task p01-t04: Address p01 review findings

**Status:** completed
**Commit:** 6014af5a9a414134f70b4e87def8f5b38cd23025
**Executor:** root

Review `reviews/archived/p01-review-2026-11-07T233956Z.md` (0 Critical/High, 5 Low) passed; root fixed all five Lows (README counts, AGENTS.md list order, replacement-check wording, old-copy edit warning, nonexistent `reports add --skip-fetch` in write-peer-review). Late-fix rule: no later phase has a Base, so Head advanced. Proof: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` (187 pass). Fix commit not independently re-reviewed (Low-only); covered by the m01 integrated review.

---

## Phase p02: PR reviews given (IC)

**Status:** completed
**Base:** 6014af5a9a414134f70b4e87def8f5b38cd23025
**Executor:** phase-implementer:wce-p02-impl-1
**Head:** 23a4f1aae63ebd37c8966dca2c2136f794f14190

Worktree and branch as p01; committing owner: the phase implementer (code); root owns the journal. Parallelism: no declared group; fan-out rejected (fetch, types, storage, consumers and docs are sequentially dependent); one phase implementer.

Verification at Head: `pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build && npm pack --dry-run` pass (220 tests). Root re-ran typecheck and tests at Head: pass.

Known Unknown settled (p02): opt-in `--reviews` flag on `fetch github` and `fetch all` (extra API cost and the stricter search rate limit; default behavior unchanged). GraphQL contribution discovery rejected (one-year windows, repo caps, completeness unprovable without live calls). Live search behavior (dismissed reviews, comment-only reviewing) remains unverified; mocked tests only.

Deviations (accepted by root): the user's own PRs are excluded (comments on your own PR are not reviews given); `filter` copies review records by org/repo selectors only; reviews exposed through a new MCP tool rather than a `get_stats` field.

### Task p02-t01: Review record type and storage

**Status:** completed
**Commit:** 15734e94749cb2a4ac85e3ee0fac6767efee91bb
**Executor:** phase-implementer:wce-p02-impl-1

`pr-review` record type stored at `work-log/pr-reviews/<org>/<repo>/<number>.md`, review and comment IDs distinct, optional `fetchedRange`. Proof: storage tests.

### Task p02-t02: Fetch reviews given with `--reviews`

**Status:** completed
**Commit:** 88b0bd40fb8204bf9e5f89f798592ac4f56782e3
**Executor:** phase-implementer:wce-p02-impl-1

Opt-in `--reviews` on `fetch github`/`fetch all`; search `reviewed-by:` with `updated:>=since`, date-window split past 1000 results; reviews by `submitted_at`, comments by `created_at`; pending excluded; manager profiles skip. Proof: fetch and lifecycle tests.

### Task p02-t03: `status`, MCP tool and `filter`

**Status:** completed
**Commit:** dda9b5c39b0d45d691b46de7b7b04869c318d0ab
**Executor:** phase-implementer:wce-p02-impl-1

New read-only MCP tool `search_pr_reviews`; `status` counts reviewed PRs; `filter` copies review records by org/repo only; mixed work-log test proves authored-PR results unchanged. Proof: MCP and mixed tests.

### Task p02-t04: Docs, skills and CHANGELOG

**Status:** completed
**Commit:** 57a1470018120c3d0aa9a1914896db8bfbaaaf90
**Executor:** phase-implementer:wce-p02-impl-1

Docs, CHANGELOG, AGENTS.md, and write-self-review / write-resume-bullets / summarize-work cite reviews as review work. Proof: `format:check`.

Review `reviews/archived/p02-review-2026-11-08T000100Z.md`: 0 Critical/High, 2 Medium, 4 Low; passed. The implementer fixed all six in a continuation of wce-p02-impl-1 (late-fix rule: no later phase Base, so Head advanced). Root re-ran typecheck and tests at the new Head: pass (223). Fixes not independently re-reviewed; the m01 integrated cross-provider review covers them.

### Task p02-t05: Show reviews hidden by an old filtered subset (M1)

**Status:** completed
**Commit:** 7d04ae446e9e4bbbd1536b85b8da4d8f1ce83d5c
**Executor:** phase-implementer:wce-p02-impl-1

Review fix. Proof: full DoD batch.

### Task p02-t06: State filter keeps comments of matching reviews (L4)

**Status:** completed
**Commit:** 4973862c554178f90a68a0042689ea7d61331c56
**Executor:** phase-implementer:wce-p02-impl-1

Review fix. Proof: full DoD batch.

### Task p02-t07: Warn once about incomplete search; test range changes (L2, L3)

**Status:** completed
**Commit:** 86fb18c08a708e8d553b95887b8b0576a763c3a9
**Executor:** phase-implementer:wce-p02-impl-1

Review fix. Proof: full DoD batch.

### Task p02-t08: update-resume cites reviews; docs say own PRs are skipped (M2, L1)

**Status:** completed
**Commit:** 23a4f1aae63ebd37c8966dca2c2136f794f14190
**Executor:** phase-implementer:wce-p02-impl-1

Review fix. Proof: full DoD batch.

---

## Phase p03: 0.5.0 release preparation

**Status:** completed
**Base:** 23a4f1aae63ebd37c8966dca2c2136f794f14190
**Executor:** inline:p03-inline-exception
**Head:** b079cd77e9306bdc2a179660a6536afba12f0847

Inline exception (recorded before editing): version bump and CHANGELOG section move only — no new surface, no unresolved design, not consequential before the tag push (which happens after merge under the Release authority), one proof command (the local DoD batch). Committing owner: root. Parallelism: single trivial phase.

Verification at Head: `pnpm format && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build && npm pack --dry-run` pass (223 tests; tarball `work-chronicler-0.5.0.tgz`, 106 files, only new skill names). Ready-PR CI is the merge precondition.

### Task p03-t01: Prepare 0.5.0 release

**Status:** completed
**Commit:** 7d148a7283165fc803573e2b80080c58e7b6e292
**Executor:** root

`package.json` 0.5.0; CHANGELOG `[0.5.0]` section and compare links; breaking-rename note now recommends `--overwrite` to refresh unchanged copies.

### Task p03-t02: Report the package version from the MCP server

**Status:** completed
**Commit:** 81017148924eb180394a8b92dde7e48fa80d0590
**Executor:** root

Review `reviews/archived/p03-review-2026-11-08T000907Z.md` (0 C/H/M, 1 Low) passed; root fixed the Low (MCP server hardcoded `0.1.0`), added a server test and a CHANGELOG Fixed entry. Proof: lint, format:check, typecheck, 223 tests, build plus a built-module import. Not independently re-reviewed; covered by the m01 integrated review.

### Task p03-t03: (review) Keep old skill copies a replacement depends on

**Status:** completed
**Commit:** 9337246bf75c43d656cd0190fb39823e6aa48c84
**Executor:** phase-implementer:wce-p03-fix-1
**Source review:** reviews/archived/final-review-2026-11-08T001944Z.md (H1)

Intent: Before removing an old entry, require that the replacement (and its SKILL.md) does not resolve into the path being removed; otherwise keep the old entry, print why, and install an independent copy only if allowed. Regression: dependent new-name symlink into the old dir + independent-symlink control.
Files: `src/cli/commands/skills/migrate.ts`, `install.ts`, `install.test.ts`
Proof: `pnpm lint && pnpm typecheck && pnpm test`

### Task p03-t04: (review) Treat any occupant of a destination as an overwrite conflict

**Status:** completed
**Commit:** f09dbfe04e1ae8079c51a02998247d45879c85e9
**Executor:** phase-implementer:wce-p03-fix-1
**Source review:** reviews/archived/final-review-2026-11-08T001944Z.md (M1)

Intent: Conflicts come from occupancy of every intended destination (files, dirs, links), not only `findInstalledSkills`; replacement only on explicit overwrite or documented broken-link repair. Regression: regular file at a new name during an upgrade.
Files: `src/cli/commands/skills/install.ts`, `install.test.ts`
Proof: `pnpm lint && pnpm typecheck && pnpm test`

### Task p03-t05: (review) Make owner-lookup rate limits fatal in review fetch

**Status:** completed
**Commit:** c20f78f01046cea791c1e99ea719fc3bad5460f0
**Executor:** phase-implementer:wce-p03-fix-1
**Source review:** reviews/archived/final-review-2026-11-08T001944Z.md (H2)

Intent: Propagate 429/rate-limited 403 from the owner lookup through `handleRateLimitError`; distinguish confirmed user/org classification from an unavailable lookup. Regression: rate limit on the first lookup → no search, run fails; user and org controls.
Files: `src/cli/commands/fetch/github/github-reviews.utils.ts` (and the shared `isUser` helper in `github.utils.ts`), tests
Proof: `pnpm lint && pnpm typecheck && pnpm test`

### Task p03-t06: (review) Bind stored review records to the reviewer identity

**Status:** completed
**Commit:** 966fbd2dbeb1bc3761ac9052978791db5d906247
**Executor:** phase-implementer:wce-p03-fix-1
**Source review:** reviews/archived/final-review-2026-11-08T001944Z.md (M2)

Intent: Require a case-insensitive `reviewer` match before cache reuse or merge; on mismatch replace the record without inheriting the other person's entries (or refuse with guidance). Regression: cache path and different-range path.
Files: `src/cli/commands/fetch/github/github-reviews.utils.ts`, tests
Proof: `pnpm lint && pnpm typecheck && pnpm test`

### Task p03-t07: (review) Keep old skill entries any installed tool depends on

**Status:** completed
**Commit:** 1d12c1c970771b257782ab8d4851e7245ed96e1a
**Executor:** phase-implementer:wce-p03-fix-1 (continuation round 2)
**Source review:** reviews/archived/final-review-2026-11-08T003901Z.md (H1)

Intent: Inventory dependencies across every known tool skills dir (selected or not) by resolving each entry's SKILL.md path; keep an old entry when any other installation resolves into it. Regression: Codex new-name link into Claude old copy with `--tool claude`.
Files: `src/cli/commands/skills/migrate.ts`, `install.ts`, tests, docs
Proof: `pnpm lint && pnpm typecheck && pnpm test`

### Task p03-t08: (review) Refuse to mix review records from different reviewers

**Status:** completed
**Commit:** fcb2a87994ef8ef608427ca5fdb0eb849382f969
**Executor:** phase-implementer:wce-p03-fix-1 (continuation round 2)
**Source review:** reviews/archived/final-review-2026-11-08T003901Z.md (M1)

Intent: Before candidate iteration, scan stored `pr-reviews/` for records whose reviewer differs (case-insensitive) from the configured user and refuse with actionable guidance, including no-result fetches; ensure consumers never present foreign records as the user's work. Regressions: no-in-range and no-candidate cases plus valid controls.
Files: `src/cli/commands/fetch/github/github-reviews.utils.ts`, consumers if needed, tests, docs
Proof: `pnpm lint && pnpm typecheck && pnpm test`

### Task p03-t09: (review) Writing skills cite only the user's own review records

**Status:** completed
**Commit:** 5cfd2b75d24d416b85bb41fa256453a5923768c5
**Executor:** inline:p03-inline-exception (root, small skill-text fix)
**Source review:** reviews/archived/m01-review-2026-11-08T015940Z.md (M1, L1)

Intent: The four review-citing writing skills compare each record's `reviewer` (case-insensitive) with `github.username` from the profile's `config.yaml` (`work-chronicler workspace root`), exclude and disclose foreign records, and refuse to attribute when the username is unreadable. README skill count corrected to six IC, one any-profile peer review, three manager. CHANGELOG 0.5.0 bullet extended.
Files: four `SKILL.md` files, `README.md`, `CHANGELOG.md`
Proof: `pnpm format:check && pnpm lint && pnpm test` (245 passed)

### Task p03-t10: (review) Normalize the configured username before matching reviewers

**Status:** completed
**Commit:** ed8b20df93efb15f5dbdeee10733453e7cd52f0d
**Executor:** inline:p03-inline-exception (root, small skill-text fix)
**Source review:** reviews/archived/final-review-2026-11-08T020915Z.md (M1)

Intent: The four writing skills normalize `github.username` like `normalizeGitHubName` (trim, drop one leading `@`, trim) before the case-insensitive reviewer comparison; empty or still-`@` handles count as unreadable.
Files: four `SKILL.md` files
Proof: `pnpm format:check`

### Task p03-t11: (review) Address PR #25 CodeRabbit findings on review records

**Status:** completed
**Commit:** 27f398fd461d57ec0cee3e295d5ed65c9f0e9763
**Executor:** inline:p03-inline-exception (root, small fixes from PR review)
**Source review:** PR #25 CodeRabbit review (comments 4504862929, 4504862939, 4504862960, 4504862978, 4504862995)

Intent: An unreadable review record is left unchanged and its PR reported failed instead of being rewritten with only the current range. A complete fetch that finds nothing leaves `pr-reviews/`. `filter` writes `filtered/pr-reviews/` only once the work log has one, so a subset made before the first review fetch is still flagged. Docs name `fetch github --reviews`. The mixed-work-log status test seeds its own fixtures.
Files: `github-reviews.utils.ts`, `filter.ts`, `paths.ts` (doc comment), `documentation/commands.md`, `documentation/configuration.md`, two test files
Proof: full DoD batch (format, lint, typecheck, 247 tests); the three new regression assertions fail on ed8b20d code and pass after.

### Task p03-t12: (review) Keep old skill copies a nested resource link points into

**Status:** completed
**Commit:** 0e90c256429242e8dc2d7957dd7840105045b9ee
**Executor:** inline:p03-inline-exception (root, one gate finding)
**Source review:** reviews/archived/range-review-2026-11-08T034405Z.md (H1)

Intent: The migration dependency check counts every symlink nested inside each installed entry (walking linked directories once each), so an old copy that a kept skill's `scripts/` links into is kept and named. An entry that cannot be fully read also keeps the old name.
Files: `skills/migrate.ts`, `skills/install.test.ts`, `documentation/available-skills.md`
Proof: full DoD batch (249 tests); the nested-link regression fails on 27f398f code and passes after; independent-resource control still removes the old copy.

### Task p03-t13: (review) Keep old skill copies when a nested link cannot be followed

**Status:** completed
**Commit:** aa1da62cea9621cebedd98cd18852853f7965567
**Executor:** inline:p03-inline-exception (root, one gate finding)
**Source review:** reviews/archived/range-review-2026-11-08T035400Z.md (H1)

Intent: Only a link target proven missing (ENOENT, ENOTDIR) counts as having nothing below it; a permission or other resolution failure marks the entry not fully checked, which keeps the old name.
Files: `skills/migrate.ts`, `skills/install.test.ts`
Proof: full DoD batch (251 tests); the permission-denied regression (skipped as root) fails on 0e90c25 code and passes after; the missing-target control still removes the old copy.

### Task p03-t14: (review) Keep old skill copies when a tool skills directory is unreadable

**Status:** completed
**Commit:** b7a300e0259cfc2a3df8d48de8dd1bbb50c641d8
**Executor:** inline:p03-inline-exception (root, one integrated-review finding)
**Source review:** reviews/archived/m01-review-2026-11-08T040821Z.md (H1)

Intent: The dependency inventory skips only a missing tool skills directory (ENOENT, ENOTDIR); one that exists but cannot be listed is recorded as not fully checked, which keeps every old name in that run and names the directory.
Files: `skills/migrate.ts`, `skills/install.test.ts`, `documentation/available-skills.md`
Proof: full DoD batch (252 tests); the unreadable-tool-directory regression (skipped as root) fails on aa1da62 code and passes after; existing tests with absent tool directories still remove old copies.

### Task p03-t15: (review) Match old skill copies by file identity and real separators

**Status:** completed
**Commit:** b079cd77e9306bdc2a179660a6536afba12f0847
**Executor:** inline:p03-inline-exception (root, two integrated-review findings plus three PR review comments)
**Source review:** reviews/archived/m01-review-2026-11-08T042422Z.md (H1, H2); PR #25 CodeRabbit 4505014153, 4505014156, 4505014158

Intent: Dependency paths match the old entry by filesystem identity (dev:ino up the path) as well as text, so a differently cased spelling on a case-insensitive volume keeps the old copy (H1, 4505014158). Only "/" separates path parts on POSIX, so a backslash in a name no longer hides a link (H2). The kept-old-name notice and docs say `--overwrite` reinstalls only work-chronicler skills (4505014153). Install tests stub USERPROFILE (4505014156).
Files: `skills/migrate.ts`, `skills/install.ts`, `skills/install.test.ts`, `documentation/available-skills.md`
Proof: full DoD batch (254 tests); both new regressions fail on b7a300e code and pass after (case test runs on case-insensitive volumes only, backslash test skips on Windows).

---

## Phase p04: Staged import contract

**Status:** completed
**Base:** 378f881d38602cc7882aa9faf0fdd999541f1c22
**Executor:** phase-implementer:wce-p04-impl-1
**Head:** 81584c399c38f482b747f178e06114fedb37b2f1

Worktree: this T3 worktree, branch `oat/evidence-expansion-m02` (m01 head b079cd7 with origin/main merged). Committing owner: the phase implementer (code); root owns the journal. Parallelism: no declared group; fan-out rejected (envelope schema, storage paths, `import` and `validate` share types and the commit contract and are sequentially dependent); one phase implementer. Task class: consequential (atomic writes over existing user records; fail-closed data safety per the m01 learning).

Verification at Head: implementer ran `pnpm format && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build && npm pack --dry-run` (337 tests, 118 packed files, no test-support files) and an end-to-end import through the built CLI in a temp home. Root re-ran typecheck, lint, format:check and tests at Head: pass (337). No dependency, lockfile or CI changes.

Known Unknown settled (p04): records live at `<work-log>/messages/<source>/<sha256(identity) 32 hex>.md` (manager mode: `reports/<id>/work-log/messages/...`); identity is `(type, source, sourceAccount, sourceId)`; for Slack, `sourceAccount` is the workspace (team) ID and `sourceId` is `<channel ID>/<message ts>`. Upsert replaces the whole record; byte-identical content is left unchanged.

Threat matrix and commit contract (written before the commit code; summary): the whole batch is rejected whenever containment, identity, authorization or safe replacement cannot be established, and only a proven ENOENT counts as absent. T1 destination paths never use record text; T2 staging entries must be regular `*.md` files (lstat); T3 staging opened with O_NOFOLLOW|O_NONBLOCK and dev/ino matched to the listing; T4 names are never split on backslashes; T5 strict YAML and schema, size caps; T6 duplicate identity or case-folded destination collision rejected; T7 subject must match the resolved target (IC, or `--report` present in the manager profile); T8 every component below the root is lstat-checked; T9 the configured root is resolved once and trusted; T10 an existing file with another identity or subject is a conflict; T11 case aliases resolve to the same entry and are identity-checked; T12 identities and hashes are re-checked before each destructive step; T13 failures injected through an ImportFs layer (not chmod); T14 write-ahead journal with recovery on the next import (old or new batch, never a mix); T15 `.import-lock` by atomic hard link; T16 stale lock taken over only when the owner is provably dead; T17 an unreadable journal or ambiguous record stops recovery and keeps backups; T18 errors never echo record content. Commit: read-only plan, lock, recover, re-plan, prepare in `.import-transaction/` with read-back hashes, journal `prepared` → `committing` (per-record applying marker, then `link` create or `rename` update with hash check) → `committed`; any failure rolls back only marked records by hash. Residual race windows (final check to link/rename; simultaneous stale-lock takeover; hard-link support required) are documented.

Notes for later phases: p05 must teach consumers about imported records and to ignore `.import-*` entries in the work-log root (docs currently say imported records are not read yet); p06 plugs Slack rules into `checkRecord` in `src/core/import/sources.ts` (its context needs the config, additive). Recovery runs on the next `import`; `validate` reports `RECOVERY_REQUIRED`. `tsconfig.build.json` now excludes `src/**/*.test-support.ts`.

### Task p04-t01: Import envelope and `messages` record type

**Status:** completed
**Commit:** b39d339d742bbece00c6abc854b5ab7bbd6b3a96
**Executor:** phase-implementer:wce-p04-impl-1
Files: `src/core/types/imported-record.ts`, `src/core/storage/paths.ts`, `src/core/import/{issues,sources,record-file}.ts` and tests, index exports
Proof: `pnpm vitest run src/core/import`

### Task p04-t02: Validate staged batches without writing

**Status:** completed
**Commit:** 8f73aa354a5db6ee6b656186cb2ead1d1b6f7448
**Executor:** phase-implementer:wce-p04-impl-1
Files: `src/core/import/{import-fs,staging,plan,index}.ts`, `import.test-support.ts`, `validate.test.ts`, `tsconfig.build.json`
Proof: `pnpm vitest run src/core/import`, `pnpm build`

### Task p04-t03: Atomic commit with recovery

**Status:** completed
**Commit:** 780b4e5142d1866d48b808262fdd6d21253b7f05
**Executor:** phase-implementer:wce-p04-impl-1
Files: `src/core/import/transaction.ts`, `index.ts`, `plan.ts`, `staging.ts`, `commit.test.ts`, test support
Proof: `pnpm vitest run src/core/import` (fault injection at every operation and crash at every write)

### Task p04-t04: `import` and `validate` commands

**Status:** completed
**Commit:** 1c0ee9a6923df63a3a773489e18f2c7cac8ea012
**Executor:** phase-implementer:wce-p04-impl-1
Files: `src/cli/commands/import/{index,import.utils,import.test}.ts`, `validate.ts`, `src/cli/index.ts`, `src/cli/commands/README.md`
Proof: `pnpm vitest run src/cli/commands/import`, `pnpm build`, built CLI run in a temp home

### Task p04-t05: Docs and CHANGELOG

**Status:** completed
**Commit:** 773e5722a12b7c94a796a555d9594ed9e187c353
**Executor:** phase-implementer:wce-p04-impl-1
Files: `documentation/{commands,configuration,manager-mode}.md`, `README.md`, `AGENTS.md`, `CHANGELOG.md`
Proof: `pnpm format:check`; documented example record validated with the CLI

### Task p04-t06: (review) Let the on-disk journal decide after a batch is recorded

**Status:** completed
**Commit:** 08cba00db1b36711b6fdc0c0ccb08f3526b999d0
**Executor:** phase-implementer:wce-p04-impl-1 (fix mode)
**Source review:** reviews/archived/p04-review-2026-11-08T060424Z.md (H1)
Once the `committed` rename lands, later failures are warnings and nothing rolls back; a failed `committed` write reads the journal back to decide; recovery reports `completed` only if every record holds its new version, otherwise `RECOVERY_CONFLICT` with backups kept.
Files: `src/core/import/transaction.ts`, `commit.test.ts`, `import.test-support.ts`
Proof: both reviewer reproductions as regression tests plus a generic two-failure loop; new tests fail on 773e572 code

### Task p04-t07: (review) Report unknown frontmatter keys without their text

**Status:** completed
**Commit:** aa8807123c029028a99c3a095a7ff13fcfb1e4e8
**Executor:** phase-implementer:wce-p04-impl-1 (fix mode)
**Source review:** reviews/archived/p04-review-2026-11-08T060424Z.md (M1)
Files: `src/core/import/record-file.ts`, `record-file.test.ts`
Proof: plain-name secret key never echoed; tests fail on 773e572 code

### Task p04-t08: (review) Describe failed and incomplete rollbacks accurately

**Status:** completed
**Commit:** bf256dd4d3f60d4f3fc686ef6c040d9d18a7c0ad
**Executor:** phase-implementer:wce-p04-impl-1 (fix mode)
**Source review:** reviews/archived/p04-review-2026-11-08T060424Z.md (L1)
Files: `documentation/commands.md`, `CHANGELOG.md`
Proof: `pnpm format:check`; root re-ran typecheck, lint, format:check, 343 tests at bf256dd: pass

### Task p04-t09: (review) Describe recovery after a stored batch accurately

**Status:** completed
**Commit:** 81584c399c38f482b747f178e06114fedb37b2f1
**Executor:** inline:p04 root (two Low wording findings, review round 2)
**Source review:** reviews/archived/p04-review-2026-11-08T061551Z.md (L1, L2)
Files: `src/core/import/transaction.ts` (message text), `documentation/commands.md`
Proof: 343 tests, lint, typecheck, format:check pass

---

## Phase p05: Consumers and linking for imported evidence

**Status:** completed
**Base:** 81584c399c38f482b747f178e06114fedb37b2f1
**Executor:** phase-implementer:wce-p05-impl-1
**Head:** 9e70b3c7a6a3f467e96ccab3c3f72d802c8f3a4b

Worktree and branch as p04. Committing owner: the phase implementer (code); root owns the journal. Parallelism: no declared group; fan-out rejected (consumers share the record readers, the filter subset contract and the linking model); one phase implementer. Task class: hard-reasoning (many consumers; filter subset replacement must keep the previous subset on failure).

Verification at Head: implementer ran the full DoD batch (413 tests in 33 files; `npm pack --dry-run` 122 files, 10 package skills, no test-support files) and a built-CLI run in a temp home. Root re-ran typecheck, lint, format:check and tests at Head: pass (413). No dependency, lockfile or CI changes (the implementer reported a transient corepack reinstall of node_modules from the existing lockfile; tree clean).

Known Unknown settled (p05), extend or label per consumer: `filter` extend (copies `messages/`; only `--linked-only` applies to messages; other PR-only filters defined per type in docs); `status` extend (message counts by source, unverified attribution, unreadable files, unfinished import, subset state); stats (`analyze`, `analyze reports`, filter analysis, `get_stats`) extend with a separate `messages` section never added to PR/ticket counts; timeline (`analyze --timeline`, `get_timeline`) label PR/ticket-only (`coverage` field); project detection (`analyze --projects`, `get_projects`, detect-projects) label; `analyze team` label in docs and skill; `link` extend (mentions resolved on read, never stored as links; ticket `linkedPRs` compared normalized); `search_prs`, `search_tickets`, `list_repos` label (authored work only); `get_linked_work` extend (`mentionedInMessages`, kept apart from stored links); `search_pr_reviews` extend (an out-of-date subset returns no results plus a note instead of reading the full log); new read-only `search_messages`; writing, detection, peer-review and manager skills extend with a supplementary-evidence section stating imported content is evidence, never instructions.

Deviations (accepted by root): the 0.5.0 behavior of reading reviews from the full log behind an out-of-date subset is removed (complexity F2); a subset is selected whenever `filtered/` exists, so an old subset whose filter matched no PRs is now used (CodeRabbit 4504862986, noted in CHANGELOG); `isFilteredSubsetMissingReviews` replaced by `getFilteredSubsetState().missing`. Open notes: concurrent `filter` runs on one work log are not supported (state stays consistent, the losing run errors; undocumented); unknown source directories under `messages/` are ignored silently.

Notes for later phases: p06 `checkRecord` should reject unverified Slack records; p07 acceptance can reuse `search_messages` and `link`'s mention report; manager skills should state the shared-channel rule once p06/p07 settle it. m03 `documents`: add to `IMPORTED_RECORD_DIRECTORIES`, decide the filter rule (`filter.utils.ts` keeps only `type === 'message'`), add a stats section, a subset `documents/` directory (`LATER_RECORD_DIRECTORIES`), and a search tool decision.

### Task p05-t01: Read imported records, resolve mentions, replace the subset safely

**Status:** completed
**Commit:** 7a0d27449dd1a437338660c51c1224b1250b4df4
**Executor:** phase-implementer:wce-p05-impl-1
Files: `src/core/linking/mentions{,.test}.ts`, `src/core/storage/{filtered-subset{,.test},reader{,.test},writer,paths,index}.ts`, `src/core/index.ts`
Proof: `vitest src/core`, typecheck, build

### Task p05-t02: Replace the filtered subset completely or not at all

**Status:** completed
**Commit:** ae80b19b0e4f2d494fe971b05f690ab1e810ba5f
**Executor:** phase-implementer:wce-p05-impl-1
Files: `src/cli/commands/filter/{index,filter.utils}.ts` (moved from `filter.ts`), `src/cli/index.ts`, `mixed-work-log.test.ts`, commands README
Proof: mixed work-log test (fails with a broken message filter)

### Task p05-t03: Count imported messages in status, stats and link

**Status:** completed
**Commit:** d7ec2956073da85e001ad7dc22d62620aab8f125
**Executor:** phase-implementer:wce-p05-impl-1
Files: `analyzer/stats.ts`, `analyze.ts`, `analyze/reports.ts`, `status.ts`, `link.ts`, `linker/index{,.test}.ts`, `filter.utils.ts`, mixed test
Proof: linker and mixed tests

### Task p05-t04: Serve imported messages over MCP and honor the selected subset

**Status:** completed
**Commit:** 0573782322c732c90045870ba02df55db6cc8d9f
**Executor:** phase-implementer:wce-p05-impl-1
Files: `src/mcp/tools/{search-messages,types,get-*,search-pr-reviews,index}.ts`, `server{,.test}.ts`, `tools-list.golden.json`, `tools.test.ts`
Proof: tools and server tests incl. read-only snapshot

### Task p05-t05: Skills for imported messages and the review path

**Status:** completed
**Commit:** 249d6971373bf9ea874dbde0b0975cd0a2f601a2
**Executor:** phase-implementer:wce-p05-impl-1
Files: 10 package skills
Proof: skill text reviewed against the CLI

### Task p05-t06: Let analyze --full run while a filter swap is unfinished

**Status:** completed
**Commit:** 9429fca69de83f8fa026d3d21cfede9ade911743
**Executor:** phase-implementer:wce-p05-impl-1
Files: `analyze.ts`, mixed test
Proof: new mixed test

### Task p05-t07: Docs and CHANGELOG

**Status:** completed
**Commit:** f750036a84b1aa8f6bf6fad9c871ea302343a8ea
**Executor:** phase-implementer:wce-p05-impl-1
Files: `documentation/{commands,mcp-server,configuration,index,manager-mode,available-skills}.md`, `README.md`, `AGENTS.md`, `CHANGELOG.md`, `status.ts`
Proof: `format:check`, built CLI end-to-end in a temp home

### Task p05-t08: (review) Run one filter per work log at a time

**Status:** completed
**Commit:** 40787d9466660609d604d5e1eeadf63b61639957
**Executor:** phase-implementer:wce-p05-impl-1 (fix mode)
**Source review:** reviews/archived/p05-review-2026-11-08T065300Z.md (M1)
Proof: exclusive `.filter-lock` (claim then rename; stale only when the owner provably exited); a second run is refused and the subset unchanged; regression tests at both dangerous points

### Task p05-t09: (review) Fail filter when a record directory or file cannot be read

**Status:** completed
**Commit:** 6c47e137d002d88e2112c654b98aaae5f9de7716
**Executor:** phase-implementer:wce-p05-impl-1 (fix mode)
**Source review:** reviews/archived/p05-review-2026-11-08T065300Z.md (M2)
Proof: any read error other than ENOENT fails the filter for every record type and keeps the previous subset; injected failures via `ReaderFs`

### Task p05-t10: (review) Never present reviews as the user's when the username is unknown

**Status:** completed
**Commit:** eea839420a88dffec9001a03eff8d6fb8929fd6f
**Executor:** phase-implementer:wce-p05-impl-1 (fix mode)
**Source review:** reviews/archived/p05-review-2026-11-08T065300Z.md (M3)
Proof: `search_pr_reviews` returns no results plus `unattributed` and a note; `status` stops counting; the four writing skills apply the rule on the MCP path

### Task p05-t11: (review) Give advice that works when filtered/ is not a directory

**Status:** completed
**Commit:** 69f6d9d1387a0033a1072ee060138fd3ecbd7dfb
**Executor:** phase-implementer:wce-p05-impl-1 (fix mode)
**Source review:** reviews/archived/p05-review-2026-11-08T065300Z.md (L1)
Proof: regular file and dangling symlink cases

### Task p05-t12: (review) Count only the user's review records in the filtered subset

**Status:** completed
**Commit:** 28540d5da736caa2023b823ae845c75ffbca2525
**Executor:** phase-implementer:wce-p05-impl-1 (fix mode)
**Source review:** reviews/archived/p05-review-2026-11-08T065300Z.md (L2)
Proof: foreign-reviewer status test extended

### Task p05-t13: (review) Say why get_stats and get_linked_work show no messages

**Status:** completed
**Commit:** 8bc34a535ea8cee5aa9e0aa07e369eb595ba895f
**Executor:** phase-implementer:wce-p05-impl-1 (fix mode)
**Source review:** reviews/archived/p05-review-2026-11-08T065300Z.md (L3)
Proof: out-of-date subset note tests

Root re-ran typecheck, lint, format:check and tests at 8bc34a5: pass (428).

### Task p05-t14: (review) Release the filter lock atomically and take over stale locks one at a time

**Status:** completed
**Commit:** 1e9bd6d2692ae75231a5247d10c75aa00bd3730d
**Executor:** phase-implementer:wce-p05-impl-1 (fix mode, round 2)
**Source review:** reviews/archived/p05-review-2026-11-08T071332Z.md (L1, L2, L3 error text)
Release renames `.filter-lock` to `.filter-lock.released-<runId>` before removal; stale takeover runs under a `.filter-lock.takeover` guard and claims through the normal path; leftovers cleaned under the lock; refusal names path, holder and removal step.
Proof: new lock tests; reviewer stress probe 0 deletion warnings (adjusted probe: 0 double holds over 2 and 6 processes); takeover3 probe: one run inside

### Task p05-t15: (review) Show who holds the filter lock in status and how to recover

**Status:** completed
**Commit:** 5d723ff03ce1a3e3c284e99368982ccfbf16b48d
**Executor:** phase-implementer:wce-p05-impl-1 (fix mode, round 2)
**Source review:** reviews/archived/p05-review-2026-11-08T071332Z.md (L3)
Files: `src/cli/commands/status.ts`, `mixed-work-log.test.ts`, `documentation/commands.md`
Proof: mixed test with a foreign-host lock; root re-ran typecheck, lint, format:check, 435 tests at 5d723ff: pass

### Task p05-t16: (review) Name the right holder in rare filter-lock takeover refusals

**Status:** completed
**Commit:** 9e70b3c7a6a3f467e96ccab3c3f72d802c8f3a4b
**Executor:** inline:p05 root (two Low message findings, review round 3; fix-loop bound reached)
**Source review:** reviews/archived/p05-review-2026-11-08T073033Z.md (L1, L2)
Files: `src/core/storage/filtered-subset.ts`, `filtered-subset.test.ts`, `documentation/commands.md`
Proof: new dead-guard test fails on 5d723ff code; 436 tests, lint, typecheck, format:check pass

---

## Phase p06: Slack configuration and CLI

**Status:** completed
**Base:** 9e70b3c7a6a3f467e96ccab3c3f72d802c8f3a4b
**Executor:** phase-implementer:wce-p06-impl-1
**Head:** 6bfcfecd44b80efa12b280a6f41f7fe4b0c4e57f

Worktree and branch as p04. Committing owner: the phase implementer (code); root owns the journal. Parallelism: no declared group; fan-out rejected (config schema, `slack` commands and the import-side Slack rules share the config types); one phase implementer. Task class: consequential (privacy enforcement at the import boundary).

Slack connector capability (root, 2026-11-08; from the Slack plugin tool schemas plus one read-only `slack_search_public` call limited to one of the user's own messages, recording field names only): search results are rendered text, not JSON, and give the channel ID and name, author name and user ID, time, `Message_ts`, a permalink whose query carries `thread_ts` (the parent thread) and `cid`, and the message text. They carry no reply count, no channel visibility field and no workspace (team) ID. `slack_search_public` covers public channels only; `slack_search_public_and_private` covers private channels and DMs and needs user consent; filters `from:<@U…>`, `in:<#C…>`, `is:thread`, `after:`/`before:` and cursor pagination exist; `include_context=false` keeps neighbouring messages out of results. `slack_read_channel` (detailed) includes thread info for top-level messages; `slack_read_thread` returns every reply (others' text), so skills must not use it for import. `slack_list_user_channels` lists the acting user's channels with a type filter (public, private, im, mpim) and `team_id`; `slack_list_channel_members` lists member IDs (30 per page), so manager-mode shared membership is checkable by the skill. The workspace (team) ID must come from setup (config) since search results omit it. Settles the p06 Known Unknown; exact reply-count availability is confirmed in p07's live walkthrough.

Verification at Head: implementer ran the full DoD batch (505 tests in 36 files; `npm pack --dry-run` 130 files). Root re-ran typecheck, lint, format:check and tests at Head: pass (505); no dependency, lockfile or CI changes; no real Slack IDs in tracked files.

Known Unknown settled (p06), config field names: IC profile top-level `slack: { workspace, user, channels: [{ id, name, reason, private }] }` (`workspace` team ID `T…`/`E…`; `user` `U…`/`W…`; channel `C…`/`G…`, `D…` and `mpdm-` names refused, `G…` requires `private: true`, `reason` required); manager report `reports[].slack` with the same shape plus per-channel `sharedWithManager` (default false). No `slack` section means Slack is off for that subject. Schema change additive; `reports update` keeps report Slack settings.

Decision (p06): manager-mode shared membership is enforced in the CLI — `slack channels add --report <id>` requires `--shared-with-manager`, and `import`/`validate` refuse report records from channels without it; the p07 setup skill must check membership with `slack_list_user_channels` (manager) and `slack_list_channel_members` (report) before passing the flag.

Read command contract for p07: `work-chronicler slack show --json [--report <id>]` prints `profile`, `mode`, `subject`, `subjectName`, `configured`, `range {since, until}`, `workspace`, `user`, `channels[]` (`id`, `name`, `reason`, `private`, `sharedWithManager`, `importable`), `record` (source, sourceAccount, subject, verified attribution), `importCommand` (argv with `<staging-dir>`), `workLog`. Import skill per record: `sourceId` `<channel>/<Message_ts>`; `url` null or the bare permalink (`thread_ts`/`cid` only); `attribution.authorId` = configured user after checking the result author; replies carry `thread: {parentId: thread_ts, parentUrl}` and zero reply counts; thread starters `thread: null`; body is the subject's own text only; use `slack_search_public` (private variant only for opted-in private channels), `include_context=false`, never `slack_read_thread`; `after:` is exclusive, search from the day before `range.since`.

Open notes: config edits use an atomic replace through `ImportFs` (comments and unknown keys kept; a crash before rename can leave a hidden `.config.yaml.tmp-*`); `--private` is a declaration the CLI cannot verify; `import` does not enforce the fetch range; `reports add|update|remove` still rewrites the manager config in place (pre-existing).

### Task p06-t01: Slack settings and a safe config rewrite

**Status:** completed
**Commit:** 0cacec6427b60492638f88fbff59a628a3bb0b52
**Executor:** phase-implementer:wce-p06-impl-1
Files: `src/core/types/slack.ts`, `src/core/config/{schema,config-file,slack-config,slack-config.test}.ts`, `src/core/types/manager.ts`, `src/core/import/import-fs.ts`
Proof: `vitest src/core/config` (comments kept, concurrent change, injected write/rename failures, crash before rename, permissions, symlink refusal)

### Task p06-t02: Enforce Slack opt-in and privacy rules on import

**Status:** completed
**Commit:** 0dbdbbf23bbab94c549fb83e5d60a98b27c02361
**Executor:** phase-implementer:wce-p06-impl-1
Files: `src/core/import/{sources,staging,index,import.test-support,slack-rules.test,validate.test,commit.test}.ts`, `src/cli/commands/import/{import.utils,import.test}.ts`
Proof: `slack-rules.test.ts` (18 of 24 fail with `checkRecord` disabled) and CLI tests; planted secret never echoed

### Task p06-t03: `slack configure`, `channels add|remove|list`, `show`

**Status:** completed
**Commit:** a2fd010c8941c293cbec1de4755303e28e627166
**Executor:** phase-implementer:wce-p06-impl-1
Files: `src/cli/commands/slack/*`, `src/cli/index.ts`, commands README, `slack-config.ts`
Proof: `slack.test.ts` (real CLI) and a manual IC and manager run in a temp home

### Task p06-t04: Docs and CHANGELOG

**Status:** completed
**Commit:** b5b900b9d3ea4bbb0c02a227edec50ef9699e8a8
**Executor:** phase-implementer:wce-p06-impl-1
Files: `documentation/{commands,configuration,manager-mode}.md`, `README.md`, `AGENTS.md`, `CHANGELOG.md`
Proof: `format:check`; documented config and record example run through the built CLI; repeat import unchanged

### Task p06-t05: (review) Decide Slack config changes by value; refuse unlisted removal

**Status:** completed
**Commit:** 8ebb89d12baa9de350aad95865474166c480f3a4
**Executor:** phase-implementer:wce-p06-impl-1 (fix mode)
**Source review:** reviews/archived/p06-review-2026-11-08T075843Z.md (M1)
Proof: hand-formatted config tests: no-op leaves bytes identical with `changed:false`; mistyped remove exits 1 naming configured IDs; 5 tests fail on b5b900b

### Task p06-t06: (review) Refuse a hard-linked config instead of splitting it

**Status:** completed
**Commit:** b0715a52ccf909bb013bbef7625fd73789ee7320
**Executor:** phase-implementer:wce-p06-impl-1 (fix mode)
**Source review:** reviews/archived/p06-review-2026-11-08T075843Z.md (L1)
Proof: additive `nlink` on FsEntry; real hard link and injected `nlink: 2` refused; tests fail on b5b900b

### Task p06-t07: (review) Require the configured channel name on Slack records

**Status:** completed
**Commit:** 6bfcfecd44b80efa12b280a6f41f7fe4b0c4e57f
**Executor:** phase-implementer:wce-p06-impl-1 (fix mode)
**Source review:** reviews/archived/p06-review-2026-11-08T075843Z.md (L2)
Proof: `container.name` must be null or exactly the configured name; error names only the field

Root re-ran typecheck, lint, format:check and tests at 6bfcfec: pass (515). Note for p07: the import skill copies the channel `name` from `slack show` (or writes null), never the name from search results.

---

## Phase p07: Slack skills and live walkthrough

**Status:** completed
**Base:** 6bfcfecd44b80efa12b280a6f41f7fe4b0c4e57f
**Executor:** phase-implementer:wce-p07-impl-1
**Head:** d990a404b16c80ff11fa01d7bd957b3486d5a922

Worktree and branch as p04. Committing owner: the phase implementer (skills, acceptance test, docs); the root runs the live read-only walkthrough itself (privacy control stays with the root) and owns the journal. Parallelism: no declared group; one phase implementer. Task class: hard-reasoning (skill text that must enforce privacy rules the CLI cannot see).

Verification at Head: implementer ran the full DoD batch at 9bd7083 (535 tests in 37 files; `npm pack --dry-run` 132 files with both Slack skills; built `skills install` into a temp HOME installed 12 skills). Root re-ran typecheck, lint, format:check and tests at 9bd7083 (535) and the Slack suites after p07-t09 (13): pass.

Live read-only walkthrough (root, 2026-11-08; Slack plugin connector, temp `WORK_CHRONICLER_HOME`, deleted afterwards; redacted counts only):

- First pass, following the skills as first written, found five gaps: no read tool exposes the workspace (team) ID; `slack_read_user_profile` concise omits the user ID; `slack_search_public` concise omits channel IDs, `Message_ts` and permalinks; message text uses Slack markup (`<@U…|Name>`, `<url|label>`); file-only messages have empty text. Fixed in p07-t05..t08 (workspace URL label accepted; skills require detailed formats and rewrite markup).
- Second pass with the fixed skills: workspace configured by URL label (team ID available: no); user ID from the detailed profile; 3 public channels added (0 private; private channels declined). Searched 3 channels (detailed, `include_context=false`, cursor paging): channel A 15 results, channel B 1 result, channel C more than 40 results over several pages (searched for paging behavior; not imported, to bound the walkthrough). Imported channels A and B: 16 results, 15 kept, 1 skipped (empty/file-only), 0 other-author, 0 out of range. `validate`: ok, 0 issues. `import`: created 15. `link`: 0 of 3 PR mentions resolved (no PRs in the temp work log; expected). `status`: 15 messages. Rerun of the same batch: created 0, unchanged 15. Leak check on stored records: 0 files with display names, raw `<@U…>` mentions or `|label` link text; 3 with `@someone`; 11 replies carry only a parent ID and URL.
- Observations fixed in p07-t09: detailed results do show `Reply count:` for a thread the subject started (copied into `replyCount`); quoted text from others arrives as `>` lines (dropped). Reply participant counts are never shown (stay 0).

### Task p07-t01: Add the setup-slack skill

**Status:** completed
**Commit:** b9840106d23133ff577ff5d4d9cbd57ac0132f58
**Executor:** phase-implementer:wce-p07-impl-1
Files: `.agents/skills/work-chronicler-setup-slack/SKILL.md`
Proof: commands and flags checked against CLI `--help`

### Task p07-t02: Add the import-slack skill

**Status:** completed
**Commit:** 6543e3434ce2e43b12516e2faa0382abb4fd6b14
**Executor:** phase-implementer:wce-p07-impl-1
Files: `.agents/skills/work-chronicler-import-slack/SKILL.md`
Proof: both example records validate through the real CLI

### Task p07-t03: Slack import acceptance test

**Status:** completed
**Commit:** 090df3f334ac21dc38c1a2026e21c387346a2369
**Executor:** phase-implementer:wce-p07-impl-1
Files: `src/cli/commands/slack/slack-acceptance.test.ts`
Proof: 5/5 pass; manager refusal fails with the CLI rule disabled

### Task p07-t04: Docs and CHANGELOG

**Status:** completed
**Commit:** c6a69c74b5959052e5242fddeb60826c56131434
**Executor:** phase-implementer:wce-p07-impl-1
Files: `documentation/{available-skills,commands,configuration,manager-mode}.md`, `README.md`, `AGENTS.md`, `CHANGELOG.md`
Proof: `format:check`

### Task p07-t05: (walkthrough) Accept a Slack workspace URL label in place of a team ID

**Status:** completed
**Commit:** c5bb6068e2495fcfde5daa7b53277729d42020d1
**Executor:** phase-implementer:wce-p07-impl-1 (walkthrough fix)
Files: `src/core/types/slack.ts`, `src/core/import/sources.ts`, `src/cli/commands/slack/{configure,show}.ts`, tests
Proof: 5 new tests fail on the old schema

### Task p07-t06: (walkthrough) Match the Slack skills to what the connector returns

**Status:** completed
**Commit:** 3020f754096126a4313d7bbf29fb44d37e243eff
**Executor:** phase-implementer:wce-p07-impl-1 (walkthrough fix)
Files: both Slack `SKILL.md` files
Proof: commands and flags still exist; examples validate

### Task p07-t07: (walkthrough) Cover a URL-label workspace and Slack markup in acceptance

**Status:** completed
**Commit:** 134fb3c654f2b8f2445b25133fe03a01a6195135
**Executor:** phase-implementer:wce-p07-impl-1 (walkthrough fix)
Files: `slack-acceptance.test.ts`
Proof: 5/5 pass; no display name, ID or `|` reaches stored records

### Task p07-t08: (walkthrough) Document the Slack workspace URL label

**Status:** completed
**Commit:** 9bd708333f07da3ed8ba67970885fa2d19dd4818
**Executor:** phase-implementer:wce-p07-impl-1 (walkthrough fix)
Files: `documentation/{configuration,commands,available-skills}.md`, `CHANGELOG.md`
Proof: `format:check`

### Task p07-t09: (walkthrough) Copy shown reply counts and drop quoted lines in import-slack

**Status:** completed
**Commit:** cf5e68f2ac616aef5ef8e2448c698fa38a2a435d
**Executor:** inline:p07 root (two small skill-text corrections from the live walkthrough)
Files: `.agents/skills/work-chronicler-import-slack/SKILL.md`
Proof: Slack suites 13/13 (skill examples validate)

### Task p07-t10: (review) Refuse Slack message bodies that still hold raw Slack markup

**Status:** completed
**Commit:** 3848cc7dbedc9974679d05fa74f98c367f38d62f
**Executor:** phase-implementer:wce-p07-impl-1 (fix mode)
**Source review:** reviews/archived/p07-review-2026-11-08T083240Z.md (L2)
Proof: body passed additively to source rules; 8 markup forms refused with `SOURCE_RULE` on `body` (secret never echoed), 5 clean bodies accepted; tests fail without the rule

### Task p07-t11: (review) Align the import-slack example and acceptance with the CLI

**Status:** completed
**Commit:** 114cb90d71deb230a09f69dea7f1593ba80fd41d
**Executor:** phase-implementer:wce-p07-impl-1 (fix mode)
**Source review:** reviews/archived/p07-review-2026-11-08T083240Z.md (L1, L2)
Proof: example record 1 `replyCount: 2`; acceptance stages raw search text and `validate` refuses it

### Task p07-t12: (review) Document the Slack body markup rule

**Status:** completed
**Commit:** 5d53367c2567b325854ef56f4f09d96c9ea6e79a
**Executor:** phase-implementer:wce-p07-impl-1 (fix mode)
**Source review:** reviews/archived/p07-review-2026-11-08T083240Z.md (L2)
Proof: `format:check`

Root re-ran typecheck, lint, format:check and tests at 5d53367: pass (548).

### Task p07-t13: (review) Catch mail, phone and date markup; allow ordinary angle text

**Status:** completed
**Commit:** d990a404b16c80ff11fa01d7bd957b3486d5a922
**Executor:** inline:p07 root (two Low findings, review round 2)
**Source review:** reviews/archived/p07-review-2026-11-08T084045Z.md (L1, L2)
Files: `src/core/import/sources.ts`, `slack-rules.test.ts`, `.agents/skills/work-chronicler-import-slack/SKILL.md`
Proof: 3 new rule cases fail on 5d53367; full suite, lint, typecheck, format:check pass

---

## Phase p12: Installer replacement safety

**Status:** completed
**Base:** d990a404b16c80ff11fa01d7bd957b3486d5a922
**Executor:** phase-implementer:wce-p12-impl-1
**Head:** 76140798ed0f67bb17ab685ed76f9d364e76a4cd

Worktree and branch as p04. Committing owner: the phase implementer (code); root owns the journal. Parallelism: no declared group; one phase implementer. Task class: consequential (replacing a user's installed skills; data loss is the failure mode).

Verification at Head: implementer ran the full DoD batch (566 tests; `npm pack --dry-run` 133 files) and the built CLI into a temp HOME (fresh copy install, symlink `--overwrite`, copy `--overwrite`: 12 of 12 skills each, no leftovers). Root re-ran typecheck, lint, format:check and tests at Head: pass (566).

Design: on `--overwrite`, each skill is staged beside its destination and verified, the existing entry is moved aside, the new one is verified in place, then the old one is deleted; any failure before that restores it. Cleanup failures are warnings and the run continues. Failures injected through a `SkillInstallFs` seam (extends `ImportFs` with `copyTree` and `symlink`); no new chmod tests. The next run removes leftover staging entries and restores a single moved-aside skill when nothing holds its name, otherwise names the leftover. `migrate.ts` decisions unchanged (behavior-preserving extraction of `declaredSkillName`).

Accepted concerns (root): a link from elsewhere into a replaced skill's subfolder can still break if the packaged version lacks that file (pre-existing; links to the skill itself keep working); cleanup warnings exit 0 when every skill installed; no lock between concurrent installs (nothing lost; messages could mislead); a crash leaves hidden `.<skill>.wc-…` entries until the next run; a restored backup gets the standard lowercase name.

### Task p12-t01: Stage and verify before replacing

**Status:** completed
**Commit:** 38aeb92641fed00eb76c886b09f02454f3072ce0
**Executor:** phase-implementer:wce-p12-impl-1
Files: `src/cli/commands/skills/{replace,install,install.test,migrate}.ts`
Proof: skills tests 35/35; restoring delete-before-copy fails all 8 new failure tests

### Task p12-t02: Recover after an interrupted install

**Status:** completed
**Commit:** 01e0491e9570c4d8d2aad5c1fee9e55f11475449
**Executor:** phase-implementer:wce-p12-impl-1
Files: `replace.ts`, `install.ts`, `install.test.ts`
Proof: skills tests 38/38; mutation check

### Task p12-t03: Changelog and docs

**Status:** completed
**Commit:** 80aa589f2c0c261c91798e99db6d2c6a2a6a5581
**Executor:** phase-implementer:wce-p12-impl-1
Files: `CHANGELOG.md`, `documentation/{available-skills,commands}.md`
Proof: `format:check`

### Task p12-t04: (review) Never put back a replaced skill whose deletion stopped part-way

**Status:** completed
**Commit:** 63b49230bb71761d3704e4a082826eae201a418e
**Executor:** phase-implementer:wce-p12-impl-1 (fix mode)
**Source review:** reviews/archived/p12-review-2026-11-08T090005Z.md (M1)
Files: `src/cli/commands/skills/{replace,install.test}.ts`
Proof: old copy renamed to `.<skill>.wc-replaced-<id>` before deletion and never restored; a backup is restored only if it is the only one, nothing holds the name, and its SKILL.md still declares the skill; 3 tests fail on 80aa589

### Task p12-t05: (review) Describe which leftovers the next install puts back

**Status:** completed
**Commit:** 3b5ac311a459321ee28fcdb184ef80dbdc30fd0c
**Executor:** phase-implementer:wce-p12-impl-1 (fix mode)
**Source review:** reviews/archived/p12-review-2026-11-08T090005Z.md (M1)
Files: `documentation/available-skills.md`
Proof: `format:check`

Root re-ran typecheck, lint, format:check and tests at 3b5ac31: pass (568).

### Task p12-t06: (review) Describe a kept backup after a failed replace rename accurately

**Status:** completed
**Commit:** 76140798ed0f67bb17ab685ed76f9d364e76a4cd
**Executor:** inline:p12 root (one Low docs finding, review round 2)
**Source review:** reviews/archived/p12-review-2026-11-08T090704Z.md (L1)
Files: `documentation/available-skills.md`
Proof: `format:check`

---

## Phase p08: 0.6.0 release preparation

**Status:** completed
**Base:** 76140798ed0f67bb17ab685ed76f9d364e76a4cd
**Executor:** inline:p08-inline-exception
**Head:** 6360304b9d261a54a8cdc1f46089ab7a6068a163

Inline exception (recorded before editing): version bump and CHANGELOG section move only — no new surface, no unresolved design, not consequential before the tag push (which happens after merge under the Release authority), one proof command (the local DoD batch). Committing owner: root. Parallelism: single trivial phase.

Verification at Head: `pnpm format && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build && npm pack --dry-run` pass (568 tests; tarball `work-chronicler-0.6.0.tgz`, 133 files, 12 package skills). Ready-PR CI is the merge precondition.

### Task p08-t01: Prepare 0.6.0 release

**Status:** completed
**Commit:** 3c4e449cb7d98c1c991d3e65a5dcf012619f7d05
**Executor:** inline:p08-inline-exception (root)
Files: `package.json`, `CHANGELOG.md`
Proof: local DoD batch

### Task p08-t02: (review) Link the 0.6.0 changelog section

**Status:** completed
**Commit:** a30a11836b7fce248cefc50d4ba3b4c8c593db0e
**Executor:** inline:p08-inline-exception (root)
**Source review:** reviews/archived/p08-review-2026-11-08T091055Z.md (M1)
Files: `CHANGELOG.md`
Proof: `format:check`; link references match the 0.5.0 release pattern

### Task p08-t03: (gate) Never act through a moved, replaced or linked import path

**Status:** completed
**Commit:** c6897378e91521342fc1c6610469c584e224895b
**Executor:** phase-implementer:wce-p04-impl-1 (m02 closeout fix)
**Source review:** reviews/archived/final-review-2026-11-08T092006Z.md (H1, H2)
Journal format v2 records identities of the transaction, its folders and every work-log directory the batch uses; new directories are built inside the transaction and placed by one rename; cleanup and recovery act only through recorded identities, otherwise `RECOVERY_CONFLICT` with the journal kept. Sweep of every destructive operation in `transaction.ts` recorded in the fix report (journal writes, prepare writes, markers, rollback, completion check, discard). Residual: no `openat`/`renameat2` in Node.
Files: `src/core/import/transaction.ts`, `commit.test.ts`
Proof: 6 new tests fail on a30a118 (gate hook, swapped parent, linked/copied backup folder, crash-then-link loop)

### Task p08-t04: (gate) Describe identity-checked rollback and recovery

**Status:** completed
**Commit:** 9b9cb42346c8f4b57438a86177933624ec44063c
**Executor:** phase-implementer:wce-p04-impl-1 (m02 closeout fix)
**Source review:** reviews/archived/final-review-2026-11-08T092006Z.md (H1, H2)
Files: `documentation/commands.md`, `CHANGELOG.md` ([0.6.0], unreleased)
Proof: `format:check`; root re-ran typecheck, lint, format:check, 574 tests at 9b9cb42: pass

### Task p08-t05: (gate) Resolve the filtered subset on every MCP tool call

**Status:** completed
**Commit:** ce900184bb444954f45978a233c4478ffac09694
**Executor:** phase-implementer:wce-p05-impl-1 (m02 closeout fix)
**Source review:** reviews/archived/final-review-2026-11-08T092006Z.md (M1)
The server is bound to the full work log and resolves the subset state before every tool call, re-checking after the handler; an in-progress, interrupted or unreadable subset returns no results with an `error` and `note`, never the full log.
Files: `src/mcp/server.ts`, `server.test.ts`, `src/mcp/tools/types.ts`, `src/cli/commands/status.ts`, `documentation/{mcp-server,commands}.md`, `CHANGELOG.md` ([0.6.0])
Proof: same-client transport regression (full → subset → full, interrupted, in progress); root re-ran typecheck, lint, format:check, 576 tests at ce90018: pass

### Task p08-t06: (gate) Route every import change through one path guard

**Status:** completed
**Commit:** cd9c09e3ff10dae6e8f14e5dcd73ce225eea2efb
**Executor:** phase-implementer:wce-p04-impl-1 (m02 closeout fix)
**Source review:** reviews/archived/final-review-2026-11-08T094553Z.md (H1)
`PathGuard` vouches for every directory by recorded identity (journal v3 adds the work-log root) and checks the whole chain root → parent before every mkdir, write, link, rename, unlink, rmdir and tree removal; raw mutation calls exist only inside the guard. Call-site inventory recorded in the fix report (lock, leftovers, journal writes, staged writes, discard, rollback, created-directory removal, recovery, commit).
Files: `src/core/import/transaction.ts`, `commit.test.ts`, `import.test-support.ts`
Proof: gate regression and generic per-mutation ancestor-substitution loops (commit, rollback, recovery) fail on ce90018 (the loop also found a journal write through a linked `.import-transaction`) and pass now

### Task p08-t07: (gate) Say every import change checks the directories it uses

**Status:** completed
**Commit:** 890358f95e9adde796635336ae741de206fc0e2d
**Executor:** phase-implementer:wce-p04-impl-1 (m02 closeout fix)
**Source review:** reviews/archived/final-review-2026-11-08T094553Z.md (H1)
Files: `documentation/commands.md`, `CHANGELOG.md` ([0.6.0])
Proof: `format:check`; root re-ran typecheck, lint, format:check, 583 tests at 890358f: pass

Decision (root): recovery keeps comparing device and inode; a device change after a reboot or remount stops recovery with `RECOVERY_CONFLICT` for a manual check (fail-closed), rather than trusting inode alone.

### Task p08-t08: (review) Share the filter lock's stale takeover with import

**Status:** completed
**Commit:** f6274a6e682676f69c82684cce9dc8f51ab28b16
**Executor:** phase-implementer:wce-p04-impl-1 (m02 integrated-review fix)
**Source review:** reviews/archived/m02-review-2026-11-08T101759Z.md (H1)
One shared helper (`src/core/storage/work-log-lock.ts`, the reviewed filter-lock algorithm moved as is) now serves `.filter-lock` and `.import-lock`; the import lock becomes a directory (`.import-lock/owner.json`; 0.6.0 unreleased, no migration) with a `.takeover` guard; its seam goes through the PathGuard. Filter-lock tests unchanged (empty diff).
Files: `src/core/storage/{work-log-lock,filtered-subset}.ts`, `src/core/import/{transaction,import-fs,index,commit.test,lock.test}.ts`
Proof: reviewer's three-contender schedule fails on 890358f and passes now; stale takeover and live-owner controls; full suite 586

### Task p08-t09: (review) Describe the shared import lock and its takeover guard

**Status:** completed
**Commit:** 1ad43f40604571e0cf3262d6f5c2e10d745fcf1d
**Executor:** phase-implementer:wce-p04-impl-1 (m02 integrated-review fix)
**Source review:** reviews/archived/m02-review-2026-11-08T101759Z.md (H1)
Files: `documentation/{commands,configuration}.md`, `CHANGELOG.md` ([0.6.0])
Proof: `format:check`; root re-ran typecheck, lint, format:check, 586 tests at 1ad43f4: pass

### Task p08-t10: (gate) Report a published subset when later cleanup cannot list

**Status:** completed
**Commit:** bcdf38eed2cc89a1add12313e88c6d679b905752
**Executor:** phase-implementer:wce-p04-impl-1 (m02 closeout fix)
**Source review:** reviews/archived/range-review-2026-11-08T103910Z.md (M2)
After publication (or `--clear` deselection) listing or removal failures are warnings; the one failure that leaves the subset changed throws `FilteredSubsetNotRestoredError` and the CLI says so.
Files: `src/core/storage/filtered-subset.ts` (+test), `src/core/storage/index.ts`, `src/core/index.ts`, `src/cli/commands/filter/index.ts`
Proof: listing regressions fail on 1ad43f4; existing filter tests unmodified

### Task p08-t11: (gate) Recover only on proof and verify unchanged batch members

**Status:** completed
**Commit:** 6324b4cfe83ec7cd2453d05bb482ea5fcd561635
**Executor:** phase-implementer:wce-p04-impl-1 (m02 closeout fix)
**Source review:** reviews/archived/range-review-2026-11-08T103910Z.md (H1, M1)
Without a journal, the transaction is discarded only when its contents prove nothing was applied; otherwise `RECOVERY_CONFLICT` with all files kept. Unchanged batch members are re-verified before acceptance. Recovery-branch audit (12 branches) found and fixed two more unproven branches: a `prepared` journal discarded without checking, and a used staged copy with a missing marker skipped in rollback.
Files: `src/core/import/transaction.ts`, `commit.test.ts`
Proof: 7 new regressions fail on 1ad43f4; safe-preparation control passes on both

### Task p08-t12: (gate) Describe proof-based recovery and filter cleanup warnings

**Status:** completed
**Commit:** 9548ee32b4b8b7595a6907bac00b9c18ff211b86
**Executor:** phase-implementer:wce-p04-impl-1 (m02 closeout fix)
**Source review:** reviews/archived/range-review-2026-11-08T103910Z.md (H1, M1, M2)
Files: `documentation/commands.md`, `CHANGELOG.md` ([0.6.0])
Proof: `format:check`; root re-ran typecheck, lint, format:check, 597 tests at 9548ee3: pass

### Task p08-t13: (CI) Give the CLI-running Slack suites a 60 s timeout

**Status:** completed
**Commit:** 6360304b9d261a54a8cdc1f46089ab7a6068a163
**Executor:** inline:p08 root (CI failure on PR #26: two tests timed out at vitest's 5 s default on the runner)
Files: `src/cli/commands/slack/{slack,slack-acceptance}.test.ts`
Proof: Slack suites 13/13 locally; ready-PR CI re-run

---

## Phase p13: Import and filter locking and recovery

**Status:** completed
**Base:** 1bdd3d8737dde4aa3305a3ac5a1b06f81e04a2bc
**Executor:** phase-implementer:wce-p13-impl-1
**Head:** 1a19d8554d802670f182ecec38952dfde9833ed6

Branch `oat/evidence-expansion-m03` (from m02 head 6360304 with origin/main b17cb23 merged at 1bdd3d8). Committing owner: the phase implementer (code); root owns the journal. Task class: consequential (concurrent writers to the work log; data loss and stale evidence are the failure modes).

Verification at Head: implementer ran the full DoD batch (638 tests, 40 files; build). Root re-ran typecheck, lint, format:check and tests at Head: pass (638).

Lock decision: one work-log lock, held under both 0.6.0 names (`.import-lock` then `.filter-lock`, released in reverse). Every 0.7.0 run takes `.import-lock` first, so `import` and `filter` (including `--clear`) are serialized; holding `.filter-lock` too refuses a 0.6.0 `filter`, and `.import-lock` refuses a 0.6.0 `import`. No new name, so reader-ignore prefixes are unchanged. Lock records carry the command and a boot ID (`validate` ignores a filter's lock; `status` names the holder). Reason: one mechanism, no legacy gap, no new names.

Threat matrix (implementer, written before code; each row tested): concurrent import/filter; mixed 0.6.0/0.7.0 runs; stale vs live owner and clock jump (boot ID; conservative for 0.6.0 owners without one); partial acquisition; import interrupted before `filter`; 0.6.0 v3 journal (literal fixture); readers during import (refuse while `.import-transaction/` exists; retry a changed scan, refuse after 3); crash at each lock rename; crash during `filter --clear`; `--clear` listing failure.

CodeRabbit (PR #26) dispositions: `reader.ts` partial batch: fixed (t03, t04). `work-log-lock.ts` wall clock: fixed with boot ID (t01). `filtered-subset.ts` cleanup order: fixed (t05). Deferred m02 Medium M1 (`filter --clear`): fixed (t05).

Accepted concerns (implementer): whole-second directory timestamps can miss a batch stored within the same second during a scan (documented); a 0.6.0 lock without a boot ID whose PID is reused after reboot reads as held until removed (message says how); cached `get_stats` during a pending import is p15; recovery inside `filter` uses the real import fs (p14 unifies seams). Deviations: `documentation/mcp-server.md` and an AGENTS.md note updated (behavior changed).

### Task p13-t01: Judge lock owners by boot ID, never the wall clock

**Status:** completed
**Commit:** 43570c7
**Executor:** phase-implementer:wce-p13-impl-1
Files: `work-log-lock.ts`, `import-fs.ts`, `filtered-subset.ts`, tests (new `work-log-lock.test.ts`)
Proof: storage and import suites

### Task p13-t02: One work-log lock for import and filter; status shows the holder

**Status:** completed
**Commit:** b6f478e
**Executor:** phase-implementer:wce-p13-impl-1
Files: `work-log-lock.ts`, `transaction.ts`, `filtered-subset.ts`, `status.ts`, import/filter `index.ts`, tests
Proof: 621 tests

### Task p13-t03: Filter finishes an interrupted import before reading

**Status:** completed
**Commit:** c3699a4
**Executor:** phase-implementer:wce-p13-impl-1
Files: `transaction.ts`, `import/index.ts`, `filtered-subset.ts`, `filter.utils.ts`, new `settle.test.ts`
Proof: 628 tests; literal 0.6.0 v3 journal recovers through filter and import

### Task p13-t04: Readers never read part of an import's batch

**Status:** completed
**Commit:** b9de45c
**Executor:** phase-implementer:wce-p13-impl-1
Files: `reader.ts`, `paths.ts`, `server.ts`, `linker/index.ts`, `status.ts`, tests
Proof: 633 tests

### Task p13-t05: filter --clear sets previous subsets aside before deselecting

**Status:** completed
**Commit:** 2a8eca9
**Executor:** phase-implementer:wce-p13-impl-1
Files: `filtered-subset.ts`, `filtered-subset.test.ts`
Proof: 3 new tests fail before, pass after; 636 tests

### Task p13-t06: Docs and CHANGELOG

**Status:** completed
**Commit:** 21515f5
**Executor:** phase-implementer:wce-p13-impl-1
Files: `AGENTS.md`, `CHANGELOG.md`, `documentation/{commands,configuration,mcp-server}.md`
Proof: format:check

### Task p13-t07: Import honors a live 0.6.0 filter lock and takes over a stale one

**Status:** completed
**Commit:** 3805888
**Executor:** phase-implementer:wce-p13-impl-1
Files: `src/core/import/lock.test.ts`
Proof: 8 lock tests

### Task p13-t08: (review M1) status names an interrupted subset correctly while an import holds the lock

**Status:** completed
**Commit:** 6a40166
**Executor:** phase-implementer:wce-p13-impl-1
Files: `status.ts`, `mixed-work-log.test.ts`
Proof: 638 tests; DoD batch green

### Task p13-t09: (review L4) settle warning in prose

**Status:** completed
**Commit:** 37ffd65
**Executor:** phase-implementer:wce-p13-impl-1
Files: `filtered-subset.ts`, `mixed-work-log.test.ts`, `settle.test.ts`
Proof: 638 tests; DoD batch green

### Task p13-t10: (review L1) correct the inspectImportState comment

**Status:** completed
**Commit:** a2fa9bd
**Executor:** phase-implementer:wce-p13-impl-1
Files: `transaction.ts`
Proof: 638 tests; DoD batch green

### Task p13-t11: (review L3) IMPORT_IN_PROGRESS belongs to import only

**Status:** completed
**Commit:** a5b1df2
**Executor:** phase-implementer:wce-p13-impl-1
Files: `documentation/commands.md`
Proof: 638 tests; DoD batch green

### Task p13-t12: (review L2) reboot takeover needs a boot ID (Linux, macOS)

**Status:** completed
**Commit:** 1a19d85
**Executor:** phase-implementer:wce-p13-impl-1
Files: `documentation/commands.md`, `CHANGELOG.md`
Proof: 638 tests; DoD batch green

---

## Phase p14: Import internals simplification

**Status:** completed
**Base:** 1a19d8554d802670f182ecec38952dfde9833ed6
**Executor:** phase-implementer:wce-p14-impl-1
**Head:** c785bc5193cb2cafea34961133b741e3e2460857

Branch `oat/evidence-expansion-m03`. Committing owner: the phase implementer (code); root owns the journal. Task class: consequential (refactor of safety-sensitive filesystem code; a behavior change is the failure mode).

Verification at Head: implementer ran the full DoD batch (639 tests, 40 files; build). Root re-ran typecheck, lint, format:check and tests at Head: pass (639).

Before-list (implementer, before the change). Ancestor checks: `requireDirectory`, `requireAncestors`, `verifyRoot`, `verifyDirectories`, `PathGuard.check` (`transaction.ts`), `checkDirectory` (`plan.ts`). Helper duplicates: `errorCode` (`issues.ts`, `work-log-lock.ts`, `filtered-subset.ts`, `replace.ts`); `codedError` (`import-fs.ts`, `transaction.ts`); `removeQuietly` (`work-log-lock.ts`, `filtered-subset.ts`, `config-file.ts`); `isProcessAlive` (`import-fs.ts`, `filtered-subset.ts`); `exists`/inline `exists`/`entryAt` (`filtered-subset.ts`, `transaction.ts`, `replace.ts`); `systemBootId` (`work-log-lock.ts`); `LockEnv`, `SubsetEnv`, `nodeSubsetEnv`, the `importEnv` option, and `SubsetFs` re-implementing `ImportFs` operations.

After: helper definitions only in `src/core/import/import-fs.ts`; `requireDirectory`, `requireAncestors`, `verifyRoot`, `verifyDirectories`, `LockEnv`, `SubsetEnv`, `nodeSubsetEnv`, `importEnv`, `stageAsTheSkillDoes` absent from `src/`; ancestor checks are PathGuard methods. Remaining: `plan.ts` `checkDirectory` runs at planning time, before identities exist, and records the identities PathGuard later enforces (kept).

Deviation (accepted by root): finding 1 (create the fixed record directories in place at the commit step) not done. A directory created in place has no recorded identity until a later journal write; a crash in between leaves an empty `messages/` that recovery cannot prove is the import's, and the crash-at-every-write test would have to be weakened. Avoiding that needs a leftover-directory behavior change or a journal format change. The existing staged directory creation stays; the "rejected batch creates no directory" test was added (t03). Source of truth: implementation.

Changed tests (t04): removed two assertions on the test helper's own filtering (`{kept: 3, skipped: 4}`, the helper's own error); replaced by CLI-boundary refusals (another person's message refused with `SOURCE_RULE` on `attribution.authorId`, not echoed, nothing stored; the unshared-channel refusal kept) and a new `slack show` field check. Range and empty-text skipping are skill-only rules the CLI never enforced.

Accepted concerns (implementer): `SubsetFs` keeps its own `stat`, `readFile`, `writeFile`, `mkdirp` (moving them would change fsync, symlink and size behavior); `reach` checks the work log by kind, not identity, as before; `nodeSubsetFs.lstat` now uses bigint stats (millisecond `mtimeMs`, used only for the 60 s claim grace). Also touched `config-file.ts` and `replace.ts` (held duplicate helpers).

### Task p14-t01: One filesystem and process seam for import, lock and filter

**Status:** completed
**Commit:** a7544e9
**Executor:** phase-implementer:wce-p14-impl-1
Files: `import-fs.ts`, `issues.ts`, `plan.ts`, `staging.ts`, `transaction.ts`, `work-log-lock.ts`(+test), `filtered-subset.ts`(+test), `config-file.ts`, `replace.ts`, `core/index.ts`, `storage/index.ts`
Proof: typecheck; 458 affected tests

### Task p14-t02: Make PathGuard the only ancestor checker

**Status:** completed
**Commit:** aba0df6
**Executor:** phase-implementer:wce-p14-impl-1
Files: `transaction.ts`
Proof: 297 import/storage/filter/mixed tests incl. crash, fault and substitution loops

### Task p14-t03: A validated or rejected batch creates no record directory

**Status:** completed
**Commit:** 90cfbce
**Executor:** phase-implementer:wce-p14-impl-1
Files: `commit.test.ts`
Proof: new test

### Task p14-t04: Literal Slack envelopes instead of re-implementing the skill

**Status:** completed
**Commit:** ac4d4cb
**Executor:** phase-implementer:wce-p14-impl-1
Files: `slack-acceptance.test.ts`
Proof: 5/5

### Task p14-t05: (review L1) Report PathGuard destinations with / on every platform

**Status:** completed
**Commit:** c785bc5
**Executor:** root
Files: `src/core/import/transaction.ts`
Proof: import suites 164/164; full suite 639; lint, typecheck, format:check

---

## Phase p15: Import, storage and MCP review follow-ups

**Status:** completed
**Base:** c785bc5193cb2cafea34961133b741e3e2460857
**Executor:** phase-implementer:wce-p15-impl-1
**Head:** 49b6dc355dec62fec1ad89419c01a9631859faa2

Branch `oat/evidence-expansion-m03`. Committing owner: the phase implementer (code); root owns the journal. Task class: consequential (import durability and evidence correctness).

Verification at Head: implementer ran the full DoD batch (659 tests, 41 files; build). Root re-ran typecheck, lint, format:check and tests at Head: pass (659).

Dispositions: all 15 items still held against the code and were fixed, each in its own commit with a test that fails without it (implementer reverted each fix to confirm). Deferral 4504862955 is now fixed for `search_messages` and date-filtered `get_stats`.

Pagination contract (`documentation/mcp-server.md#pages`; `search_documents` reuses it): newest `occurredAt` first, ties by record identity; opaque base64url `cursor`/`nextCursor` holding the last result's position (not an offset), so nothing is skipped or repeated across imports; `null` on the last page; foreign cursors refused; pages at most 64 KiB serialized (and `limit` when given), at least one result while any remain; text 1,000 chars, mentions until 16 KiB with `omittedMentions`; `total` constant across pages, `returned` per page. Cursors are bound to the tool and a hash of the filters (t17); a cursor used with other filters or by another tool is refused.

Deviations (implementer): t09 is `test(...)` (test only); `messageFrontmatter` default `occurredAt` now matches its synthetic ts; two tests rewritten for intended behavior changes (`get_stats` refreshed messages; subset state `generation`); golden tools list updated; four package skills explain paging and import-slack gives the batch limit.

Accepted concerns: `get_stats` without a range now returns unavailable during an import (documented); the generation fingerprint includes `filtered/` mtime, so `analyze` creating `filtered/.analysis/` mid-call yields a safe "call again".

### Task p15-t01: Flush the work-log root before an update-only batch changes a record

**Status:** completed
**Commit:** 78d05c6
**Executor:** phase-implementer:wce-p15-impl-1
CodeRabbit: 4506078302
Proof: test fails without the fix

### Task p15-t02: Permalink host must match a workspace URL label

**Status:** completed
**Commit:** 41d7f4b
**Executor:** phase-implementer:wce-p15-impl-1
CodeRabbit: 4506078299
Proof: test fails without the fix

### Task p15-t03: occurredAt within 1 s of the Slack ts in sourceId

**Status:** completed
**Commit:** ab6dbb5
**Executor:** phase-implementer:wce-p15-impl-1
CodeRabbit: review body sources.ts 81-92
Proof: test fails without the fix

### Task p15-t04: Leave Jira keys held by two instances unresolved

**Status:** completed
**Commit:** f62b364
**Executor:** phase-implementer:wce-p15-impl-1
CodeRabbit: 4506078308
Proof: test fails without the fix

### Task p15-t05: Refuse a stored file named only differently in letter case (IDENTITY_CONFLICT)

**Status:** completed
**Commit:** 308ec6b
**Executor:** phase-implementer:wce-p15-impl-1
CodeRabbit: 4506078311
Proof: test fails without the fix

### Task p15-t06: Read no records through symlinked record directories (read-only PathGuard walk)

**Status:** completed
**Commit:** 54191ff
**Executor:** phase-implementer:wce-p15-impl-1
CodeRabbit: review body reader.ts 375-380
Proof: test fails without the fix

### Task p15-t07: Batch memory budget (64 MiB retained; BATCH_TOO_LARGE)

**Status:** completed
**Commit:** acaaba8
**Executor:** phase-implementer:wce-p15-impl-1
CodeRabbit: review body staging.ts 188-194
Proof: test fails without the fix

### Task p15-t08: MCP fingerprint distinguishes subset generations

**Status:** completed
**Commit:** 2192923
**Executor:** phase-implementer:wce-p15-impl-1
CodeRabbit: 4506078314
Proof: test fails without the fix

### Task p15-t09: Test: in-flight tool call across a subset change returns unavailable

**Status:** completed
**Commit:** 0893b52
**Executor:** phase-implementer:wce-p15-impl-1
CodeRabbit: review body server.test.ts 340-358
Proof: test fails without the fix

### Task p15-t10: mcp --info lists search_messages

**Status:** completed
**Commit:** 389d1f7
**Executor:** phase-implementer:wce-p15-impl-1
CodeRabbit: 4506078319
Proof: test fails without the fix

### Task p15-t11: get_stats refreshes cached messages counts

**Status:** completed
**Commit:** 60c3554
**Executor:** phase-implementer:wce-p15-impl-1
CodeRabbit: 4506078322
Proof: test fails without the fix

### Task p15-t12: get_stats date range includes message dates

**Status:** completed
**Commit:** 31becc5
**Executor:** phase-implementer:wce-p15-impl-1
CodeRabbit: 4506074793
Proof: test fails without the fix

### Task p15-t13: analyze reports stats range spans counted messages

**Status:** completed
**Commit:** 616db41
**Executor:** phase-implementer:wce-p15-impl-1
CodeRabbit: 4506078286
Proof: test fails without the fix

### Task p15-t14: Date-only until through end of UTC day (search_messages, date-filtered get_stats)

**Status:** completed
**Commit:** 8babe83
**Executor:** phase-implementer:wce-p15-impl-1
CodeRabbit: 4506078324
Proof: test fails without the fix

### Task p15-t15: search_messages size bound and cursor pagination

**Status:** completed
**Commit:** 59b3209
**Executor:** phase-implementer:wce-p15-impl-1
CodeRabbit: review body search-messages.ts 137-142
Proof: test fails without the fix

### Task p15-t16: (review L1) get_stats unavailable during an import in every mode (docs, CHANGELOG)

**Status:** completed
**Commit:** 5a0fa2e
**Executor:** phase-implementer:wce-p15-impl-1
Proof: 660 tests; DoD batch green

### Task p15-t17: (review L2) cursors bound to tool and filter hash; foreign cursors refused (`pagination.ts`)

**Status:** completed
**Commit:** c4db129
**Executor:** phase-implementer:wce-p15-impl-1
Proof: 660 tests; DoD batch green

### Task p15-t18: (review L3) parseUntilDate trims and builds date-only values in UTC; refuses ambiguous dates

**Status:** completed
**Commit:** 847262c
**Executor:** phase-implementer:wce-p15-impl-1
Proof: 660 tests; DoD batch green

### Task p15-t19: (review L4) detect-projects and detect-themes follow nextCursor

**Status:** completed
**Commit:** 6f5de39
**Executor:** phase-implementer:wce-p15-impl-1
Proof: 660 tests; DoD batch green

### Task p15-t20: (review L5) document the Enterprise Grid sibling-host limitation

**Status:** completed
**Commit:** 49b6dc3
**Executor:** phase-implementer:wce-p15-impl-1
Proof: 660 tests; DoD batch green

---

## Phase p16: Config, CLI and skill review follow-ups

**Status:** completed
**Base:** 49b6dc355dec62fec1ad89419c01a9631859faa2
**Executor:** phase-implementer:wce-p16-impl-1
**Head:** b00981489409bf782ed49e56fade418903fa1a1c

Branch `oat/evidence-expansion-m03`. Committing owner: the phase implementer (code); root owns the journal. Task class: consequential (shell-safety in skill text; config rewrites).

Restart note: the first dispatch was interrupted by the user mid-run; it left uncommitted edits for t01 (`--reason-file`), which the restarted implementer reviewed, kept and committed. No duplicate work.

Verification at Head: implementer ran the full DoD batch (686 tests, 42 files; build). Root re-ran typecheck, lint, format:check and tests at Head: pass (686).

Decisions (implementer): reason passing: `slack channels add --reason-file <path>` (`-` = stdin), exactly one of `--reason`/`--reason-file`; the skill uses a quoted here-document `<<'WC_REASON'`; a test runs the skill's command block through `/bin/sh`. User change: `slack configure` refuses a different user while the subject's work log holds Slack messages by another author (or cannot be checked), naming `messages/slack` to remove; the skill never removes it. JSON: every `slack` subcommand prints only `{ok:false,error}` on stdout under `--json`.

Deviations: t02 fixed in all four writing skills sharing the paragraph; t07 also validates `--exclude-impact` and refuses `10abc`/`-5` for `--min-loc`; t05 adds an exact-mode `ImportFs.writeFile` option used only by the config rewrite (keeps umask behavior if chmod is unsupported). Accepted concerns: CHANGELOG wording for t08 is awkward and entry order is newest first (fold at p11); editing `slack.user` by hand bypasses the guard.

### Task p16-t01: Pass the channel reason on stdin (`--reason-file -`), never through the shell

**Status:** completed
**Commit:** e978c98
**Executor:** phase-implementer:wce-p16-impl-1
CodeRabbit: 4506074725 (Major)
Proof: test fails without the fix (docs/skill-only items: reviewed against the CLI)

### Task p16-t02: Read the full record when a search_messages result is cut (four writing skills)

**Status:** completed
**Commit:** 43b590d
**Executor:** phase-implementer:wce-p16-impl-1
CodeRabbit: 4506074731
Proof: test fails without the fix (docs/skill-only items: reviewed against the CLI)

### Task p16-t03: commands.md: destination follows the record identity

**Status:** completed
**Commit:** 86908f8
**Executor:** phase-implementer:wce-p16-impl-1
CodeRabbit: 4506074734
Proof: test fails without the fix (docs/skill-only items: reviewed against the CLI)

### Task p16-t04: filter matches bare and org/repo repository names

**Status:** completed
**Commit:** 46422c8
**Executor:** phase-implementer:wce-p16-impl-1
CodeRabbit: 4506074746
Proof: test fails without the fix (docs/skill-only items: reviewed against the CLI)

### Task p16-t05: Config rewrite keeps the original file mode

**Status:** completed
**Commit:** 90d3e03
**Executor:** phase-implementer:wce-p16-impl-1
CodeRabbit: 4506074787
Proof: test fails without the fix (docs/skill-only items: reviewed against the CLI)

### Task p16-t06: Refuse a config over MAX_CONFIG_BYTES before writing

**Status:** completed
**Commit:** 1609035
**Executor:** phase-implementer:wce-p16-impl-1
CodeRabbit: 4506078292
Proof: test fails without the fix (docs/skill-only items: reviewed against the CLI)

### Task p16-t07: filter refuses invalid --min-impact/--exclude-impact/--min-loc

**Status:** completed
**Commit:** 97b2d00
**Executor:** phase-implementer:wce-p16-impl-1
CodeRabbit: 4506078288
Proof: test fails without the fix (docs/skill-only items: reviewed against the CLI)

### Task p16-t08: slack --json reports subject-resolution and config-load failures as JSON

**Status:** completed
**Commit:** 3f7dd45
**Executor:** phase-implementer:wce-p16-impl-1
CodeRabbit: review body slack.utils.ts 174-176
Proof: test fails without the fix (docs/skill-only items: reviewed against the CLI)

### Task p16-t09: slack configure refuses another user while the previous user's messages are imported

**Status:** completed
**Commit:** 2b4206a
**Executor:** phase-implementer:wce-p16-impl-1
CodeRabbit: review body slack-config.ts 188-205
Proof: test fails without the fix (docs/skill-only items: reviewed against the CLI)

### Task p16-t10: JSDoc on createInstallSubcommand

**Status:** completed
**Commit:** ba89d6b
**Executor:** phase-implementer:wce-p16-impl-1
CodeRabbit: review body install.ts 313-315
Proof: test fails without the fix (docs/skill-only items: reviewed against the CLI)

### Task p16-t11: Tests import supporting modules through aliases

**Status:** completed
**Commit:** d9f9242
**Executor:** phase-implementer:wce-p16-impl-1
CodeRabbit: review body nitpicks
Proof: test fails without the fix (docs/skill-only items: reviewed against the CLI)

### Task p16-t12: (review L1) setup-slack writes the reason to a temp file and passes --reason-file <path> (committed before the user deferred L1; kept: it removes the here-document)

**Status:** completed
**Commit:** 119a52c
**Executor:** phase-implementer:wce-p16-impl-1
Proof: 691 tests; DoD batch green

### Task p16-t13: (review L2) --reason-file reads at most 4 KiB, decodes UTF-8 strictly and stores the reason trimmed

**Status:** completed
**Commit:** b04e0f2
**Executor:** phase-implementer:wce-p16-impl-1
Proof: 691 tests; DoD batch green

### Task p16-t14: (confirmation L1) Judge a channel add by its JSON, not the block's exit status

**Status:** completed
**Commit:** b009814
**Executor:** root
Files: `.agents/skills/work-chronicler-setup-slack/SKILL.md`
Proof: slack suites 29/29; skill text matches the CLI

---

## Phase p09: Google Docs documents record and config

**Status:** completed
**Base:** b00981489409bf782ed49e56fade418903fa1a1c
**Executor:** phase-implementer:wce-p09-impl-1
**Head:** 7feab1884270735d1e45986dac577c0e0a543a59

Branch `oat/evidence-expansion-m03`. Committing owner: the phase implementer (code); root owns the journal. Task class: consequential (new record type and privacy-bearing import rules).

Verification at Head: implementer ran the full DoD batch (747 tests, 45 files; build; `npm pack --dry-run`). Root re-ran typecheck, lint, format:check and tests at Head: pass (747).

Settled (Known Unknown "gog" answered at re-alignment; field names here): settings `googleDocs: { account }` (lower-cased email) per IC profile and under `reports[]`; record `type: document`, `source: google-docs`, `documents/google-docs/<hash>.md`, `sourceAccount` = owner account, `sourceId` = Drive file ID, `occurredAt` = `updatedAt` = modified time, `document: { title, mimeType, createdAt, owners, driveId, truncated }`, attribution `unverified` with `authorId: null`. Excerpt cap `MAX_DOCUMENT_EXCERPT_BYTES` = 16 KiB, no uncapped mode. Range: `import`/`validate` `--since`/`--until` replace each bound, date-only = whole UTC day, timestamps need `Z` or an offset, result echoes `range`, malformed flag refused as `RANGE_INVALID`. MCP: `search_documents` (shared `pagination.ts`), `mentionedInDocuments` in `get_linked_work`, `documents` sections in stats and timeline.

Deviations (implementer, accepted by root): `get_projects`, project detection and `analyze team` label Docs as not included (Outcome 4 allows include-or-label); the timeline includes them. `google-docs` reuses the Slack subject resolver. `search_messages` keeps a `slack`-only source list (`MESSAGE_SOURCES`), golden schema unchanged.

Not built (speculative, deferred under the AGENTS.md rule): `truncated` consistency check; CLI refusal of empty-body Docs (p10 skill skips them); stale-timeline note; `source` filter on `search_documents`; Docs in `analyze team`. Concerns: `stats.json` `byMonth` uses local time (pre-existing); `get_timeline` `since`/`until` compare period starts (pre-existing); manager discovery synthetic-only until p10.

### Task p09-t01: Google Docs document record and its import rules

**Status:** completed
**Commit:** 4fbbeb9
**Executor:** phase-implementer:wce-p09-impl-1
Proof: phase suites; DoD batch green

### Task p09-t02: Check Docs against the profile range in import and validate (`--since`/`--until`)

**Status:** completed
**Commit:** e3f3142
**Executor:** phase-implementer:wce-p09-impl-1
Proof: phase suites; DoD batch green

### Task p09-t03: google-docs configure and show

**Status:** completed
**Commit:** bd359cf
**Executor:** phase-implementer:wce-p09-impl-1
Proof: phase suites; DoD batch green

### Task p09-t04: Count imported Docs in filter, status, stats and the timeline

**Status:** completed
**Commit:** 6269abe
**Executor:** phase-implementer:wce-p09-impl-1
Proof: phase suites; DoD batch green

### Task p09-t05: Serve imported Docs over MCP with search_documents

**Status:** completed
**Commit:** c04efdf
**Executor:** phase-implementer:wce-p09-impl-1
Proof: phase suites; DoD batch green

### Task p09-t06: Writing and detection skills use imported Google Docs

**Status:** completed
**Commit:** cb4df5e
**Executor:** phase-implementer:wce-p09-impl-1
Proof: phase suites; DoD batch green

### Task p09-t07: Docs, AGENTS.md, CHANGELOG, README, example config

**Status:** completed
**Commit:** 07d23de
**Executor:** phase-implementer:wce-p09-impl-1
Proof: phase suites; DoD batch green

### Task p09-t08: (review H1) Manager skills handle imported Google Docs; timeline wording corrected

**Status:** completed
**Commit:** f5c4518
**Executor:** phase-implementer:wce-p09-impl-1
Proof: 747 tests; DoD batch green; pack 142 files

### Task p09-t09: (review L1) One date-only parser shared by import and MCP

**Status:** completed
**Commit:** 7feab18
**Executor:** phase-implementer:wce-p09-impl-1
Proof: 747 tests; DoD batch green; pack 142 files

---

## Phase p10: Google Docs import skill and live walkthrough

**Status:** in_progress
**Base:** 7feab1884270735d1e45986dac577c0e0a543a59
**Executor:** phase-implementer:wce-p10-impl-1
**Head:** a8ac78eaa6886bab7fa3ecb53740301dbfc7e2b9

Branch `oat/evidence-expansion-m03`. Committing owner: the phase implementer (code); root owns the journal and runs the live walkthrough (the user's own Drive via `gog --readonly`, temp `WORK_CHRONICLER_HOME`, redacted counts only). Task class: consequential (privacy of the user's documents).

Live walkthrough (root, 2026-11-08, read-only): `gog --readonly --no-input` v0.47.1 against the user's own Drive (IC, `--account` = the configured account), CLI in a throwaway `HOME` and `WORK_CHRONICLER_HOME`, range since 2026-01-01, following the skill's steps 1–10 with a script. Redacted results: listing complete (3 pages); listed 227; skipped 0 (not a Doc 0, shared drive 0, no owner 0, not owned 0, out of range 0, unreadable 0); empty 4; staged 223, truncated 21. First `validate` refused the batch (`SCHEMA_INVALID` on `mentions.tickets.0`: a picked-up key with a leading zero; gap 1). With keys in the schema's form: `validate` ok; `import` created 223; rerun of the same chunk unchanged 223; `link` exit 0. Scratch directories removed (pass). Confirmed: global flags before the subcommand; `drive search` JSON `{count, files, has_more, nextPageToken}`; `trashed = false` and `<` accepted; paging works; all `webViewLink`s in the accepted form. Gaps sent back to the implementer: (1) state the exact ticket-key form; (2) `drive get --json` nests fields under `file`; (3) plain `docs cat` prints no markers and no cut note, so truncation is by byte length. Manager discovery remains synthetic-only (not live-verified).

Implementer rule breach (reported by the implementer): one run of `tsx src/cli/index.ts skills install --help` with the real HOME loaded `~/.work-chronicler/profiles/default/.env` into that process; help text only, nothing written, no values shown. Later runs used temp homes.

### Task p10-t01: work-chronicler-import-google-docs skill

**Status:** completed
**Commit:** 75546a8
**Executor:** phase-implementer:wce-p10-impl-1
Files: `.agents/skills/work-chronicler-import-google-docs/SKILL.md`
Proof: the example record validates

### Task p10-t02: Synthetic acceptance test (IC, configured report, unconfigured report)

**Status:** completed
**Commit:** bb2acc3
**Executor:** phase-implementer:wce-p10-impl-1
Files: `src/cli/commands/google-docs/google-docs-acceptance.test.ts`
Proof: 5/5, 60 s timeout

### Task p10-t03: Docs name the new skill

**Status:** completed
**Commit:** c8d810d
**Executor:** phase-implementer:wce-p10-impl-1
Files: `AGENTS.md`, `CHANGELOG.md`, `README.md`, `documentation/{available-skills,commands,manager-mode}.md`
Proof: `skills install` lists 13 skills; `npm pack --dry-run` 143 files

### Task p10-t04: (walkthrough gap 1) Exact ticket-key form in step 8

**Status:** completed
**Commit:** 03124ff
**Executor:** phase-implementer:wce-p10-impl-1
Proof: 752 tests; DoD batch green

### Task p10-t05: (walkthrough gap 2) drive get nests fields under `file`

**Status:** completed
**Commit:** 5f09308
**Executor:** phase-implementer:wce-p10-impl-1
Proof: 752 tests; DoD batch green

### Task p10-t06: (walkthrough gap 3) No markers in plain docs cat; cap by byte length; never --wrap-untrusted

**Status:** completed
**Commit:** a8ac78e
**Executor:** phase-implementer:wce-p10-impl-1
Proof: 752 tests; DoD batch green

---

## Phase p11: 0.7.0 release preparation

**Status:** pending

---

## Orchestration Runs

<!-- One line per dispatch request id, rendered by `oat project dispatch record --format line` and written as a list item. Update that line in place with the terminal outcome; never paste the record or event JSON. -->

<!-- orchestration-runs-start -->

- Root-inline phase: p08 (fix p08-t13) — test-only timeout for two CLI-running suites after a CI timeout; root model claude-opus-5-5

run/v1 · request=wce-p13-impl-1 · scope=p13 · action=implementation · role=oat-phase-implementer · target=oat-phase-implementer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p13 action=implementation role=implementer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-phase-implementer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

run/v1 · request=wce-p13-rev-1 · scope=p13 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p13 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

run/v1 · request=wce-p13-rev-2 · scope=p13 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p13 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

run/v1 · request=wce-p14-impl-1 · scope=p14 · action=implementation · role=oat-phase-implementer · target=oat-phase-implementer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p14 action=implementation role=implementer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-phase-implementer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

run/v1 · request=wce-p14-rev-1 · scope=p14 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p14 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- Root-inline phase: p14 review L1 (PathGuard destination separator) fixed by root (claude-opus-5-5) in p14-t05 c785bc5; one-line Low, no dispatch needed.
  run/v1 · request=wce-p15-impl-1 · scope=p15 · action=implementation · role=oat-phase-implementer · target=oat-phase-implementer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p15 action=implementation role=implementer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-phase-implementer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~
  run/v1 · request=wce-p15-rev-1 · scope=p15 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p15 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~
  run/v1 · request=wce-p15-rev-2 · scope=p15 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p15 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~
  run/v1 · request=wce-p16-impl-1 · scope=p16 · action=implementation · role=oat-phase-implementer · target=oat-phase-implementer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p16 action=implementation role=implementer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-phase-implementer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~
- Root-inline phase: m03 AGENTS.md rule "Get buy-in before speculative complexity" added by root (claude-opus-5-5) at the user's request in 5c1f224; docs only, outside any phase.
  run/v1 · request=wce-p16-rev-1 · scope=p16 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p16 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~
  run/v1 · request=wce-p16-rev-2 · scope=p16 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p16 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~
- Root-inline phase: p16 confirmation-review L1 (skill block exits 0 on refusal) fixed by root (claude-opus-5-5) in p16-t14 b009814; skill text only.
  run/v1 · request=wce-p09-impl-1 · scope=p09 · action=implementation · role=oat-phase-implementer · target=oat-phase-implementer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p09 action=implementation role=implementer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-phase-implementer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~
  run/v1 · request=wce-p09-rev-1 · scope=p09 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p09 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~
  run/v1 · request=wce-p09-rev-2 · scope=p09 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p09 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~
  run/v1 · request=wce-p10-impl-1 · scope=p10 · action=implementation · role=oat-phase-implementer · target=oat-phase-implementer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p10 action=implementation role=implementer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-phase-implementer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~
- run/v1 · request=wce-p08-rev-1 · scope=p08 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p08 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- Root-inline phase: p08 — inline exception for a version bump and CHANGELOG move; root model claude-opus-5-5

- run/v1 · request=wce-p12-rev-2 · scope=p12 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p12 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- Root-inline phase: p12 (fix p12-t06) — one Low docs finding from review round 2; root model claude-opus-5-5

- run/v1 · request=wce-p12-rev-1 · scope=p12 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p12 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- run/v1 · request=wce-p12-impl-1 · scope=p12 · action=implementation · role=oat-phase-implementer · target=oat-phase-implementer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p12 action=implementation role=implementer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-phase-implementer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- run/v1 · request=wce-p07-rev-2 · scope=p07 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p07 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- Root-inline phase: p07 (fix p07-t13) — two Low markup-rule findings from review round 2; root model claude-opus-5-5

- run/v1 · request=wce-p07-rev-1 · scope=p07 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p07 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- run/v1 · request=wce-p07-impl-1 · scope=p07 · action=implementation · role=oat-phase-implementer · target=oat-phase-implementer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p07 action=implementation role=implementer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-phase-implementer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- Root-inline phase: p07 (fix p07-t09) — two skill-text corrections observed in the live walkthrough; root model claude-opus-5-5

- run/v1 · request=wce-p06-rev-2 · scope=p06 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p06 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- run/v1 · request=wce-p06-rev-1 · scope=p06 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p06 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- run/v1 · request=wce-p06-impl-1 · scope=p06 · action=implementation · role=oat-phase-implementer · target=oat-phase-implementer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p06 action=implementation role=implementer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-phase-implementer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- run/v1 · request=wce-p05-rev-3 · scope=p05 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p05 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- Root-inline phase: p05 (fix p05-t16) — two Low takeover-message findings from review round 3 after the fix-loop bound; root model claude-opus-5-5

- run/v1 · request=wce-p05-rev-2 · scope=p05 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p05 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- run/v1 · request=wce-p05-rev-1 · scope=p05 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p05 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- run/v1 · request=wce-p05-impl-1 · scope=p05 · action=implementation · role=oat-phase-implementer · target=oat-phase-implementer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p05 action=implementation role=implementer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-phase-implementer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- run/v1 · request=wce-p04-rev-2 · scope=p04 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p04 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- Root-inline phase: p04 (fix p04-t09) — two Low wording findings from review round 2; root model claude-opus-5-5

- run/v1 · request=wce-p04-rev-1 · scope=p04 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p04 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- run/v1 · request=wce-p04-impl-1 · scope=p04 · action=implementation · role=oat-phase-implementer · target=oat-phase-implementer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p04 action=implementation role=implementer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-phase-implementer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- run/v1 · request=wce-p01-impl-1 · scope=p01 · action=implementation · role=oat-phase-implementer · target=oat-phase-implementer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p01 action=implementation role=implementer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-phase-implementer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- run/v1 · request=wce-p01-rev-1 · scope=p01 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p01 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- run/v1 · request=wce-p02-rev-1 · scope=p02 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p02 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- Root-inline phase: p03 — inline exception for a version bump and CHANGELOG move; root model claude-opus-5-5

- Root-inline phase: p03 (fix p03-t10) — one small skill-text finding from exit gate attempt 4; root model claude-opus-5-5

- Root-inline phase: p03 (fix p03-t15) — two High integrated-review findings and three PR comments in the same migration code, small and bounded; root model claude-opus-5-5

- Root-inline phase: p03 (fix p03-t14) — one High integrated-review finding (unreadable tool skills directory), small and bounded; root model claude-opus-5-5

- Root-inline phase: p03 (fix p03-t13) — one High gate finding (permission errors in the nested-link walk), small and bounded; root model claude-opus-5-5

- Root-inline phase: p03 (fix p03-t12) — one High gate finding (nested resource links), small and bounded; root model claude-opus-5-5

- Root-inline phase: p03 (fix p03-t11) — five small PR #25 review findings (CodeRabbit), fixed in root per the host's small-fix rule; root model claude-opus-5-5

- Root-inline phase: p03 (fix p03-t09) — two small skill-text/README findings from the m01 integrated review, fixed in root per the host's small-fix rule; root model claude-opus-5-5

- run/v1 · request=wce-p03-rev-1 · scope=p03 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p03 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- run/v1 · request=wce-p03-fix-1 · scope=p03 · action=fix · role=oat-phase-implementer · target=oat-phase-implementer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p03 action=fix role=fix producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-phase-implementer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- Continuation: wce-p03-fix-1 resumed for gate attempt-2 findings (p03-t07, p03-t08); terminal outcome completed; implementer commit identities used `wce-p03-fix-2`.

<!-- orchestration-runs-end -->

## Reviews and Gates

<!-- Receipts for final, milestone and multi-phase reviews (a phase review receipt may stay in its phase) and one terminal line per gate run. state.md owns gate transitions; this slot keeps the outcome, waivers and operator choices. -->

### Review Received: final (m01 exit gate, attempt 1)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/final-review-2026-11-08T001944Z.md

**Findings:** Critical 0 · High 2 · Medium 2 · Low 0 (gate `codex-6-sol-xhigh`, verdict blocked, run 1ff92794-0065-452b-8b7f-52d57f0b8828)

- H1 (High): migration can delete the old directory a verified replacement symlink depends on → fix task p03-t03; agree, reproduced by reviewer with the built CLI.
- H2 (High): owner-lookup rate limit becomes an empty successful review fetch → fix task p03-t05; agree, breaks the fatal rate-limit contract.
- M1 (Medium): no-overwrite path deletes a regular-file conflict → fix task p03-t04; agree, data loss without consent.
- M2 (Medium): stored review records reused across reviewer identities → fix task p03-t06; agree, misattribution.

**Outcome:** fixes queued: p03-t03, p03-t04, p03-t05, p03-t06 (late-fix rule: reviewed phase p03 is the last phase and no later phase has a Base, so fixes land under p03 and advance its Head)

### Review Received: final (m01 exit gate, attempt 2)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/final-review-2026-11-08T003901Z.md

**Findings:** Critical 0 · High 1 · Medium 2 · Low 0 (gate `codex-6-sol-xhigh`, verdict blocked, run 635ed2b4-afb9-4199-8199-2d42911836f5, reviewed head 966fbd2dbeb1bc3761ac9052978791db5d906247)

- H1 (High): migration still deletes an old copy that an unselected tool's new-name link depends on → fix task p03-t07; agree.
- M1 (Medium): empty or no-candidate review fetches leave another reviewer's records visible as the user's work → fix task p03-t08; agree (supersedes the Low deferral recorded earlier, which is withdrawn).
- M2 (Medium, bookkeeping): the attempt-1 receipt sat under p03 → fixed at receive: moved to this section unchanged.

**Outcome:** fixes queued: p03-t07, p03-t08. Gate attempts exhausted (2 of 2, onFailure block): milestone exit carrier recorded `blocked`; a further gate run needs operator direction.

### Review Received: final (m01 exit gate, attempt 3)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/final-review-2026-11-08T014902Z.md

**Findings:** Critical 0 · High 0 · Medium 0 · Low 0 (gate `codex-6-sol-xhigh`, verdict passed, run 0a49aa40-a190-41ad-97a9-2a4260b56267, reviewed head fcb2a87994ef8ef608427ca5fdb0eb849382f969, narrowed range 966fbd2d..fcb2a87)

**Operator choice:** the third gate run was directed by the user in session after attempts 1–2 exhausted `maxAttempts`.

**Outcome:** passed. No deferred Medium findings to resurface; no Low findings to disposition. m01 exit carrier recorded `allowed`/`passed`.

### Review Received: m01 (integrated delivery review)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/m01-review-2026-11-08T015940Z.md

**Findings:** Critical 0 · High 0 · Medium 1 · Low 1 (cross-provider reviewer codex gpt-6.1-sol high via delegated task, scope `code m01: p01, p02, p03`, reviewed head fcb2a87994ef8ef608427ca5fdb0eb849382f969)

- M1 (Medium): four writing skills attribute raw review records to the user without checking `reviewer` → fix task p03-t09; agree, `filter` copies foreign records and the skills read raw files.
- L1 (Low): README says seven skills work with any profile → fixed in p03-t09; agree, cheap and user-facing.

**Outcome:** fixes completed in p03-t09 (5cfd2b75d24d416b85bb41fa256453a5923768c5). The exit gate must run again on the new head, then a fresh integrated review.

### Review Received: final (m01 exit gate, attempt 4, after integrated-review fixes)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/final-review-2026-11-08T020915Z.md

**Findings:** Critical 0 · High 0 · Medium 1 · Low 0 (gate `codex-6-sol-xhigh`, verdict passed at threshold high, run 318433e7-ef4a-428a-b871-e4f6a4b5723c, reviewed head 5cfd2b75d24d416b85bb41fa256453a5923768c5)

- M1 (Medium): skills compare the raw configured username, so `@BoB` or padded handles hide the user's own reviews → fix task p03-t10; agree.

**Outcome:** gate passed; M1 fixed in p03-t10 (ed8b20df93efb15f5dbdeee10733453e7cd52f0d). Exit carrier recorded allowed at 5cfd2b75d24d416b85bb41fa256453a5923768c5, now stale; gate runs again.

### Review Received: final (m01 exit gate, attempt 5)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/final-review-2026-11-08T021601Z.md

**Findings:** Critical 0 · High 0 · Medium 0 · Low 0 (gate `codex-6-sol-xhigh`, verdict passed, run 5e425d5b-5900-4eeb-a861-1cb47dbe20bc, reviewed head ed8b20df93efb15f5dbdeee10733453e7cd52f0d)

**Outcome:** passed. Exit carrier allowed/fresh at ed8b20df93efb15f5dbdeee10733453e7cd52f0d; fresh integrated review next.

### Review Received: m01 (integrated delivery re-review)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/m01-review-2026-11-08T022438Z.md

**Findings:** Critical 0 · High 0 · Medium 0 · Low 0 (cross-provider reviewer codex gpt-6.1-sol high via delegated task, scope `code m01: p01, p02, p03`, reviewed head ed8b20df93efb15f5dbdeee10733453e7cd52f0d; fix delta fcb2a87..ed8b20d reviewed directly, other coverage inherited from the prior integrated review)

**Outcome:** passed. No deferred Medium findings; no Low findings. m01 → delivering.

### Delivery: m01 → d01

**PR:** https://github.com/tkstang/work-chronicler/pull/25 (scope `m01: p01, p02, p03`, registered 2026-11-08, endpoint `merged`)

### Review Received: p01-p03 (m01 recovery exit gate, attempt 6)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/range-review-2026-11-08T034405Z.md

**Findings:** Critical 0 · High 1 · Medium 0 · Low 0 (gate `codex-6-sol-xhigh`, run 7dd09387-1a70-4582-9b59-e49aba1b55d1, reviewed head 27f398fd461d57ec0cee3e295d5ed65c9f0e9763)

- H1 (High): the migration dependency check ignores nested resource symlinks, so a kept skill's `scripts/` link into the old copy is broken by its deletion (reproduced). This was deferred from CodeRabbit 4504866395; the reproduced data loss overrides that deferral → fix task p03-t12; agree.

**Outcome:** H1 fixed in p03-t12 (0e90c256429242e8dc2d7957dd7840105045b9ee). Gate runs again.

### Review Received: p01-p03 (m01 recovery exit gate, attempt 7)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/range-review-2026-11-08T035400Z.md

**Findings:** Critical 0 · High 1 · Medium 0 · Low 0 (gate `codex-6-sol-xhigh`, run 9e89f9e5-f84f-4d6c-a936-ebc9ab149c3f, reviewed head 0e90c256429242e8dc2d7957dd7840105045b9ee)

- H1 (High): the nested-link walk treats a permission error as a dangling link, so a dependency behind an unreadable directory is missed and the old copy is deleted (reproduced) → fix task p03-t13; agree.

**Outcome:** H1 fixed in p03-t13 (aa1da62cea9621cebedd98cd18852853f7965567). Gate runs again (attempt 8, beyond the configured budget under the user's standing direction to keep running the gate).

### Review Received: p01-p03 (m01 recovery exit gate, attempt 8)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/range-review-2026-11-08T040057Z.md

**Findings:** Critical 0 · High 0 · Medium 0 · Low 0 (gate `codex-6-sol-xhigh`, run 52e01ff1-0c64-4f1d-ade8-93a101a80d06, reviewed head aa1da62cea9621cebedd98cd18852853f7965567)

**Outcome:** passed. Exit carrier allowed/fresh at aa1da62cea9621cebedd98cd18852853f7965567 (2026-11-08T04:04:35Z); recovery stage → reviewing (fresh integrated review next).

### Review Received: m01 (integrated delivery re-review at aa1da62)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/m01-review-2026-11-08T040821Z.md

**Findings:** Critical 0 · High 1 · Medium 0 · Low 0 (cross-provider reviewer codex gpt-6.1-sol high via delegated task, scope `code m01: p01, p02, p03`, reviewed head aa1da62cea9621cebedd98cd18852853f7965567)

- H1 (High): an unreadable tool skills directory is skipped as if absent, so a dependent skill behind it is missed and the old copy deleted (reproduced; present since ed8b20d) → fix task p03-t14; agree.

**Outcome:** H1 fixed in p03-t14 (b7a300e0259cfc2a3df8d48de8dd1bbb50c641d8). Exit carrier stale again; recovery stage → exit_gate (gate attempt 9), then a fresh integrated review.

### Review Received: p01-p03 (m01 recovery exit gate, attempt 9)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/range-review-2026-11-08T041806Z.md

**Findings:** Critical 0 · High 0 · Medium 0 · Low 0 (gate `codex-6-sol-xhigh`, run 17e244e5-ecea-4a24-b8b5-d6a4096e38d4, reviewed head b7a300e0259cfc2a3df8d48de8dd1bbb50c641d8)

**Outcome:** passed. Exit carrier allowed/fresh at b7a300e0259cfc2a3df8d48de8dd1bbb50c641d8 (2026-11-08T04:19:51Z); recovery stage → reviewing.

### Review Received: m01 (integrated delivery re-review at b7a300e)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/m01-review-2026-11-08T042422Z.md

**Findings:** Critical 0 · High 2 · Medium 0 · Low 0 (cross-provider reviewer codex gpt-6.1-sol high via delegated task, scope `code m01: p01, p02, p03`, reviewed head b7a300e0259cfc2a3df8d48de8dd1bbb50c641d8, with a requested adversarial pass over the old-skill removal decision)

- H1 (High): a nested link through a differently cased old-name path on a case-insensitive volume evades the text comparison and the old copy is deleted (also CodeRabbit 4505014158) → p03-t15; agree.
- H2 (High): POSIX paths were split on backslashes, so a link through a directory whose name contains one is not traced and the old copy is deleted → p03-t15; agree.

Also in p03-t15: CodeRabbit 4505014153 (docs/notice wrongly said `--overwrite` fixes custom skills) and 4505014156 (USERPROFILE in tests).

**Outcome:** fixed in p03-t15 (b079cd77e9306bdc2a179660a6536afba12f0847). Recovery stage → exit_gate (gate attempt 10), then a fresh integrated review.

### Review Received: p01-p03 (m01 recovery exit gate, attempt 10)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/range-review-2026-11-08T043358Z.md

**Findings:** Critical 0 · High 0 · Medium 0 · Low 0 (gate `codex-6-sol-xhigh`, run 997add76-1ecd-46a6-9b3c-51ca0cfe4cfd, reviewed head b079cd77e9306bdc2a179660a6536afba12f0847)

**Outcome:** passed. Exit carrier allowed/fresh at b079cd77e9306bdc2a179660a6536afba12f0847 (2026-11-08T04:37:35Z); recovery stage → reviewing.

### Review Received: m01 (integrated delivery re-review at b079cd7)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/m01-review-2026-11-08T044332Z.md

**Findings:** Critical 0 · High 0 · Medium 0 · Low 0 (cross-provider reviewer codex gpt-6.1-sol high via delegated task, scope `code m01: p01, p02, p03`, reviewed head b079cd77e9306bdc2a179660a6536afba12f0847, with an adversarial pass over the old-skill removal decision)

**Outcome:** passed. Recovery stage → delivering; d01 evidence rebound to b079cd7.

### Review Received: final (m02 exit gate, attempt 1)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/final-review-2026-11-08T092006Z.md

**Findings:** Critical 0 · High 2 · Medium 1 · Low 0 (gate `codex-6-sol-xhigh`, run 22b09426-1d0c-4598-b66d-691b734076d6, reviewed head a30a11836b7fce248cefc50d4ba3b4c8c593db0e, scope p01–p08 per state)

- H1 (High): import rollback removes planned directories without checking ancestors, so a directory swapped for a symlink mid-commit lets cleanup delete outside the work log (`src/core/import/transaction.ts:646`) → fix; agree.
- H2 (High): recovery reads and renames backup files through a symlinked `backup/` ancestor (`transaction.ts:603`) → fix; agree.
- M1 (Medium): a running MCP server keeps the directory captured at startup, so a subset selected later is bypassed (`src/mcp/tools/search-messages.ts:98`, `server.ts:120`) → fix; agree.

**Outcome:** H1, H2 fixed in p08-t03..t04 (9b9cb42); M1 fixed in p08-t05 (ce90018). Gate runs again (attempt 2).

### Review Received: final (m02 exit gate, attempt 2)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/final-review-2026-11-08T094553Z.md

**Findings:** Critical 0 · High 1 · Medium 0 · Low 0 (gate `codex-6-sol-xhigh`, run ae60ddb1-c8ee-49c4-86e1-cf5e5c3f8a64, reviewed head ce900184bb444954f45978a233c4478ffac09694)

- H1 (High): import preparation creates nested staged directories without re-checking the recorded intermediate parent (`src/core/import/transaction.ts:1197`); a parent swapped for a symlink lets it create an empty directory outside the work log before the batch is rejected. Introduced by the attempt-1 fix (p08-t03) → fix; agree.

**Outcome:** fix dispatched. Attempt 2 reaches the configured gate budget; the gate runs again under the user's standing direction to keep running it (as in m01).

### Review Received: final (m02 exit gate, attempt 3)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/final-review-2026-11-08T100413Z.md

**Findings:** Critical 0 · High 0 · Medium 0 · Low 0 (gate `codex-6-sol-xhigh`, run 92eebac3-d390-4418-8432-f515e7103367, reviewed head 890358f95e9adde796635336ae741de206fc0e2d)

**Outcome:** passed. m02 exit carrier allowed/fresh at 890358f95e9adde796635336ae741de206fc0e2d (2026-11-08T10:09:12Z); m02 → reviewing (integrated review next).

### Review Received: m02 (integrated delivery review)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/m02-review-2026-11-08T101759Z.md

**Findings:** Critical 0 · High 1 · Medium 0 · Low 0 (cross-provider reviewer codex gpt-6.1-sol high via delegated task, scope `code m02: p04, p05, p06, p07, p12, p08`, reviewed head 890358f95e9adde796635336ae741de206fc0e2d)

- H1 (High): stale import-lock takeover can admit two live importers (`src/core/import/transaction.ts:503`; demonstrated three-contender schedule) → fix by moving import and filter onto one shared, already-reviewed lock helper (the p05 filter lock serializes stale takeover); agree.

**Outcome:** fix dispatched; m02 recovery → exit_gate after the fix (exit carrier stales), then a fresh integrated review.

### Review Received: p04-p08 (m02 recovery exit gate, attempt 4)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/range-review-2026-11-08T103910Z.md

**Findings:** Critical 0 · High 1 · Medium 2 · Low 0 (gate `codex-6-sol-xhigh`, run 05afe7af-ae18-440a-84e3-0234d6283a4b, reviewed head 1ad43f40604571e0cf3262d6f5c2e10d745fcf1d)

- H1 (High): a missing journal is always treated as interrupted preparation, so recovery discards the transaction (backups included) even when `applying/` markers show records were applied, reporting success over a half-updated batch (`src/core/import/transaction.ts:961`) → fix; agree.
- M1 (Medium): `commitImportPlan` drops `unchanged` records from verification, so a planned-unchanged record deleted mid-import still yields `ok: true` (`transaction.ts:1175`) → fix; agree.
- M2 (Medium): after `filter` publishes the new subset, a leftover-enumeration error rejects and the CLI says the subset was not changed (`src/core/storage/filtered-subset.ts:678`) → fix; agree.

**Outcome:** fixes dispatched.

### Review Received: p04-p08 (m02 recovery exit gate, attempt 5)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/range-review-2026-11-08T105734Z.md

**Findings:** Critical 0 · High 0 · Medium 1 · Low 0 (gate `codex-6-sol-xhigh`, run dfe7f68b-82b1-4566-9880-65c7ab37ef4b, reviewed head 9548ee32b4b8b7595a6907bac00b9c18ff211b86)

- M1 (Medium): `filter --clear` reports success after a post-deselection listing failure even when a retained `.filter-previous-*` from an earlier warned replacement makes readers see an interrupted subset (`src/core/storage/filtered-subset.ts:778`); needs two injected faults. → explicit deferral (root, autonomous run): fixing now would stale the passed gate for a two-fault edge; follow-up trigger p09, which extends `filter` for `documents` (inventory restorable previous subsets under the lock before deselecting, refuse if the inventory fails).

**Outcome:** gate passed. m02 exit carrier allowed/fresh at 9548ee32b4b8b7595a6907bac00b9c18ff211b86 (2026-11-08T11:00:51Z); recovery stage → reviewing (fresh integrated review).

### Review Received: m02 (integrated delivery re-review)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/m02-review-2026-11-08T111220Z.md

**Findings:** Critical 0 · High 0 · Medium 0 · Low 0 (cross-provider reviewer codex gpt-6.1-sol high via delegated task, scope `code m02: p04, p05, p06, p07, p12, p08`, reviewed head 9548ee32b4b8b7595a6907bac00b9c18ff211b86; fix delta 890358f..9548ee3 reviewed directly; the p09-deferred Medium excluded)

**Outcome:** passed. m02 → delivering; d02 registering.

### Delivery: m02 → d02

**PR:** https://github.com/tkstang/work-chronicler/pull/26 (scope `m02: p04, p05, p06, p07, p12, p08`, registered 2026-11-08, endpoint `merged`)

### CI failure on d02 (PR #26)

**Date:** 2026-11-08 · ci run 42474884622: two CLI-running Slack tests timed out at 5 s on the runner (591 passed). Fixed in p08-t13 (test-only timeout). The commit stales the exit carrier and the integrated review (disallowed path under section 12.8); m02 → reviewing with recovery for d02 at `exit_gate`.

### Review Received: p04-p08 (m02 recovery exit gate, attempt 6)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/range-review-2026-11-08T112332Z.md

**Findings:** Critical 0 · High 0 · Medium 0 · Low 0 (gate `codex-6-sol-xhigh`, run ac90319d-fc12-4556-b8a9-51edfb01684f, reviewed head 6360304b9d261a54a8cdc1f46089ab7a6068a163)

**Outcome:** passed. m02 exit carrier allowed/fresh at 6360304b9d261a54a8cdc1f46089ab7a6068a163; d02 recovery → reviewing.

### PR review received: d02 (PR #26, CodeRabbit)

**Date:** 2026-11-08
**Findings:** 20 inline (3 Major, 17 Minor) and 25 in the review body (13 Minor, 5 nitpicks and the outside-diff list), reviewed at 6360304, plus an advisory docstring-coverage check (73% against an 80% threshold; not a merge condition). Disposition by root (autonomous run): none fixed in 0.6.0, so the passing exit gate and integrated review at 6360304 stay fresh. Still-valid candidates go to m03: reader/filter coordination, the lock clock check and filter cleanup order to p13; import, storage and MCP items to p15; installer, config, CLI and skill-text items (including the setup-slack reason quoting Major) to p16; each phase verifies before fixing. Post-goal: concurrent installers, parameter objects, workspace label to team ID reconciliation. Rejected: keeping self-quoted text in Slack bodies (quotes cannot be attributed reliably; dropped on purpose). Each comment has a reply naming its disposition.

**Outcome:** no code change after the reviewed head; d02 evidence stays fresh.

### Release: m02 → 0.6.0

**Merged:** https://github.com/tkstang/work-chronicler/pull/26 as b17cb235eb1fa268d234a4098a7e343a6ac9fc3a (squash, head 6360304b9d261a54a8cdc1f46089ab7a6068a163 matched), 2026-11-08
**Tag:** v0.6.0 on b17cb23
**Release run:** https://github.com/tkstang/work-chronicler/actions/runs/42477221644 (Publish to npm: success; Create GitHub Release: success; provenance signed)
**npm:** `npm view work-chronicler@0.6.0 version --prefer-online` → `0.6.0`; dist-tag latest → 0.6.0 (the cached `npm view` lagged a few minutes)
**GitHub Release:** https://github.com/tkstang/work-chronicler/releases/tag/v0.6.0 (notes written with /release-notes; a Known Issues entry covers the setup-slack reason quoting, fixed in p16)
**Delivery:** d02 at_endpoint (merged), endpoint attainment recorded by `oat project delivery refresh`.

### PR review received: d01 (PR #25, CodeRabbit)

**Date:** 2026-11-08
**Findings:** 20 Minor (19 comments), verified against ed8b20d by an independent Claude reviewer. Fixed 5 in p03-t11 (27f398f). Pre-existing on main: 5 (date-only `until` midnight, `filter` not clearing `filtered/`, full-log fallback with no matching PR, install delete-before-copy, cleanup abort). Rejected with reason: 3 (username-empty by design, truncation matches other tools, concurrent fetch into one dir unsupported). Deferred: the rest (see Deferred Findings). Each comment has a reply with its disposition.

**Outcome:** code changed after the reviewed head; exit carrier and integrated review are stale. m01 → reviewing (recovery stage `exit_gate`).

### Release: m01 → 0.5.0

**Merged:** https://github.com/tkstang/work-chronicler/pull/25 as 29fd72279976b9aa0f74d83ef488de353d379108 (squash, head b079cd77e9306bdc2a179660a6536afba12f0847 matched), 2026-11-08
**Tag:** v0.5.0 on 29fd722
**Release run:** https://github.com/tkstang/work-chronicler/actions/runs/42448224575 (Publish to npm: success; Create GitHub Release: success; provenance signed)
**npm:** `npm view work-chronicler@0.5.0 version` → `0.5.0`; dist-tag latest → 0.5.0
**GitHub Release:** https://github.com/tkstang/work-chronicler/releases/tag/v0.5.0 (notes written with /release-notes)
**Delivery:** d01 at_endpoint (merged), endpoint attainment recorded by `oat project delivery refresh`.

Known docs follow-up: the shipped CHANGELOG 0.5.0 entry still says `fetch --reviews` in one place (the CLI form is `fetch github --reviews`); correct it under Unreleased in m02.

## Deferred Findings

- Speculative under the AGENTS.md rule (p09 review, deferred by root; the user may pull any in): the Google Docs account-change guard ignores schema-invalid stored Docs; Docs-only weeks add zero-count weeks to `team-timeline.json`; `search_documents`/`search_messages` read a zoneless `since` timestamp in local time; `get_linked_work` Doc summaries omit `owner` and `sourceId`.

- Speculative under the AGENTS.md rule (p16 confirmation review, deferred by root; the user may pull either in): the temporary reason file in a shared `/tmp` could be pre-created or symlinked by another user on a multi-user host (a few lines of skill text and a test-helper change); a reason saved padded by 0.6.0 makes re-adding the same channel fail as "configured with other settings" (a trimmed comparison and one test).

- User decision (2026-11-08): all of p17 deferred post-goal (CodeRabbit 4506074753 verify the moved-aside entry before deleting it; 4506074768 never restore a committed replacement's backup after a failed rename; 4506074774 recover a case-differing backup), together with p16 L3 (and L1, already fixed in p16-t12). Note for L3 (implementer): locking `slack configure` alone would not close the race; `import` would also need to re-check the batch against the settings under its lock.

- User decision (2026-11-08): p16 review L1 (multi-line channel reason containing a `WC_REASON` line breaks the here-document) and L3 (user-change guard runs outside the work-log lock, so a concurrent import could slip past it) are speculative and deferred post-goal; only L2 (`--reason-file` size cap and UTF-8 refusal) is fixed. The user also had the foundations rule "Get buy-in before speculative complexity" added to AGENTS.md (5c1f224): from here on, speculative review findings go to the user with their cost instead of being fixed by default.

- m03 re-alignment disposition (2026-11-08, Astra-advised, artifact-reviewed): the `filter --clear` Medium (gate attempt 5, M1) and PR #26 complexity finding 4 (one lock for import and filter) move to p13; findings 1–3 and 6 (fixed-depth staging, one ancestor checker, shared fs seams, `stageAsTheSkillDoes`) move to p14, and the stale `transaction.ts` comment to p13; finding 5 (installer recovery) is a post-goal follow-up: non-blocking simplification of safety-sensitive code, not a known defect. The m01 post-goal list is unchanged; 4504862955 (date-only `until` is midnight UTC) is fixed in `search_messages` and date-filtered `get_stats` in p15 and for Docs in p09; it stays post-goal for PRs, tickets and review records (`search_prs`, `search_tickets`, `search_pr_reviews`).

- Non-blocking (PR #26 self-review, complexity lens, independent Claude reviewer at 9548ee3): (1) directory staging built for any depth although records only go to `messages/<source>/` — create the two known directories up front through the PathGuard; (2) ancestor checks repeated at several layers — make PathGuard the only checker; (3) `SubsetFs`/`SubsetEnv`, `LockEnv`, `errorCode`/`removeQuietly`/`codedError` duplicate `ImportFs`/`ImportEnv` helpers; (4) two lock names where one work-log lock could serialize import and filter (today `filter` can run during an `import`); (5) installer crash recovery could be simplified; (6) `stageAsTheSkillDoes` re-implements skill prose; stale header comment at `transaction.ts:34-36` (lock is now mkdir+rename). Deferred by root (autonomous run): changing code now would stale the running gate for cleanup only. Follow-up trigger: m03 re-alignment / p09 (`filter` rework for `documents`); (4) decide there whether import and filter should exclude each other.

- Medium (m02 exit gate attempt 5, M1): `filter --clear` can report success while a retained `.filter-previous-*` leaves readers blocked after a post-deselection listing failure (two injected faults). Deferred by root (autonomous run) to p09, which reworks `filter` for `documents`; fix by inventorying restorable previous subsets under the lock before deselecting and refusing if that fails.

- m02 re-alignment disposition (2026-11-08, Astra-advised): pulled into m02 — filter stale-subset replacement and empty-result marker (CodeRabbit 4504862967, 4504862986) and skills pointing at `search_pr_reviews`/`status` (complexity F1, F2) into p05; CHANGELOG `fetch --reviews` wording into p05; installer delete-before-copy and cleanup-failure handling (4504863000, 4504866388) into new p12, with 4504866386 (failure injection that does not rely on non-root chmod); p05 keeps the m01 attribution regression tests green (the reused-output-directory Low was superseded by p03-t08). All other m01 deferrals below are post-goal follow-ups (trigger: after m03): F3, F4, F5, 4504862946, 4504862950, 4504863012, 4504866382, 4504866392, 4504862955.

<!-- One line per approved deferral (finding, rationale, approval, follow-up trigger), plus excluded parallel phases and unmerged worktrees. -->

- ~~Low (from p03 fix report, M2 follow-on): review records left from a different reviewer in a reused output directory are still counted by `status`, `filter` and `search_pr_reviews` when the current user has no in-range entries to replace them. Deferred by root (autonomous run): edge case requiring a changed `github.username` with a reused work log; follow-up trigger: p05 consumer work, which revisits these consumers.~~ Withdrawn: superseded by p03-t08 (fetch refuses foreign records; status and search_pr_reviews exclude and disclose them).
- Withdrawn: the earlier Low deferral about leftover other-reviewer records is superseded by gate attempt-2 M1 (fix task p03-t08).
- Non-blocking (PR #25 self-review, complexity lens, independent Claude reviewer at ed8b20d): F1 the review-attribution rules are restated as prose in four writing skills (point them at `search_pr_reviews`/`status` instead); F2 the filtered-subset fallback (`fullOutputDir`) could be a note plus empty results; F3 the custom symlink resolver in `skills/migrate.ts` could become `realpath` containment plus one `readlink` hop; F4 `getReviewActivityDates` is an unused export; F5 `isVerifiedSkill` parses frontmatter by regex where `gray-matter` exists. Deferred by root (autonomous run): all non-blocking, and changing code after the clean exit gate and integrated review would stale both for cleanup only. Follow-up trigger: m02 re-alignment (p05 revisits these consumers); F3 needs care because it guards a data-loss path.

- Non-blocking (PR #25 CodeRabbit, deferred by root, autonomous run): comment edits outside the current range are not refreshed (4504862946); a record emptied by reconciliation is not deleted (4504862950); comments lose parent review state when the review falls outside the range (4504863012, needs a schema field); multi-argument helpers should take parameter objects (4504866382); the install-failure test relies on non-root chmod (4504866386); cleanup failure in `install` aborts the run (4504866388, pre-existing); migration plans removals per tool rather than after all tools (4504866392). Pre-existing, for all record types: date-only `until` is midnight UTC (4504862955); `filter` keeps stale `filtered/` content without `--clear` (4504862967); the subset is ignored when no authored PR matches (4504862986); `install --overwrite` deletes before copying (4504863000). Follow-up trigger: m02 re-alignment.

## Deviations from Plan / Design

Document any intentional deviations from the brief. Include accepted review findings where the shipped implementation is source of truth and the brief needs alignment.

| Phase / Review | Source Artifact                              | Planned / Documented                                            | Actual / Accepted                                         | Reason                                                                                                 | Source of Truth | Follow-up                   |
| -------------- | -------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------- | --------------------------- |
| p02            | plan.md Approach > Design (PR reviews given) | Inclusion regardless of the reviewed PR's author                | The user's own PRs are excluded                           | Comments on your own PR are not reviews given                                                          | Implementation  | None (minor; recorded here) |
| p14            | plan.md Phase p14 Intent                     | Create the fixed record directories in place at the commit step | Staged directory creation kept; rejected-batch test added | In-place creation leaves an unprovable empty directory after a crash, or needs a journal format change | Implementation  | None                        |
| p14 review L2  | plan.md Phase p14 Exit evidence              | `rg` finds only PathGuard and the shared seam                   | `plan.ts` `checkDirectory` kept                           | It runs at planning time, before identities exist, and records the identities PathGuard enforces       | Implementation  | None                        |

## Final Summary (for PR/docs)

**What shipped:**

- [capability 1]

**Behavioral changes (user-facing):**

- [bullet]

**Key files / modules:**

- `[path]` - [purpose]

**Verification performed:**

- [tests/lint/typecheck/build/manual steps]

**Outcomes audit:**

- Outcome 1: [observed evidence (accepted phase, commit, or verification result) or the recorded deferral]

**Brief deltas (if any):**

- [what changed vs plan.md and why]

## References

- Brief: `plan.md`
- Research: `references/research/`
