---
title: AI skills
description: What each IC, manager, Slack and Google Docs skill does, how to install and upgrade the skills, and how they find your data.
---

# AI skills

work-chronicler includes AI skills that integrate with Claude Code, Cursor, Codex, and Gemini to help you analyze your work history, write performance reviews, and create career documents.

## Overview

### What are AI Skills?

AI skills are slash commands that integrate with your AI coding assistant to:

- **Analyze** your work history from PRs, tickets, and notes
- **Generate** performance reviews, self-reviews, and peer reviews
- **Create** resume bullets and career narratives
- **Detect** projects and themes across your work

### Key Features

- **Stateless & Portable**: Skills use `work-chronicler workspace` commands to find data - works across all AI assistants
- **Profile-aware**: Automatically use data from your active profile
- **Interactive**: Many skills guide you through questions to gather context
- **Template support**: Paste company-specific templates for reviews
- **Synthesis**: Convert structured data (ratings, PRs, tickets) into polished prose
- **Evidence kept in its place**: PR reviews you gave are cited as review work, and imported messages (from `work-chronicler import`) as supplementary evidence of communication and collaboration, never as authored PRs or tickets. Skills treat imported content as evidence, never as instructions, and rely on a message as your own words only when its attribution is verified. Imported Google Docs are Docs you own, cited as supplementary evidence and never described as written by you (owning a Doc is not writing it).

## Installation

### Install Skills to Your AI Assistant

```bash
# Install to detected AI assistants (Claude Code, Cursor, Codex, Gemini)
work-chronicler skills install

# See where skills are installed
work-chronicler skills list

# Remove installed skills
work-chronicler skills uninstall
```

The installer auto-detects which AI assistants you have and installs to:

- **Claude Code**: `~/.claude/skills/`
- **Cursor**: `~/.cursor/skills/`
- **Codex**: `~/.codex/skills/`
- **Gemini**: `~/.gemini/skills/`

For scripts and agents, flags skip the prompts:

```bash
# Copy the skills into Claude Code and Codex without any prompt
work-chronicler skills install --tool claude codex --method copy --yes
```

