---
oat_status: in_progress
oat_ready_for: null
oat_blockers: []
oat_last_updated: 2026-11-07
oat_current_task_id: p03
oat_generated: false
---

# Implementation: work-chronicler-evidence-expansion

**Started:** 2026-11-07
**Last Updated:** 2026-11-07

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
| p03   | in_progress | 1     | 0/1      |
| p04   | pending     | 1     | 0/1      |
| p05   | pending     | 1     | 0/1      |
| p06   | pending     | 1     | 0/1      |
| p07   | pending     | 1     | 0/1      |
| p08   | pending     | 1     | 0/1      |
| p09   | pending     | 1     | 0/1      |
| p10   | pending     | 1     | 0/1      |
| p11   | pending     | 1     | 0/1      |

**Total:** 2/11 phases accepted

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

Review `reviews/p01-review-2026-11-07T233956Z.md` (0 Critical/High, 5 Low) passed; root fixed all five Lows (README counts, AGENTS.md list order, replacement-check wording, old-copy edit warning, nonexistent `reports add --skip-fetch` in write-peer-review). Late-fix rule: no later phase has a Base, so Head advanced. Proof: `pnpm format && pnpm lint && pnpm typecheck && pnpm test` (187 pass). Fix commit not independently re-reviewed (Low-only); covered by the m01 integrated review.

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

Review `reviews/p02-review-2026-11-08T000100Z.md`: 0 Critical/High, 2 Medium, 4 Low; passed. The implementer fixed all six in a continuation of wce-p02-impl-1 (late-fix rule: no later phase Base, so Head advanced). Root re-ran typecheck and tests at the new Head: pass (223). Fixes not independently re-reviewed; the m01 integrated cross-provider review covers them.

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

**Status:** in_progress
**Base:** 23a4f1aae63ebd37c8966dca2c2136f794f14190
**Executor:** inline:p03-inline-exception
**Head:** 81017148924eb180394a8b92dde7e48fa80d0590

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

Review `reviews/p03-review-2026-11-08T000907Z.md` (0 C/H/M, 1 Low) passed; root fixed the Low (MCP server hardcoded `0.1.0`), added a server test and a CHANGELOG Fixed entry. Proof: lint, format:check, typecheck, 223 tests, build plus a built-module import. Not independently re-reviewed; covered by the m01 integrated review.

### Review Received: final (m01 exit gate, attempt 1)

**Date:** 2026-11-08
**Review artifact (local-only):** reviews/archived/final-review-2026-11-08T001944Z.md

**Findings:** Critical 0 · High 2 · Medium 2 · Low 0 (gate `codex-6-sol-xhigh`, verdict blocked, run 1ff92794-0065-452b-8b7f-52d57f0b8828)

- H1 (High): migration can delete the old directory a verified replacement symlink depends on → fix task p03-t03; agree, reproduced by reviewer with the built CLI.
- H2 (High): owner-lookup rate limit becomes an empty successful review fetch → fix task p03-t05; agree, breaks the fatal rate-limit contract.
- M1 (Medium): no-overwrite path deletes a regular-file conflict → fix task p03-t04; agree, data loss without consent.
- M2 (Medium): stored review records reused across reviewer identities → fix task p03-t06; agree, misattribution.

**Outcome:** fixes queued: p03-t03, p03-t04, p03-t05, p03-t06 (late-fix rule: reviewed phase p03 is the last phase and no later phase has a Base, so fixes land under p03 and advance its Head)

### Task p03-t03: (review) Keep old skill copies a replacement depends on

**Status:** pending
**Source review:** reviews/archived/final-review-2026-11-08T001944Z.md (H1)

Intent: Before removing an old entry, require that the replacement (and its SKILL.md) does not resolve into the path being removed; otherwise keep the old entry, print why, and install an independent copy only if allowed. Regression: dependent new-name symlink into the old dir + independent-symlink control.
Files: `src/cli/commands/skills/migrate.ts`, `install.ts`, `install.test.ts`
Proof: `pnpm lint && pnpm typecheck && pnpm test`

### Task p03-t04: (review) Treat any occupant of a destination as an overwrite conflict

**Status:** pending
**Source review:** reviews/archived/final-review-2026-11-08T001944Z.md (M1)

