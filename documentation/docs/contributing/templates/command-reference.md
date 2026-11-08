---
title: Command reference
description: Verified command inputs, outputs and mutation boundaries.
---

# Command reference

Source: <source location for the command registration and handler, or unknown>

## Production impact

State affected environments, access and operational risks; say unknown when unknown.

## Command group index

| Command               | Purpose       | Mutates                    |
| --------------------- | ------------- | -------------------------- |
| <verified invocation> | <reader goal> | <yes/no/unknown and scope> |

## Shared flags

List verified spelling, defaults, accepted values and applicability.

## Per-command arguments

For each command, describe positional arguments, flags, required combinations,
validation and defaults. State unknown rather than inferring behavior from a name.

## Outputs and JSON

Describe human output and the verified --json schema where supported; otherwise
state unsupported or unknown. Show examples only when verified from source or a run.

## Exit codes

List known categorical outcomes and their codes, including partial results.

## Side effects

Name file, config, service and remote mutations, overwrite behavior and dry-run
support. Mark unverified effects unknown and identify the reviewing owner.

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
