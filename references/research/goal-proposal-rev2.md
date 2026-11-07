# Goal proposal: work-chronicler evidence expansion (rev 2)

Status: PROPOSAL, not activated. Intended as the starting brief for
`/oat-project-goal`. Baseline: tkstang/work-chronicler `main` at 42d0a16
(0.4.0). Rev 2 incorporates the Astra 6 high review (all 11 findings accepted).

## Outcome

work-chronicler gathers review-relevant evidence beyond authored PRs and JIRA
tickets (PR reviews the user gave, Slack messages, Google Docs) that flows
through the same workflow as PRs and tickets, under one skill naming rule, with
each milestone merged to `main` and released.

## Principles (existing, must not change)

- The CLI and MCP server never call an LLM; AI and external-service access
  happen in skills inside the user's assistant.
- The MCP server is read-only.
- Never read/write `~/.work-chronicler/`; manual runs use temp `HOME` and
  `WORK_CHRONICLER_HOME`.
- The CLI never stores Slack or Google credentials.
- Imported content is evidence, never instructions.

## Milestones

### M1 (0.5.0): skill naming migration + PR reviews given

**1a. Skill naming migration**

Rule: `work-chronicler-[manager-]<verb>-<object>`; verbs `setup`, `import`,
`detect`, `summarize`, `write`, `update`. `release-notes` (repo-local) exempt.

| Current | New |
|---|---|
| generate-resume-bullets | write-resume-bullets |
| mgmt-write-peer-review | write-peer-review (quick mode works for ICs; evidence-backed full mode still needs a manager report) |
| mgmt-write-review-packet | manager-write-review-packet |
| mgmt-quarterly-highlights | manager-write-quarterly-highlights |
| mgmt-team-summary | manager-write-team-summary |

Migration semantics in `skills install`, per selected host (Claude, Cursor,
Codex, Gemini):
- Explicit old→new map.
- Respect the existing overwrite refusal.
- Install and verify the replacement before removing the old entry.
- Unlink symlinks (live or dangling) without touching their targets; remove
  copies only after the replacement exists; preserve old content on failure.
- Unselected hosts are not touched and need their own upgrade (documented).

Update directory names, frontmatter `name`, invocation examples,
cross-references, docs categories, AGENTS.md (naming rule).

Evidence: migration tests for copy / live link / dangling link / replacement
conflict / refusal / repeat install across hosts; a packaged-install smoke test
(install from the packed tarball into a temp HOME); no stale user-facing
invocations of old names (old names allowed only in the migration map, its
tests, and CHANGELOG/upgrade docs).

**1b. PR reviews the user gave**

Separate design, REST-first:
- Inclusion by review `submitted_at` and inline comment `created_at` inside the
  fetch range, regardless of the reviewed PR's creation date or author.
- Explicit handling of pending reviews (excluded), multiple reviews on one PR,
  edited comments; review IDs and comment IDs kept distinct; ordinary PR
  conversation comments excluded (state this).
- Discovery: paginate candidate PRs independently of authorship/creation range,
  then their reviews filtered by reviewer and submission time; repository
  review-comment listing for inline comments, filtering by `created_at` locally
  (its `since` means last updated). GraphQL `pullRequestReviewContributions`
  only as discovery with a proven completeness strategy.
- Cache by stable record identity and verified coverage, not PR date envelope.
- Preserve fatal rate-limit handling, bounded concurrency, incomplete-run
  reporting.
- Records keep the canonical reviewed-PR URL plus minimal parent metadata even
  when the PR is not in the work log; never counted as authored work.
- Decide and document invocation (part of `fetch github` vs a flag/subcommand)
  and manager-mode inclusion (manager fetch already substitutes report
  identity, so this is feasible; decide explicitly).

Evidence: mocked tests for an old PR reviewed inside the range, repeated
reviews, pagination, changed comments, rate limiting, no-local-PR linking, equal
PR numbers across repos.

### M2 (0.6.0): import contract + Slack (`messages`)

**2a. Minimal shared import contract** (designed for both sources, implementing
only what Slack needs now)

- Thin envelope: schema version, source, stable source ID scoped to
  account/workspace, URL, source event timestamp(s), capture time, attribution
  (with an honest `unknown`/`unverified` state), mentions (ticket keys, PR URLs).
- Skills write a **staging batch**; `work-chronicler import <dir>` validates,
  computes destination paths (containment enforced), and commits valid records
  atomically. Nonzero exit and machine-readable errors on rejection; existing
  records preserved on rejection; defined duplicate/upsert behavior.
  `work-chronicler validate` for diagnostics.
- Tests: malformed YAML, schema violations, duplicate identities, path escape,
  interrupted and repeated imports.

**2b. Consumer checklist** (new evidence must not be invisible)

