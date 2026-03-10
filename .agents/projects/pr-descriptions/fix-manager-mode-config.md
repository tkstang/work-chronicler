# fix: use correct config schema for manager mode fetch commands

## Overview

Manager mode fetch commands (`fetch all`, `fetch github`, `fetch jira`) were completely broken — they failed immediately with validation errors because they loaded the manager config against the wrong Zod schema. This PR fixes the config loading, adds the missing `fetch` date range to the manager schema, and updates the init wizard to collect it.

## Context & Background

A user reported this error when running `fetch all` in manager mode:

```
❌ Error: Invalid config file:
  - github.username: Required
  - fetch: Required
```

They also found that manually adding IC fields to work around the error was undone every time they ran `reports update` or `reports add` — the config file was rewritten without their manual fixes.

## Problem

All three manager-mode fetch paths called `loadConfig()` which validates against `ConfigSchema` (the IC schema). The manager config uses `ManagerConfigSchema` with an entirely different structure:

| IC Schema (`ConfigSchema`) | Manager Schema (`ManagerConfigSchema`) |
|---|---|
| `github.username` (required) | `github.org` (required) |
| `github.orgs[]` (required) | No equivalent (single org) |
| `fetch.since` (required) | **Missing entirely** |

The config rewrite issue was a side effect: when users manually added IC fields to the manager config, `saveManagerConfig()` would strip them because Zod's `safeParse()` drops unknown fields.

The manager mode init wizard also never prompted for a time range (`fetch.since`), even though it's required for all fetch operations.

## Changes Summary

6 files changed, 114 insertions, 44 deletions.

### 1. Added `fetch` field to `ManagerConfigSchema`
**File:** [`src/core/types/manager.ts`](https://github.com/tkstang/work-chronicler/blob/claude/fix-manager-mode-config-SyhyG/src/core/types/manager.ts)

- New `ManagerFetchConfigSchema` with `since` (required string) and `until` (nullable string, defaults to null)
- Added as a required field on `ManagerConfigSchema`

### 2. Added time range prompt to manager init wizard
**File:** [`src/cli/commands/init/index.ts`](https://github.com/tkstang/work-chronicler/blob/claude/fix-manager-mode-config-SyhyG/src/cli/commands/init/index.ts)

- Manager mode init now calls the existing `promptTimeRange()` (same prompt used in IC mode) so new manager profiles include `fetch.since` in the generated config

### 3. Added `buildReportConfig()` helper
**File:** [`src/cli/commands/fetch/fetch-manager.utils.ts`](https://github.com/tkstang/work-chronicler/blob/claude/fix-manager-mode-config-SyhyG/src/cli/commands/fetch/fetch-manager.utils.ts)

Core of the fix. Two new functions:

- **`loadManagerConfigForFetch()`** — loads the manager config using `ManagerConfigSchema` (the correct schema)
- **`buildReportConfig()`** — converts a `ManagerConfig` + `ReportConfig` into an IC-compatible `Config` that the existing fetch utilities expect. Handles the field mapping:
  - `github.org` → `github.orgs[]` (with report's repos or wildcard)
  - report's `github` → `github.username`
  - manager's `jira` config + report's `jiraProjects` → `jira.instances[]`
  - manager's `fetch.since/until` → `fetch.since/until`

### 4. Fixed all three manager-mode fetch commands
- [`src/cli/commands/fetch/all.ts`](https://github.com/tkstang/work-chronicler/blob/claude/fix-manager-mode-config-SyhyG/src/cli/commands/fetch/all.ts) — replaced `loadConfig()` + manual field overrides with `loadManagerConfigForFetch()` + `buildReportConfig()`
- [`src/cli/commands/fetch/github/index.ts`](https://github.com/tkstang/work-chronicler/blob/claude/fix-manager-mode-config-SyhyG/src/cli/commands/fetch/github/index.ts) — same fix
- [`src/cli/commands/fetch/jira/index.ts`](https://github.com/tkstang/work-chronicler/blob/claude/fix-manager-mode-config-SyhyG/src/cli/commands/fetch/jira/index.ts) — same fix

## Migration Note

Existing manager profiles created before this fix will need to manually add the `fetch` field to their `config.yaml`:

```yaml
fetch:
  since: "2025-01-01"
  until: null
```

## Testing

- `pnpm type-check` passes
- `pnpm lint` passes
- Existing tests pass (no manager-specific tests exist yet)

## Test plan

- [ ] Run `init --mode manager` and verify it prompts for time range
- [ ] Verify the generated `config.yaml` includes the `fetch` field
- [ ] Run `fetch all --all-reports` in manager mode — no more validation errors
- [ ] Run `fetch github --all-reports` in manager mode
- [ ] Run `fetch jira --all-reports` in manager mode (with JIRA configured)
- [ ] Run `reports add` and verify config file preserves `fetch` field
- [ ] Verify IC mode fetch commands are unaffected

https://claude.ai/code/session_01B1GMk792THEbGeAJEZbb8Q
