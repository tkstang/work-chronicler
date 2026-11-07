---
oat_template: true
oat_status: in_progress
oat_ready_for: null
oat_blockers: []
oat_last_updated: 2026-11-07
oat_phase: plan
oat_phase_status: in_progress
oat_plan_hill_phases: [] # [] = none for brief modes
oat_plan_parallel_groups: [] # groups of phases that run concurrently in worktrees; [] = fully sequential
oat_plan_source: goal
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

[State the outcome this project must achieve and why it matters.]

## Outcomes

<!-- Number each outcome and name the evidence that will show it holds. Completion is audited against this list. -->

1. **[Observable outcome]** — Evidence: [test, command, artifact, or review that will prove it]
2. **[Observable outcome]** — Evidence: [test, command, artifact, or review that will prove it]

## Approach

[Describe the intended approach: the modules and contracts involved and how the change fits them.]

<!-- Optional: add a `### Design` subsection when architecture decisions need recording. Delete this comment otherwise. -->

## Constraints and Out of Scope

- **Constraint:** [A rule the work must respect.]
- **Out of scope:** [Adjacent work intentionally excluded.]

## Decisions

- [Record each decision made by the user during the interview, with its rationale.]

## Known Unknowns

- [Open question] — Settled by: [phase ID that resolves it]

## Delivery endpoint and authority

- **Endpoint:** [open | merged] — [what "delivered" means for this project]
- **Authority:** [who approves the brief, phase acceptance, and the delivery; what the agent may decide alone]

## Milestones

<!-- One row per milestone: its id (m01, m02, …) and its ordered, comma-separated phase ids. Every phase, including revision phases, belongs to exactly one milestone. -->

| Milestone | Phases |
| --------- | ------ |

## Phase p01: [Phase Name]

**Intent:** [What this phase changes and why.]
**Exit evidence:** [The verification that shows the phase is done.]
**Provisional:** no

## Phase p02: [Phase Name]

**Intent:** [What this phase is expected to change; refine before it starts.]
**Exit evidence:** [The verification expected to show the phase is done.]
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

| Scope | Type     | Status  | Date | Artifact | Reviewed Head | Invocation | Gate Target |
| ----- | -------- | ------- | ---- | -------- | ------------- | ---------- | ----------- |
| plan  | artifact | pending | -    | -        | -             | -          | -           |
| p01   | code     | pending | -    | -        | -             | -          | -           |
| final | code     | pending | -    | -        | -             | -          | -           |

Add one `code` row per phase as phases become concrete. For code-review events,
`Reviewed Head` is the full 40-character SHA at the head of the reviewed range.
Writers must preserve every existing row and every unknown trailing cell.

**Status values:** `pending` → `received` → `fixes_added` → `fixes_completed` → `passed`

---

## Implementation Complete

**Summary:**

- Phase p01: [Description]

**Total: [N] phases**

Ready for final code review and PR preparation.

---

## References

- Journal: `implementation.md`
- Research: `references/research/`
- Project log: `project-log.md` (when enabled)