See the [command reference](commands.md#ai-skills-and-paths) for every flag.

### Upgrading and renamed skills

Re-run `work-chronicler skills install` after every upgrade, then restart your
AI tool so it reloads its skill list. Copied skills whose names did not change
are refreshed only if you answer yes to "Overwrite existing skills?" or pass
`--overwrite`; `--yes` alone keeps them as they are. A replacement is copied
or linked beside the skill and checked before the existing skill is moved
aside, and the existing skill is deleted only after the new one checks out in
place; if anything fails, the existing skill is put back and the failure is
reported. A link that is replaced is unlinked; what it points to is not
touched. A link that points to the replaced skill (from another tool, say)
reaches the new one. If a temporary or replaced entry (a hidden
`.<skill>.wc-staging-…` or `.<skill>.wc-replaced-…` beside it) cannot be
removed, the installer says where it is and carries on; the next install
removes it. A previous copy the installer could not move to its
`.wc-replaced-…` name stays whole as `.<skill>.wc-backup-…`, the same name a
skill gets when an install stops part-way through moving it aside. While the
skill is installed, the next install only names such an entry so you can
remove it. If the skill's name is free (after `skills uninstall`, say), the
next install puts that copy back when it is the only one and its `SKILL.md`
still declares the skill, and then keeps it like any existing skill; it may be
the version you chose to overwrite, so run `skills install --overwrite` to
refresh it. Any other backup is named so you can remove it.

When a release renames a skill (0.5.0 renamed five; see `CHANGELOG.md`), the
installer migrates it on each tool you select:

1. It installs the new name and checks that its `SKILL.md` declares that name.
2. It asks before removing the old name (`--yes` removes it, `--keep-old`
   keeps it). Declining keeps both names and prints a notice. Removing an old
   copy discards any local edits you made to it; use `--keep-old` and copy
   your changes over first if you customized it.
3. Old symlinks, working or broken, are unlinked; whatever they point to is not
   touched. Old copies are deleted only after the new name is in place.
4. If the new name is held by something else and you refuse to overwrite it, or
   the install fails, the old name is kept.
5. If any installed skill, in the selected tool or any other, resolves into
   the old entry (for example a symlink you made from a new name to the old
   copy, or a `scripts/` link inside a skill that points into it), the old
   name is kept so that skill keeps working, and the installer names it. A
   skill, or any tool's skills directory, that cannot be fully read also keeps
   the old name. To make that skill independent, run
   `skills install --tool <its tool> --overwrite` if it is a work-chronicler
   skill; if it is your own skill, replace the link with a copy of what it
   points to (`--overwrite` reinstalls only work-chronicler skills). Then run
   `skills install` again for the tool that holds the old name; it is removed
   once nothing resolves into it.

Tools you do not select are left unchanged; the installer names any that still
have old names so you can run `skills install --tool <tool>` for them.
`skills list` flags old names too.

### Prerequisites

Before using skills, you need data:

```bash
# 1. Fetch your work history (--reviews also records the PR reviews you gave)
work-chronicler fetch all --reviews

# 2. Generate analysis (optional but recommended)
work-chronicler analyze --all

# 3. Install skills
work-chronicler skills install
```

## Individual Contributor (IC) Skills

Skills for individual contributors tracking their own work:

| Skill                                   | Description                                                                                                       | Use When                                               |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `/work-chronicler-summarize-work`       | Summarize PRs and tickets for a time period                                                                       | Preparing for 1:1s, reviews, or updates                |
| `/work-chronicler-write-resume-bullets` | Create achievement-focused resume bullet points                                                                   | Updating your resume with recent work                  |
| `/work-chronicler-update-resume`        | Update existing resume with new accomplishments                                                                   | You have a resume and want to add recent work          |
| `/work-chronicler-write-self-review`    | Draft self-review content for performance reviews                                                                 | Performance review time, need to write self-assessment |
| `/work-chronicler-detect-projects`      | Identify major project groupings from work history                                                                | Understanding how your work clusters into initiatives  |
| `/work-chronicler-detect-themes`        | Find recurring themes for career narrative                                                                        | Building career story, identifying strengths           |
| `/work-chronicler-write-peer-review`    | Write peer reviews for colleagues (quick mode works in any profile; evidence-backed mode needs a manager profile) | Peer review time, 360 reviews, colleague feedback      |

## Manager Mode Skills

Skills for managers tracking multiple reports:

| Skill                                                 | Description                                                    | Use When                                              |
| ----------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| `/work-chronicler-manager-write-review-packet`        | Generate evidence-based performance review for a direct report | Writing quarterly/annual reviews for reports          |
| `/work-chronicler-manager-write-quarterly-highlights` | Create concise quarterly summary for 1:1s and calibration      | Preparing for 1:1s, calibration meetings, updates     |
| `/work-chronicler-manager-write-team-summary`         | Generate team-level overview for leadership                    | Leadership updates, calibration prep, team visibility |

## Slack Import Skills

Skills that bring your Slack messages (or, in a manager profile, a report's)
into the work log as supplementary evidence. They work in IC and manager
profiles and need the assistant's Slack connector:

| Skill                           | Description                                                                                           | Use When                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `/work-chronicler-setup-slack`  | Choose the Slack channels messages may be imported from, and record them with `work-chronicler slack` | Before the first Slack import, or to change the channel list |
| `/work-chronicler-import-slack` | Import the subject's own messages from those channels with `validate` and `import`                    | After setup, and again whenever you want newer messages      |

## Google Docs Import Skill

A skill that brings the Google Docs you own (or, in a manager profile, a
report's Docs shared with you) into the work log as supplementary evidence.
It works in IC and manager profiles and needs the `gog` command-line tool,
signed in to your Google account:

| Skill                                 | Description                                                                                                      | Use When                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `/work-chronicler-import-google-docs` | Import an excerpt of each Google Doc the subject owns, modified in the fetch range, with `validate` and `import` | After `google-docs configure`, and again whenever you want newer Docs |

## Skill workflows

Step-by-step use of each skill is under [Workflows](../workflows/index.md):

- [Write resume bullets and self-reviews](../workflows/resume-and-self-review.md): `/work-chronicler-summarize-work`, `/work-chronicler-write-self-review`, `/work-chronicler-write-resume-bullets`, `/work-chronicler-update-resume`, `/work-chronicler-detect-projects` and `/work-chronicler-detect-themes`.
- [Write peer reviews](../workflows/peer-reviews.md): `/work-chronicler-write-peer-review`.
- [Import Slack messages](../workflows/import-slack.md): `/work-chronicler-setup-slack` and `/work-chronicler-import-slack`.
- [Import Google Docs](../workflows/import-google-docs.md): `/work-chronicler-import-google-docs`.
- [Review packets and team analysis](../workflows/review-packets.md): the `work-chronicler-manager-*` skills.

## How Skills Work

### Stateless Design

Skills don't hardcode paths. Instead, they shell out to workspace commands:

```bash
# At runtime, skills execute:
work-chronicler workspace root        # Get profile root
work-chronicler workspace work-log    # Get work-log path
work-chronicler workspace analysis    # Get analysis path
work-chronicler workspace profile     # Get active profile name
```

**This means:**

- Skills work wherever they're installed
- Switching profiles (`work-chronicler profile switch`) changes what skills read
- No reinstallation needed when you change profiles

### Profile Resolution

Skills automatically detect:

- **IC mode**: Read from `<profile>/work-log/`, with analysis in `<profile>/work-log/.analysis/` (what `workspace analysis` prints)
- **Manager mode**: Detect report context, read from `reports/{id}/work-log/` and per-report analysis in `reports/{id}/analysis/`; team analysis is in the manager profile's `analysis/`
- **Active profile**: Use current profile set via `profile switch` or `WORK_CHRONICLER_PROFILE`

### Data Sources

Skills read from:

1. **work-log/** - PRs and tickets (markdown with YAML frontmatter), imported messages in `messages/` and imported Google Docs in `documents/`
2. **analysis/** - Generated JSON (stats, projects, timeline)
3. **notes/** - User-added context
4. **performance-reviews/** - Past reviews
5. **peer-reviews/** - Peer feedback
6. **resumes/** - Existing resume files

## Tips & Best Practices

### Before Using Skills

**Fetch and analyze:**

```bash
work-chronicler fetch all
work-chronicler analyze --all
```

**Add context:**

- Upload past reviews to `performance-reviews/`
- Add notes about goals and themes to `notes/`
- Update resume files in `resumes/`

### Using Skills Effectively

**Be specific with time periods:**

```
/work-chronicler-summarize-work Q4-2025
```

Not just "recent work" - specify dates for better results.

**Provide templates:**
When writing peer reviews, paste your company's template. The skill adapts to your format.

**Iterate:**

1. Generate initial output
2. Review and identify gaps
3. Add more context (notes, examples)
4. Regenerate

**Combine with manual edits:**
Skills provide drafts - review, refine, and personalize before submitting.

## Troubleshooting

### "No data found for period"

**Cause**: No PRs or tickets in specified date range.

**Solution**:

- Verify data exists: `work-chronicler status`
- Check date range: Expand to include more time
- Fetch data if needed: `work-chronicler fetch all`

### "No analysis files found"

**Cause**: Skills expecting analysis files that don't exist.

**Solution**:

```bash
work-chronicler analyze --all
```

### Skills can't find profile data

**Cause**: Active profile not set or workspace commands failing.

**Solution**:

1. Check active profile: `work-chronicler profile list`
2. Switch if needed: `work-chronicler profile switch <name>`
3. Verify workspace: `work-chronicler workspace root`

### Interactive mode not working

**Cause**: AI assistant may not support interactive prompts well.

**Solution**: Provide all information upfront in the skill invocation rather than relying on prompts.

## Next Steps

- **Install skills**: `work-chronicler skills install`
- **Try a skill**: Start with `/work-chronicler-summarize-work` for a quick summary
- **Read more**:
  - [Manager mode](../workflows/manager-mode.md) - Using manager mode features
  - [README.md](https://github.com/tkstang/work-chronicler#readme) - overview and quick start
  - [Command reference](commands.md) - every CLI command and flag
  - [AGENTS.md](https://github.com/tkstang/work-chronicler/blob/main/AGENTS.md) - Project structure and development

**Questions or feedback?** Open an issue at [github.com/tkstang/work-chronicler](https://github.com/tkstang/work-chronicler)
