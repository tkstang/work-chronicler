# Available AI Skills

work-chronicler includes AI skills that integrate with Claude Code, Cursor, Codex, and Gemini to help you analyze your work history, write performance reviews, and create career documents.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Individual Contributor (IC) Skills](#individual-contributor-ic-skills)
- [Manager Mode Skills](#manager-mode-skills)
- [Slack Import Skills](#slack-import-skills)
- [Google Docs Import Skill](#google-docs-import-skill)
- [Skill Details](#skill-details)
  - [Writing Peer Reviews](#writing-peer-reviews)
  - [Writing Performance Reviews](#writing-performance-reviews)
  - [Summarizing Work](#summarizing-work)
  - [Resume & Career Documents](#resume--career-documents)
  - [Importing Slack Messages](#importing-slack-messages)
  - [Importing Google Docs](#importing-google-docs)
- [How Skills Work](#how-skills-work)
- [Tips & Best Practices](#tips--best-practices)

---

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

---

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

---

## Individual Contributor (IC) Skills

Skills for individual contributors tracking their own work:

| Skill | Description | Use When |
|-------|-------------|----------|
| `/work-chronicler-summarize-work` | Summarize PRs and tickets for a time period | Preparing for 1:1s, reviews, or updates |
| `/work-chronicler-write-resume-bullets` | Create achievement-focused resume bullet points | Updating your resume with recent work |
| `/work-chronicler-update-resume` | Update existing resume with new accomplishments | You have a resume and want to add recent work |
| `/work-chronicler-write-self-review` | Draft self-review content for performance reviews | Performance review time, need to write self-assessment |
| `/work-chronicler-detect-projects` | Identify major project groupings from work history | Understanding how your work clusters into initiatives |
| `/work-chronicler-detect-themes` | Find recurring themes for career narrative | Building career story, identifying strengths |
| `/work-chronicler-write-peer-review` | Write peer reviews for colleagues (quick mode works in any profile; evidence-backed mode needs a manager profile) | Peer review time, 360 reviews, colleague feedback |

---

## Manager Mode Skills

Skills for managers tracking multiple reports:

| Skill | Description | Use When |
|-------|-------------|----------|
| `/work-chronicler-manager-write-review-packet` | Generate evidence-based performance review for a direct report | Writing quarterly/annual reviews for reports |
| `/work-chronicler-manager-write-quarterly-highlights` | Create concise quarterly summary for 1:1s and calibration | Preparing for 1:1s, calibration meetings, updates |
| `/work-chronicler-manager-write-team-summary` | Generate team-level overview for leadership | Leadership updates, calibration prep, team visibility |

---

## Slack Import Skills

Skills that bring your Slack messages (or, in a manager profile, a report's)
into the work log as supplementary evidence. They work in IC and manager
profiles and need the assistant's Slack connector:

| Skill | Description | Use When |
|-------|-------------|----------|
| `/work-chronicler-setup-slack` | Choose the Slack channels messages may be imported from, and record them with `work-chronicler slack` | Before the first Slack import, or to change the channel list |
| `/work-chronicler-import-slack` | Import the subject's own messages from those channels with `validate` and `import` | After setup, and again whenever you want newer messages |

---

## Google Docs Import Skill

A skill that brings the Google Docs you own (or, in a manager profile, a
report's Docs shared with you) into the work log as supplementary evidence.
It works in IC and manager profiles and needs the `gog` command-line tool,
signed in to your Google account:

| Skill | Description | Use When |
|-------|-------------|----------|
| `/work-chronicler-import-google-docs` | Import an excerpt of each Google Doc the subject owns, modified in the fetch range, with `validate` and `import` | After `google-docs configure`, and again whenever you want newer Docs |

---

## Skill Details

### Writing Peer Reviews

**Skill**: `/work-chronicler-write-peer-review`

The most flexible skill - supports both quick one-off reviews and comprehensive evidence-based reviews.

#### Quick Mode (No Setup Required)

For writing one-off peer reviews without creating a report:

**Usage:**
```
/work-chronicler-write-peer-review
```

**Interactive flow:**
1. Asks: "Is this a quick peer review, or would you like to add them as a report?"
2. Choose "Quick peer review"
3. Enter colleague's name
4. Paste company template (or use standard competencies)
5. Answer rating questions interactively (Rarely/Sometimes/Consistently)
6. Provide specific examples for each rating
7. Add any additional feedback

**Output:**
- Saved to: `<profile>/outputs/peer-review-{name}-{date}.md`
- Synthesized prose (not bullet lists)
- First-person language ("I observed", "Working with them")

**Example:**

```
You: /work-chronicler-write-peer-review

Skill: Is this a quick peer review, or would you like to add them as a report?
You: Quick peer review

Skill: What is the person's name?
You: Alice Smith

Skill: Does your company provide a peer review template?
You: [Paste template with Rarely/Sometimes/Consistently questions]

Skill: Let's go through each question...
      "They easily adapt to change" - How would you rate this?
You: Consistently

Skill: Would you like to share specific examples?
You: Yes, during the auth migration we pivoted mid-sprint and she...

[Continues through all questions, then generates:]

# Peer Review: Alice Smith
...
Alice consistently adapts to change with professionalism. For example,
when we pivoted our auth migration approach mid-sprint, she quickly
adjusted her implementation and helped onboard others...
```

#### Full Mode (With Supporting Data)

For ongoing peer relationships where you want to track notes and evidence:

**Setup:**
```bash
# Add colleague as a report (even if not your direct report)
work-chronicler init --mode manager  # If not in manager mode
work-chronicler reports add "Alice Smith"

# Add supporting data
echo "Observations about Alice..." > reports/alice-smith/notes/collaboration.md

# Optional: fetch their work-log
work-chronicler fetch github --report alice-smith
```

**Usage:**
```
/work-chronicler-write-peer-review alice-smith
```

**Output:**
- Saved to: `<manager-root>/reports/alice-smith/outputs/peer-review-{date}.md`
- References notes, work-log data, past reviews
- Evidence-based with specific PR/ticket citations

#### Template Support

**Common template formats:**

```
They easily adapt to change.
□ Rarely  □ Sometimes  □ Consistently

They welcome perspectives different from their own.
□ Rarely  □ Sometimes  □ Consistently

[etc.]

Additional feedback: [open text]
```

The skill:
1. Parses template questions
2. Collects ratings and examples interactively
3. Synthesizes into narrative prose (not bullet lists)
4. Groups strengths together, growth areas separately
5. Uses specific examples to make feedback concrete

**Good synthesis example:**

❌ **Don't do this:**
```
- Adapts to change: Consistently
- Welcomes perspectives: Sometimes
```

✅ **Do this:**
```
Alice consistently demonstrates strong adaptability. When we pivoted
our auth migration approach mid-sprint, she quickly adjusted her
implementation without complaint and helped onboard others.

In terms of collaboration, Alice sometimes struggles to welcome
perspectives different from her own. During design reviews, I've
noticed she can be defensive initially, though she generally comes
around after discussion.
```

---

### Writing Performance Reviews

**Skill**: `/work-chronicler-manager-write-review-packet`

Generate evidence-based performance reviews for direct reports.

**Requirements:**
- Manager mode enabled
- Report added and data fetched
- Analysis generated (recommended)

**Usage:**
```
/work-chronicler-manager-write-review-packet alice-smith Q4-2025
```

**What it does:**
1. Reads supporting documents:
   - `performance-reviews/` - Past reviews for format/context
   - `peer-reviews/` - Peer feedback for collaboration insights
   - `notes/` - Manager notes about goals and focus areas
2. Reads analysis files:
   - `stats.json` - Impact distribution
   - `projects.json` - Major project groupings
   - `timeline.json` - Activity trends
3. Focuses on flagship and major impact work
4. Cross-references PRs with ticket context
5. Generates structured review with:
   - Key accomplishments (with evidence)
   - Technical growth
   - Collaboration & leadership
   - Alignment with goals
   - Areas for growth

**Output:**
- Saved to: `reports/{id}/outputs/review-packet-{date}.md`
- Evidence-based with specific PR/ticket citations
- Matches format of past reviews (if provided)
- No rankings/scoring (per roadmap requirements)

---

### Summarizing Work

**Skill**: `/work-chronicler-summarize-work`

Summarize your work for a specific time period.

**Usage:**
```
/work-chronicler-summarize-work 2025-Q4
/work-chronicler-summarize-work --since 2025-10-01 --until 2025-12-31
```

**What it does:**
1. Reads PRs and tickets from specified period
2. Groups by projects (if analysis exists)
3. Highlights flagship and major impact work
4. Summarizes in bullet points or prose

**Output:**
- Concise summary of accomplishments
- Organized by project or theme
- Includes metrics (LOC, PRs merged, tickets closed)
- Suitable for 1:1s, updates, or review prep

---

### Resume & Career Documents

#### Write Resume Bullets

**Skill**: `/work-chronicler-write-resume-bullets`

Create achievement-focused resume bullet points from your work.

**Usage:**
```
/work-chronicler-write-resume-bullets 2025
```

**What it does:**
1. Analyzes flagship and major PRs
2. Extracts business impact from ticket descriptions
3. Creates bullet points with:
   - Action verb ("Led", "Implemented", "Optimized")
   - What you did
   - Measurable impact
   - Technologies used

**Example output:**
```
- Led auth migration for 30 Eater sites with complex Fastly VCL routing,
  supporting multiple environments (production, staging, QA) and enabling
  successful brand launch

- Implemented infrastructure separation for Polygon brand, delivering
  isolated AWS deployment in <1 week to enable $X acquisition

- Optimized GraphQL query performance, reducing API response time by 40%
  and improving Core Web Vitals across 180 SB Nation sites
```

#### Update Existing Resume

**Skill**: `/work-chronicler-update-resume`

Update your existing resume with recent accomplishments.

**Usage:**
```
/work-chronicler-update-resume path/to/resume.md --since 2025-01-01
```

**What it does:**
1. Reads your existing resume
2. Analyzes recent work (since date)
3. Suggests new bullet points to add
4. Maintains your resume's format and style
5. Identifies outdated bullets to remove/update

---

### Importing Slack Messages

**Skills**: `/work-chronicler-setup-slack`, then `/work-chronicler-import-slack`

The CLI never contacts Slack. These skills read Slack through your
assistant's Slack connector, read-only: they never post, react or change
anything there. The CLI stores the settings and checks every record on import
(see [Slack](commands.md#slack) and [Slack records](commands.md#slack-records)).

**Setup** (`/work-chronicler-setup-slack`, once per IC profile or report):
1. Finds the workspace (its team ID if a Slack tool shows one, otherwise its
   URL label from a permalink, such as `example` for `example.slack.com`)
   and the subject's Slack user ID, and runs `slack configure`.
2. Lists your public channels and asks which hold review-relevant work.
   Private channels are offered only if you opt in; direct messages and
   group DMs never are.
3. In a manager profile, offers only channels you share with the report: it
   checks the report is a member before passing `--shared-with-manager`.
4. Records a one-line reason per channel with `slack channels add`.

**Import** (`/work-chronicler-import-slack`):
1. Reads `slack show --json` and stops if Slack is not set up.
2. Searches one day at a time for messages the subject wrote in the
   profile's fetch range (private channels only with your consent), without
   reading threads or other people's replies, and keeps only those from
   importable channels. A day with more results than one Slack search
   returns (400) is searched again channel by channel.
3. Writes one record per message (the subject's own text; a reply keeps only
   its parent's ID and link) to a temporary staging directory, runs
   `validate`, then `import`, and deletes the directory.
4. Reports counts only. Running it again updates the same records and never
   duplicates them.

**Manager mode:**
```
/work-chronicler-setup-slack alice-smith
/work-chronicler-import-slack alice-smith
```
Only channels you and the report both belong to are used, and records go to
`reports/alice-smith/work-log/messages/`.

---

### Importing Google Docs

**Skill**: `/work-chronicler-import-google-docs`

The CLI never contacts Google. The skill reads Drive with `gog`, read-only
(`--readonly`): it never edits a Doc, changes sharing or requests access. Set
up the owner account first with `google-docs configure --account <email>`
(see [Google Docs](commands.md#google-docs) and
[Google Docs records](commands.md#google-docs-records)).

1. Reads `google-docs show --json` and stops if Google Docs is not set up.
   It imports Docs modified in the profile's fetch range, or in another range
   you confirm in the session (passed to `validate` and `import` as
   `--since`/`--until`).
2. Lists the Google Docs the configured account owns that were modified in
   that range, page by page to the end. In an IC profile it reads as that
   account (`gog --account`); a Doc only shared with you is never yours.
3. Checks each Doc's owners, type and modified time, reads its text, and
   writes one record per Doc with an excerpt of at most 16 KiB of the Doc's
   own text (marked `truncated` when cut), never a summary. Docs it cannot
   read are skipped and counted; empty Docs are counted and not stored.
4. Runs `validate`, then `import`, in chunks of at most 500 records, and
   deletes its temporary directories.
5. Reports counts only (listed, staged, imported, skipped or refused by
   reason), and says the import is incomplete when the listing or a chunk
   failed. Running it again updates the same records and never duplicates
   them.

**Manager mode:**
```
work-chronicler google-docs configure --report alice-smith --account alice@example.com
/work-chronicler-import-google-docs alice-smith
```
The skill reads as you, so it sees only the report's Docs that are shared
with you. Records go to `reports/alice-smith/work-log/documents/`.

---

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
- **IC mode**: Read from `<profile>/work-log/`, `<profile>/analysis/`
- **Manager mode**: Detect report context, read from `reports/{id}/work-log/`, etc.
- **Active profile**: Use current profile set via `profile switch` or `WORK_CHRONICLER_PROFILE`

### Data Sources

Skills read from:
1. **work-log/** - PRs and tickets (markdown with YAML frontmatter), imported messages in `messages/` and imported Google Docs in `documents/`
2. **analysis/** - Generated JSON (stats, projects, timeline)
3. **notes/** - User-added context
4. **performance-reviews/** - Past reviews
5. **peer-reviews/** - Peer feedback
6. **resumes/** - Existing resume files

---

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

### Peer Review Tips

**For quick reviews:**
- Have specific examples ready
- Think about 2-3 key projects you collaborated on
- Balance positive and constructive feedback

**For comprehensive reviews:**
- Add notes over time (after collaboration, meetings)
- Reference specific PRs if you have work-log data
- Read past peer reviews to maintain consistency

**Interactive mode:**
- Don't just say "Consistently" - provide examples
- Be specific: "During the auth migration..." not "They're good at their job"
- Use first person: "I observed", "Working with them", "In my experience"

### Manager Workflow

**Quarterly review prep:**
1. Fetch data: set `fetch.since` in the profile config, then `fetch all --all-reports`
2. Add context: Upload past reviews, update notes
3. Generate: `/work-chronicler-manager-write-review-packet {id} Q1-2026`
4. Review and refine
5. Save to `reports/{id}/performance-reviews/` for next cycle

**Peer review requests:**
1. Quick mode for one-offs
2. Full mode if you collaborate regularly and want to track notes

### Resume Best Practices

**Optimize for ATS and humans:**
- Use action verbs (Led, Implemented, Optimized, Delivered)
- Include metrics and impact
- Mention technologies/tools
- Focus on flagship and major work (skip minor PRs)

**Update regularly:**
- Run skills quarterly to capture recent work
- Keep resume in `resumes/` directory for skills to reference
- Archive old bullets to `resumes/archive/`

---

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

---

## Next Steps

- **Install skills**: `work-chronicler skills install`
- **Try a skill**: Start with `/work-chronicler-summarize-work` for a quick summary
- **Read more**:
  - [Manager Mode Guide](manager-mode.md) - Using manager mode features
  - [README.md](../README.md) - overview and quick start
  - [Command reference](commands.md) - every CLI command and flag
  - [AGENTS.md](../AGENTS.md) - Project structure and development

---

**Questions or feedback?** Open an issue at [github.com/tkstang/work-chronicler](https://github.com/tkstang/work-chronicler)
