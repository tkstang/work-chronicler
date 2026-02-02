# Phase 2: Portable Workspace & Skill Installation

## Overview

This design enables work-chronicler to be used without cloning the repo by making AI skills portable and installable to user's AI tool directories.

**Goals:**
- Remove dependency on cloning the repo
- Enable non-engineer usage
- Preserve existing AI command workflows

## Design Decisions

### Source Directory Structure

All skills live in `.agent/skills/` as the single source of truth:

```
.agent/
  skills/
    work-chronicler-summarize-work/
      SKILL.md
    work-chronicler-generate-resume-bullets/
      SKILL.md
    work-chronicler-write-self-review/
      SKILL.md
    work-chronicler-update-resume/
      SKILL.md
    work-chronicler-detect-projects/
      SKILL.md
    work-chronicler-detect-themes/
      SKILL.md
```

**Key decisions:**
- All skills prefixed with `work-chronicler-` to avoid conflicts with user's existing skills
- Each skill is a directory with `SKILL.md` (Claude Code / Agent Skills native format)
- All skills are user-invocable (explicit in frontmatter)
- Supporting files (examples, templates) can live alongside `SKILL.md` when needed

### Skill File Format

Skills follow the Agent Skills open standard with cross-provider compatibility:

```yaml
---
name: work-chronicler-summarize-work
description: Use when preparing for performance reviews, 1:1s, or summarizing accomplishments. Reads PRs and tickets from work-chronicler workspace.
user-invocable: true
---

# Summarize Work

## Workspace

Active profile: !`work-chronicler workspace profile`
Work log: !`work-chronicler workspace work-log`
Analysis: !`work-chronicler workspace analysis`

## When to use

- Performance review prep
- 1:1 meeting prep
- Reflecting on quarterly accomplishments

## Instructions

1. Read the PRs from the work-log directory
2. Check for filtered subset at `filtered/` subdirectory first
3. Load analysis files (stats.json, projects.json, timeline.json) if available
...
```

**Cross-provider compatibility:**

| Field | Value | Rationale |
|-------|-------|-----------|
| `name` | `work-chronicler-*` | Lowercase, hyphens, ≤64 chars (spec compliant) |
| `description` | Single line, ≤500 chars | Codex limit; starts with "Use when..." for trigger clarity |
| `user-invocable` | `true` (explicit) | Claude-specific but harmless elsewhere (ignored by Codex) |

**Provider notes:**
- `!`command`` syntax is Claude Code-specific; other providers see it as literal text
- Fallback instructions included in body: "Run `work-chronicler workspace work-log` to find your data"
- Claude-specific fields (`user-invocable`, `allowed-tools`) are ignored by other providers

### Workspace Path Injection

Skills use dynamic shell injection to get workspace paths:

```markdown
Work log: !`work-chronicler workspace work-log`
```

This ensures:
- Always returns the correct, current workspace path
- Automatically respects profile switches without reinstalling skills
- Single source of truth - the CLI itself

### Installation Method

**Hybrid approach:** Default to copy, with symlink option via interactive prompt.

- **Copy (default):** Works regardless of package location; resilient to package moves/updates
- **Symlink:** Auto-updates when package updates; requires global npm install

User selects their preference during `skills install`.

### Conflict Handling

When a `work-chronicler-*` skill already exists at target:
1. Warn the user about the conflict
2. Prompt: "Skill X already exists. Overwrite? (y/n)"
3. Only overwrite with explicit confirmation

## CLI Commands

### `skills` subcommands

```bash
work-chronicler skills install    # Interactive install wizard
work-chronicler skills uninstall  # Remove installed skills from selected tools
work-chronicler skills list       # Show where skills are installed
```

### `workspace` subcommands

```bash
work-chronicler workspace profile     # Active profile name
work-chronicler workspace work-log    # Path to work-log directory
work-chronicler workspace analysis    # Path to analysis directory
work-chronicler workspace root        # Profile root directory
```

### `skills install` Flow

1. Detect which AI tool config directories exist (`~/.claude/`, `~/.cursor/`, `~/.codex/`, `~/.gemini/`)
2. Present multi-select: "Select AI tools to install skills for:"
   ```
   ? Select AI tools to install skills for:
     [x] Claude Code (~/.claude)
     [x] Cursor (~/.cursor)
     [ ] Codex (~/.codex) - not detected
     [ ] Gemini (~/.gemini) - not detected
   ```