Intent: Conflicts come from occupancy of every intended destination (files, dirs, links), not only `findInstalledSkills`; replacement only on explicit overwrite or documented broken-link repair. Regression: regular file at a new name during an upgrade.
Files: `src/cli/commands/skills/install.ts`, `install.test.ts`
Proof: `pnpm lint && pnpm typecheck && pnpm test`

### Task p03-t05: (review) Make owner-lookup rate limits fatal in review fetch

**Status:** pending
**Source review:** reviews/archived/final-review-2026-11-08T001944Z.md (H2)

Intent: Propagate 429/rate-limited 403 from the owner lookup through `handleRateLimitError`; distinguish confirmed user/org classification from an unavailable lookup. Regression: rate limit on the first lookup → no search, run fails; user and org controls.
Files: `src/cli/commands/fetch/github/github-reviews.utils.ts` (and the shared `isUser` helper in `github.utils.ts`), tests
Proof: `pnpm lint && pnpm typecheck && pnpm test`

### Task p03-t06: (review) Bind stored review records to the reviewer identity

**Status:** pending
**Source review:** reviews/archived/final-review-2026-11-08T001944Z.md (M2)

Intent: Require a case-insensitive `reviewer` match before cache reuse or merge; on mismatch replace the record without inheriting the other person's entries (or refuse with guidance). Regression: cache path and different-range path.
Files: `src/cli/commands/fetch/github/github-reviews.utils.ts`, tests
Proof: `pnpm lint && pnpm typecheck && pnpm test`

---

## Phase p04: Staged import contract

**Status:** pending

---

## Phase p05: Consumers and linking for imported evidence

**Status:** pending

---

## Phase p06: Slack configuration and CLI

**Status:** pending

---

## Phase p07: Slack skills and live walkthrough

**Status:** pending

---

## Phase p08: 0.6.0 release preparation

**Status:** pending

---

## Phase p09: Google Docs documents record and config

**Status:** pending

---

## Phase p10: Google Docs import skill and live walkthrough

**Status:** pending

---

## Phase p11: 0.7.0 release preparation

**Status:** pending

---

## Orchestration Runs

<!-- One line per dispatch request id, rendered by `oat project dispatch record --format line` and written as a list item. Update that line in place with the terminal outcome; never paste the record or event JSON. -->

<!-- orchestration-runs-start -->

- run/v1 · request=wce-p01-impl-1 · scope=p01 · action=implementation · role=oat-phase-implementer · target=oat-phase-implementer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p01 action=implementation role=implementer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-phase-implementer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- run/v1 · request=wce-p01-rev-1 · scope=p01 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p01 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- run/v1 · request=wce-p02-rev-1 · scope=p02 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p02 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

- Root-inline phase: p03 — inline exception for a version bump and CHANGELOG move; root model claude-opus-5-5

- run/v1 · request=wce-p03-rev-1 · scope=p03 · action=review · role=oat-reviewer · target=oat-reviewer-claude-claude-opus-5-5-high · model=claude-opus-5-5 · effort=high · stamp=Dispatch: scope=p03 action=review role=reviewer producer=unknown provenance=unknown model_axis=selected:claude-opus-5-5 effort_axis=selected:high dispatch_policy=high dispatch_ceiling=high target=oat-reviewer-claude-claude-opus-5-5-high · launch=accepted · outcome=completed · terminal=yes · class=completed · continuation=~ · observed=~ · match=~

<!-- orchestration-runs-end -->

## Reviews and Gates

<!-- Receipts for final, milestone and multi-phase reviews (a phase review receipt may stay in its phase) and one terminal line per gate run. state.md owns gate transitions; this slot keeps the outcome, waivers and operator choices. -->

## Deferred Findings

<!-- One line per approved deferral (finding, rationale, approval, follow-up trigger), plus excluded parallel phases and unmerged worktrees. -->

## Deviations from Plan / Design

Document any intentional deviations from the brief. Include accepted review findings where the shipped implementation is source of truth and the brief needs alignment.

| Phase / Review | Source Artifact                              | Planned / Documented                             | Actual / Accepted               | Reason                                        | Source of Truth | Follow-up                   |
| -------------- | -------------------------------------------- | ------------------------------------------------ | ------------------------------- | --------------------------------------------- | --------------- | --------------------------- |
| p02            | plan.md Approach > Design (PR reviews given) | Inclusion regardless of the reviewed PR's author | The user's own PRs are excluded | Comments on your own PR are not reviews given | Implementation  | None (minor; recorded here) |

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
