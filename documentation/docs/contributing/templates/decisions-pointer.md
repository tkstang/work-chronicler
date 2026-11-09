---
title: Decisions pointer
description: A curated guide to consequential decisions, not a ledger or an ADR.
---

# Decisions pointer

## Where records live

Link the repository's authoritative decision store. This page is not a ledger and
is not an ADR; it routes readers to records without copying their full content.

## How records are created

Describe the existing repository process and required review. Do not initialize a
new decision system or imply adoption because this template was scaffolded.

## Selected decisions

Curate 3–8 real records relevant to this audience, each with a one-line consequence.
Remove the drafting row and do not fabricate records to fill a quota.

| Record             | Consequence                          | Staleness flag                    |
| ------------------ | ------------------------------------ | --------------------------------- |
| <real record link> | <current effect on reader decisions> | <current/superseded/needs review> |

## Staleness and review

Identify superseded guidance, last verification and owner-review gaps. Keep the
canonical record authoritative when this pointer becomes stale.

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
