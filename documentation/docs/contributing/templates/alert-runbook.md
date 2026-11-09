---
title: Alert runbook
description: Triage, recovery and verification for a specific operational alert.
---

# Alert runbook

## When to use and entry criteria

Name the alert/symptoms and checks that establish this runbook applies.

## Production context

Identify environment, affected components, customer impact and access prerequisites.

## Ownership

Name the responding role, escalation route and owner-review gaps.

## First-five-minutes triage

| Signal             | Check             | Interpretation             | Next action                   |
| ------------------ | ----------------- | -------------------------- | ----------------------------- |
| <observed symptom> | <read-only check> | <supported interpretation> | <numbered step or escalation> |

## Procedure

1. Establish scope with a read-only check.
   **Verify:** state the expected observation and stop/escalate condition.
2. Perform the reviewed recovery action.
   **Verify:** state the successful observation and failure response.

Warn immediately before any destructive command, state its scope and require the
reviewed dry run first. Do not invent runnable production commands or dry-run flags.

## Why this approach

Explain the evidence and tradeoffs behind the recovery sequence.

## Rollback

Describe the inverse action, recovery prerequisites and verification, or state why
rollback is unavailable and give the escalation route.

## Verification checklist

- Confirm service health and the original alert condition.
- Confirm customer-visible recovery and absence of new side effects.
- Record dated evidence and unresolved owner-reviewed gaps.

## Writing and evidence rules

Use backticks only for literals verified verbatim in source, such as commands,
errors, labels and identifiers. Write concepts in ordinary prose. Cite the
source location for each verified literal; label unknown facts as unknown.
Remove drafting prompts before publishing and retain owner-review gaps explicitly.

Keep these three evidence classes separate:

- Planned automation: intended coverage, with owner and remaining work.
- Implemented assertions: the test path and the exact assertion it implements.
- Dated execution evidence: date, environment/configuration, result and evidence
  location. Implemented assertions alone do not prove a successful execution.