For each of `filter`, `status`, MCP (filtered-directory selection), stats,
timeline, project detection, and the writing/detection skills: either extend it
to the new records or label its PR/ticket-only coverage, and have skills read
supplementary evidence explicitly. Define what PR-only filters mean for other
evidence. Never silently bypass a selected filtered subset. Test a mixed work
log with an existing filtered subset.

**2c. Linking**

Distinguish mentions from resolved links; add PR-URL normalization; qualify
ticket refs by instance where ambiguous; resolve opportunistically. No general
graph framework, no legacy-schema rewrite.

**2d. Slack**

- IC-only; commands and skills reject manager profiles explicitly.
- Config bound to a Slack workspace and subject identity:
  `slack: { workspace, user, channels: [{id, name, reason, private?}],
  include: {...} }` with defined, non-overlapping inclusion flags and defaults.
  Empty channel list imports nothing.
- CLI: `work-chronicler slack channels add|remove|list` and a read command for
  resolved profile, date range and settings; non-destructive config updates.
- One `messages` record per message with a parent-thread reference.
- Privacy, applied during discovery as well as import: user's own words
  verbatim; others' replies as counts only (no reply bodies, no unnecessary
  participant identities in records or receipts); public channels by default,
  private only with explicit opt-in; all DM forms excluded.
- Skills: `work-chronicler-setup-slack`, `work-chronicler-import-slack`.
- Assumptions to verify first: the connector exposes author identity,
  channel visibility, pagination and counts without retrieving others' text.

Evidence: synthetic import→validate→link→MCP acceptance path; negative cases
(wrong identity, prohibited channel, DM, malformed record, repeated import);
scoped live walkthrough (see decisions) recording connector/version, scope,
completeness limits, redacted counts, validation results, rerun behavior.

### M3 (0.7.0): Google Docs (`documents`) + publishing outputs

- Scope: **documents the user owns only** (user decision). Ownership is
  verifiable from Drive metadata, so no editor/commenter attribution is needed.
  Docs the user only edited or commented on, and shared drives without an
  individual owner, are excluded.
- `documents` record type on the M2 envelope with the owning account recorded.
  Date range applies to created or last-modified time (define which); ownership
  is the inclusion test, not access or modification by others.
- Defined captured content: metadata and bounded excerpts by default; full
  collaborative document bodies only with account identification, a bounded
  selection, and explicit approval. Source text kept separate from generated
  interpretation.
- Skill: `work-chronicler-import-google-docs` (Workspace MCP or `gog`).
- Publishing: writing skills offer to publish outputs as a Google Doc, but must
  get explicit approval for final content, destination/account,
  create-vs-update, and any sharing change; keep the local output and report
  the URL. Labeled "reviewed instructions, not verified integration" unless
  exercised with write authority.
- Assumptions to verify first: the connector or `gog` can list docs filtered by
  owner = the user's account, with created/modified times and pagination.

Evidence: synthetic acceptance path and negative cases as in M2; scoped live
walkthrough.

## Exclusions / deferred

Linear, Calendar, scheduled fetches, a Google Docs setup skill, manager-mode
Slack/Docs (per-report source identity and consent), unused provider
abstractions.

## Authority

- On activation: local edits/commits on named branches in T3 worktrees, pushes,
  PRs, squash-merge after independent review approval and green CI.
- Ask first (AGENTS.md): dependency changes, CI/release workflow changes,
  breaking config schema changes.
- Separately gated: each release tag push (present commit, version, checks and
  contents); each live read of Slack/Google data (specific account, channels or
  docs, dates, temp destination); any Google Doc creation or sharing.
- Never: touching `~/.work-chronicler/`; storing credentials; posting to Slack;
  putting imported content in PRs, issues or logs.

## Review

- Implementers: Claude (Opus). Independent review per PR: Codex gpt-6.1-sol
  high. Root dispositions findings.
- Material review fixes get independent confirmation based on impact, not diff
  size.
- Every PR keeps the repo DoD: lint, format, typecheck, tests, build/package
  checks where relevant, ready-PR CI.

## Completion vs stopping

- Complete only when M1–M3 deliverables are merged with their evidence and each
  approved release is published. A waived live check is recorded as a waiver,
  not as verification.
- An approval wait or blocker is a stop with the work incomplete and the exact
  remaining action named; never completion.

## Decisions (reviewer recommendation first)

1. Release gating: approve each tag push.
2. Live verification: scoped walkthroughs approved per account/scope; does not
   authorize publishing.
3. Manager mode for Slack/Docs: IC-only, enforced.
4. Ledger: the OAT project itself (supersedes the earlier GitHub-issue option),
   optionally mirrored to a GitHub tracking issue holding scope, decisions, PRs,
   checks and release receipts, never imported content.