3. Prompt installation method:
   ```
   ? How should skills be installed?
     > Copy (recommended - works after package updates)
       Symlink (auto-updates but requires global install)
   ```
4. For each selected tool, check for existing `work-chronicler-*` skills
5. If conflicts found, prompt: "Skill X already exists. Overwrite? (y/n)"
6. Install skills using selected method
7. Report success: "Installed 6 skills to Claude Code, Cursor (copied)"

### `skills uninstall` Flow

1. Detect which tools have work-chronicler skills installed
2. Present multi-select of tools to uninstall from
3. Remove `work-chronicler-*` skill directories from selected tools
4. Report: "Removed 6 skills from Claude Code"

### `skills list` Output

```
Installed skills:

Claude Code (~/.claude/skills/):
  ✓ work-chronicler-summarize-work
  ✓ work-chronicler-generate-resume-bullets
  ✓ work-chronicler-write-self-review
  ...

Cursor (~/.cursor/skills/):
  (not installed)
```

## Migration Plan

### Files to Migrate

From `.claude/commands/` and `.cursor/commands/`:
- `detect-projects.md` → `work-chronicler-detect-projects/SKILL.md`
- `summarize-work.md` → `work-chronicler-summarize-work/SKILL.md`
- `generate-resume-bullets.md` → `work-chronicler-generate-resume-bullets/SKILL.md`
- `update-resume.md` → `work-chronicler-update-resume/SKILL.md`
- `write-self-review.md` → `work-chronicler-write-self-review/SKILL.md`
- `detect-themes.md` → `work-chronicler-detect-themes/SKILL.md`

### Migration Steps

1. Create `.agent/skills/` directory structure
2. Convert each command to skill format:
   - Add cross-provider compatible frontmatter
   - Add dynamic workspace injection (`!`work-chronicler workspace *``)
   - Add fallback instructions for non-Claude providers
3. Remove old `.claude/commands/` and `.cursor/commands/` directories
4. Update documentation (README, CLAUDE.md)

## Implementation Plan

### Files to Create

| Path | Purpose |
|------|---------|
| `.agent/skills/work-chronicler-*/SKILL.md` | 6 skill files (migrated from commands) |
| `src/cli/commands/skills/index.ts` | Skills command group |
| `src/cli/commands/skills/install.ts` | Install subcommand |
| `src/cli/commands/skills/uninstall.ts` | Uninstall subcommand |
| `src/cli/commands/skills/list.ts` | List subcommand |
| `src/cli/commands/workspace/index.ts` | Workspace command group |
| `src/cli/commands/workspace/profile.ts` | Output active profile name |
| `src/cli/commands/workspace/work-log.ts` | Output work-log path |
| `src/cli/commands/workspace/analysis.ts` | Output analysis path |
| `src/cli/commands/workspace/root.ts` | Output profile root path |

### Files to Delete

| Path | Reason |
|------|--------|
| `.claude/commands/*.md` | Migrated to `.agent/skills/` |
| `.cursor/commands/*.md` | Migrated to `.agent/skills/` |

### Files to Update

| Path | Change |
|------|--------|
| `src/cli/index.ts` | Register `skills` and `workspace` commands |
| `README.md` | Document new commands and skill installation |
| `CLAUDE.md` | Update project structure |

## Target Tool Directories

Skills are installed to these locations:

| Tool | Skills Directory |
|------|------------------|
| Claude Code | `~/.claude/skills/` |
| Cursor | `~/.cursor/skills/` |
| Codex | `~/.codex/skills/` |
| Gemini | `~/.gemini/skills/` |

## Post-Implementation Repo Structure

```
work-chronicler/
├── .agent/
│   └── skills/
│       ├── work-chronicler-summarize-work/
│       │   └── SKILL.md
│       ├── work-chronicler-generate-resume-bullets/
│       │   └── SKILL.md
│       ├── work-chronicler-write-self-review/
│       │   └── SKILL.md
│       ├── work-chronicler-update-resume/
│       │   └── SKILL.md
│       ├── work-chronicler-detect-projects/
│       │   └── SKILL.md
│       └── work-chronicler-detect-themes/
│           └── SKILL.md
├── src/
│   └── cli/
│       └── commands/
│           ├── skills/        # NEW: install, uninstall, list
│           └── workspace/     # NEW: profile, work-log, analysis, root
└── ... (rest unchanged)
```
