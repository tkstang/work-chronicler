---
oat_status: complete
oat_ready_for: null
oat_blockers: []
oat_last_updated: 2026-11-08
oat_generated: true
oat_summary_phase_fingerprint: f54e707439ee4f36e4f4394327d7e30d10307ab37fe0ad882990c90163a52e70
oat_summary_revision_count: 0
oat_summary_includes_revisions: []
oat_summary_learnings_fingerprint: 7dcb10df9c7d383d5f5b16778c502f21fa9fd19a55bb9732f816bb2341bd4754
---

# Summary: work-chronicler-evidence-expansion

## Overview

work-chronicler gathered only authored PRs and JIRA tickets, so self-reviews, resumes and manager review packets missed review work, Slack discussion and design documents. This goal project broadened the evidence the tool collects (PR reviews given, Slack messages and owned Google Docs) through the same work log, filters, MCP server and skills, under one verb-first skill naming rule. It ran as three milestones, each squash-merged to `main` and released to npm, and the user declared the goal met on 2026-11-08.

## What Was Implemented

**m01 — 0.5.0 (PR #25, `29fd722`).** Package skills follow `work-chronicler-[manager-]<verb>-<object>`; `skills install` migrates the five renamed skills per host without deleting a working copy, with non-interactive flags. IC profiles can fetch the PR reviews they gave (`fetch github --reviews`), stored under `pr-reviews/`, served by `search_pr_reviews` and never counted as authored work.

**m02 — 0.6.0 (PR #26, `b17cb23`).** A staged import contract: `import <dir>` and `validate <dir>` check skill-written records, place them by identity under `messages/<source>/`, and commit a batch atomically with journaled, proof-based recovery. Opt-in Slack settings per IC profile and report (`slack configure`, `slack channels add|remove|list`, `slack show`), the setup and import Slack skills, and import rules that accept only the subject's own verified messages from configured channels. Consumers (`status`, `filter`, `analyze`, the MCP server and writing skills) count imported messages apart from authored work; new `search_messages`. `filter` now replaces its subset atomically, and `skills install --overwrite` stages and verifies before replacing.

**m03 — 0.7.0 (PR #27, `24507dc`).** Imported Google Docs the subject owns (`document` records under `documents/google-docs/`, `google-docs configure|show`, `--since/--until` on import and validate, `/work-chronicler-import-google-docs` reading Drive read-only through `gog`), covered by every consumer and the new `search_documents`. `import`, `filter` and `filter --clear` share one work-log lock judged by boot ID; `filter` settles an interrupted import first; readers never see a partial batch. The still-valid PR #26 review findings landed (p15, p16), including passing the setup-slack channel reason through `--reason-file`, cursor pagination for `search_messages` and date-only `until` as a whole UTC day. Internals were simplified behind one filesystem seam and a single ancestor checker (p14).

All seven brief outcomes are audited `met` in the goal outcome audit; deliveries d01–d03 are at their `merged` endpoint.

## Key Decisions

- **Goal mode with one squash-merged PR per milestone** (user): three dependent releases, each built on the previous milestone's merged code; milestone branches chain from the prior milestone's last head with `main` merged in.
- **Skills read external services; the CLI validates and stores** (agent, from the existing architecture): the CLI never calls an LLM or Slack/Google, so each source is a skill that stages records plus a CLI import that enforces identity, ownership and privacy rules.
- **Privacy rules in the CLI, not only in skill text**: Slack records must be the configured subject's own verified messages in configured channels, with others' words, reply bodies and raw mention markup refused; Docs must be owned by the configured account, with `unverified` attribution because ownership is not authorship.
- **Google Docs: owned only** (user): edited or commented Docs need attribution the APIs do not give reliably; publishing outputs to Google Docs was dropped.
- **Fix PR #26's review findings in 0.7.0 rather than re-gating 0.6.0** (agent, Astra-advised): the m02 gate had taken six rounds and no finding blocked release; the one Major in a skill shipped as a 0.6.0 known issue and was fixed first in p16.
- **Get buy-in before speculative complexity** (user, 2026-11-08): added to `AGENTS.md`; speculative review findings go to the user with their cost instead of being fixed by default. p17 (installer edge cases) and several unlikely cases were deferred under it.

## Design Deltas

- **p02:** the user's own PRs are excluded from "reviews given" (comments on your own PR are not reviews); the brief said regardless of author.
- **p14:** the fixed record directories are still staged rather than created in place at the commit step; in-place creation would leave an unprovable empty directory after a crash or need a journal format change.
- **m03 scope:** p17 was removed by the user's decision; its three installer findings are post-goal follow-ups.

## Notable Challenges

- **Filesystem edge cases dominated review.** The m02 exit gate took six attempts as reviewers found new races in import (ancestor swaps, recovery branches, lock takeover). Point fixes kept staling the gate; generic sweeps (one identity-checked path guard, an explicit recovery-branch audit, one shared lock) converged.
- **A test-only commit staled milestone evidence.** CLI-spawning tests timed out on the CI runner after the m02 gate passed; the timeout fix forced another gate run and integrated review. m03 opened its PR and got CI green before the gate.
- **Live connector walkthroughs found what synthetic tests missed**: the Slack read tools expose no team ID and their concise formats omit IDs; `gog drive get` nests metadata under `file`, and plain `docs cat` adds no markers.

## Tradeoffs Made

- One PR per milestone kept releases simple but made each review large (CodeRabbit skipped PR #27 at 106 files); phase reviews plus a cross-provider integrated review covered it.
- Excerpts of owned Docs are capped at 16 KiB with a truncation flag instead of storing full text, to bound the work log and keep source text separate from interpretation.

## Integration Notes

- Releases publish through npm trusted publishing (GitHub OIDC with provenance); the unused `NPM_TOKEN` repository secret was removed by the user.
- Manager-mode Google Docs discovery (a report's Docs shared with the manager) is covered by synthetic tests only.

## Follow-up Items

- **Deferred by the user (post-goal):** p17 installer replacement identity and recovery (CodeRabbit 4506074753, 4506074768, 4506074774); p16 review L3 (Slack user-change guard outside the work-log lock).
- **Speculative, deferred under the AGENTS.md rule:** the items recorded in `implementation.md` Deferred Findings for p09, p10 and p16 (for example the shared-`/tmp` reason file, manager-mode account confirmation in the Docs skill).
- **Older post-goal follow-ups:** m01 deferrals F3–F5 and the PR #25 CodeRabbit items listed in Deferred Findings; concurrent installers; parameter objects; workspace label to team ID reconciliation; date-only `until` for PRs, tickets and review records.

## Autonomous Execution Learnings

### Agent-instruction updates

- Write the filesystem threat matrix and its tests before destructive or atomic-write code, and treat destructive-path findings as real rather than contrived. Source: oat-archive:20261108-work-chronicler-evidence-expansion#2026-11-08-friction-destructive-filesystem-paths-need-a-threat-model-before-code-1, oat-archive:20261108-work-chronicler-evidence-expansion#2026-11-08-feedback-deferring-a-destructive-path-finding-as-contrived-was-wrong-1
- After a second filesystem or locking finding, stop and design one generic mechanism before re-gating. Source: oat-archive:20261108-work-chronicler-evidence-expansion#2026-11-08-friction-filesystem-findings-converge-on-sweeps-not-point-fixes-1, oat-archive:20261108-work-chronicler-evidence-expansion#2026-11-08-friction-concurrency-locks-attract-review-rounds-1
- Bring speculative review findings to the user with their cost instead of fixing them by default (now in `AGENTS.md`). Source: oat-archive:20261108-work-chronicler-evidence-expansion#2026-11-08-feedback-speculative-review-findings-need-the-user-s-buy-in-1

### Workflow issues

- Open the PR ready and get CI green before the milestone exit gate; give tests that spawn the built CLI explicit timeouts. Source: oat-archive:20261108-work-chronicler-evidence-expansion#2026-11-08-friction-test-only-commits-stale-milestone-evidence-1
- Run a read-only live walkthrough of each external connector early in its phase, before review, recording only redacted counts. Source: oat-archive:20261108-work-chronicler-evidence-expansion#2026-11-08-worked-well-live-walkthrough-before-review-catches-connector-gaps-1, oat-archive:20261108-work-chronicler-evidence-expansion#2026-11-08-friction-live-connector-walkthrough-finds-what-unit-tests-miss-1
- Goal delivery records (`integrated_review.scope`, `bound_revisions`, member base) are easy to mis-shape by hand; run `oat project delivery check` right after registering. Source: oat-archive:20261108-work-chronicler-evidence-expansion#2026-11-08-feedback-goal-delivery-record-shapes-are-easy-to-get-wrong-by-hand-1

## Associated Issues

- Upstream OAT feedback filed: voxmedia/open-agent-toolkit#406 (removing model-invocation blocking from goal-project skills).

## Workflow Observations

- **2026-11-08 · feedback · Deferring a destructive-path finding as contrived was wrong** (project, decision) `oat-archive:20261108-work-chronicler-evidence-expansion#2026-11-08-feedback-deferring-a-destructive-path-finding-as-contrived-was-wrong-1`
  CodeRabbit 4504866395 (nested resource links) was deferred as needing a hand-built layout; the exit gate then reproduced it as High data loss.
- **2026-11-08 · feedback · Speculative review findings need the user's buy-in** (project, decision) `oat-archive:20261108-work-chronicler-evidence-expansion#2026-11-08-feedback-speculative-review-findings-need-the-user-s-buy-in-1`
  Reviewers kept raising very unlikely failure modes (concurrent commands, clock jumps, crafted input), and the root fixed nearly all of them by default; the m02 gate took six rounds.
- **2026-11-08 · friction · Concurrency locks attract review rounds** (project, gotcha) `oat-archive:20261108-work-chronicler-evidence-expansion#2026-11-08-friction-concurrency-locks-attract-review-rounds-1`
  the filter lock added to fix a concurrency finding drew three more Low rounds (non-atomic release, stale takeover race, dead takeover guard).
- **2026-11-08 · friction · Destructive filesystem paths need a threat model before code** (project, gotcha) `oat-archive:20261108-work-chronicler-evidence-expansion#2026-11-08-friction-destructive-filesystem-paths-need-a-threat-model-before-code-1`
  the skills migration's old-copy removal took six review rounds (gate attempts 6, 7, integrated reviews at aa1da62 and b7a300e, plus CodeRabbit), each finding one more way to delete a copy still in use: nested resource links, permission errors in the walk, unreadable tool directories, case-insensitive paths, backslashes in POSIX names.
- **2026-11-08 · friction · Filesystem findings converge on sweeps, not point fixes** (project, gotcha) `oat-archive:20261108-work-chronicler-evidence-expansion#2026-11-08-friction-filesystem-findings-converge-on-sweeps-not-point-fixes-1`
  The m02 exit gate took six attempts; each round found a new filesystem edge case in import (ancestor swaps, recovery branches, lock takeover).
- **2026-11-08 · friction · Test-only commits stale milestone evidence** (project, gotcha) `oat-archive:20261108-work-chronicler-evidence-expansion#2026-11-08-friction-test-only-commits-stale-milestone-evidence-1`
  Two CLI-spawning tests timed out on the CI runner after the gate passed; the 60 s timeout fix was test-only but staled both the exit carrier and the integrated review.
- **2026-11-08 · feedback · Goal delivery record shapes are easy to get wrong by hand** (project, documentation-gap) `oat-archive:20261108-work-chronicler-evidence-expansion#2026-11-08-feedback-goal-delivery-record-shapes-are-easy-to-get-wrong-by-hand-1`
  d01 was registered by hand with integrated_review.scope as the milestone id, bound_revisions as bare SHAs and member base as a branch name; delivery check accepted the milestone subject before registration but rejected d01 later (review-scope-narrow, base-changed, review-provenance).
  Uncertainty: OAT 0.3.46 behavior; may differ in later versions.
- **2026-11-08 · friction · Live connector walkthrough finds what unit tests miss** (project, environment-limited) `oat-archive:20261108-work-chronicler-evidence-expansion#2026-11-08-friction-live-connector-walkthrough-finds-what-unit-tests-miss-1`
  The first live Slack walkthrough found five gaps (no team ID in any read tool, concise formats omit IDs, raw markup in bodies, file-only messages) that synthetic tests had not.
  Uncertainty: gog output shapes may differ by account and doc type.
- **2026-11-08 · worked-well · Live walkthrough before review catches connector gaps** (project, efficiency) `oat-archive:20261108-work-chronicler-evidence-expansion#2026-11-08-worked-well-live-walkthrough-before-review-catches-connector-gaps-1`
  the synthetic acceptance test passed, but the first live read-only Slack walkthrough found five gaps (no team ID from any read tool, concise formats omit IDs, Slack markup in text, file-only messages) plus two later skill corrections.

Synthesized recommendations for categorized learnings are in the Autonomous Execution Learnings section.
