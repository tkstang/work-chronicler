---
title: Solution record
description: An incident diagnosis and fix, distinct from a capability solution guide.
symptoms: []
root_cause: unknown
component: unknown
severity: unknown
date: null
---

# Solution record

## Problem

Describe impact, reproduction and observed symptoms. Keep the frontmatter symptoms
verbatim from observed errors; do not invent an incident, date or severity.

## Root cause

Explain the causal chain with source/evidence references and remaining uncertainty.

## Fix

Describe the actual change, affected component, verification and rollback.

## Prevention

Separate proposed prevention from implemented assertions and dated execution results.
Name follow-up owners and unresolved review gaps.

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
