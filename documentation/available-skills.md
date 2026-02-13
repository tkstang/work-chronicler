# Available AI Skills

work-chronicler includes AI skills that integrate with Claude Code, Cursor, Codex, and Gemini to help you analyze your work history, write performance reviews, and create career documents.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Individual Contributor (IC) Skills](#individual-contributor-ic-skills)
- [Manager Mode Skills](#manager-mode-skills)
- [Skill Details](#skill-details)
  - [Writing Peer Reviews](#writing-peer-reviews)
  - [Writing Performance Reviews](#writing-performance-reviews)
  - [Summarizing Work](#summarizing-work)
  - [Resume & Career Documents](#resume--career-documents)
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

### Prerequisites

Before using skills, you need data:

```bash
# 1. Fetch your work history
work-chronicler fetch all

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
| `/work-chronicler-generate-resume-bullets` | Create achievement-focused resume bullet points | Updating your resume with recent work |
| `/work-chronicler-update-resume` | Update existing resume with new accomplishments | You have a resume and want to add recent work |
| `/work-chronicler-write-self-review` | Draft self-review content for performance reviews | Performance review time, need to write self-assessment |
| `/work-chronicler-detect-projects` | Identify major project groupings from work history | Understanding how your work clusters into initiatives |
| `/work-chronicler-detect-themes` | Find recurring themes for career narrative | Building career story, identifying strengths |

---

## Manager Mode Skills

Skills for managers tracking multiple reports:

| Skill | Description | Use When |
|-------|-------------|----------|
| `/work-chronicler-mgmt-write-review-packet` | Generate evidence-based performance review for a direct report | Writing quarterly/annual reviews for reports |
| `/work-chronicler-mgmt-write-peer-review` | Write peer reviews for colleagues | Peer review time, 360 reviews, colleague feedback |
| `/work-chronicler-mgmt-quarterly-highlights` | Create concise quarterly summary for 1:1s and calibration | Preparing for 1:1s, calibration meetings, updates |
| `/work-chronicler-mgmt-team-summary` | Generate team-level overview for leadership | Leadership updates, calibration prep, team visibility |

---

## Skill Details

### Writing Peer Reviews

**Skill**: `/work-chronicler-mgmt-write-peer-review`

The most flexible skill - supports both quick one-off reviews and comprehensive evidence-based reviews.

#### Quick Mode (No Setup Required)

For writing one-off peer reviews without creating a report:

**Usage:**
```
/work-chronicler-mgmt-write-peer-review
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
You: /work-chronicler-mgmt-write-peer-review

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
work-chronicler reports add alice-smith --skip-fetch

# Add supporting data
echo "Observations about Alice..." > reports/alice-smith/notes/collaboration.md

# Optional: fetch their work-log
work-chronicler fetch github --report alice-smith
```

**Usage:**
```
/work-chronicler-mgmt-write-peer-review alice-smith
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

**Skill**: `/work-chronicler-mgmt-write-review-packet`

Generate evidence-based performance reviews for direct reports.

**Requirements:**
- Manager mode enabled
- Report added and data fetched
- Analysis generated (recommended)

**Usage:**
```
/work-chronicler-mgmt-write-review-packet alice-smith Q4-2025
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

#### Generate Resume Bullets

**Skill**: `/work-chronicler-generate-resume-bullets`

Create achievement-focused resume bullet points from your work.

**Usage:**
```
/work-chronicler-generate-resume-bullets 2025
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
1. **work-log/** - PRs and tickets (markdown with YAML frontmatter)
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
1. Fetch data: `fetch all --all-reports --since YYYY-MM-DD`
2. Add context: Upload past reviews, update notes
3. Generate: `/work-chronicler-mgmt-write-review-packet {id} Q1-2026`
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
  - [README.md](../README.md) - CLI reference and setup
  - [AGENTS.md](../AGENTS.md) - Project structure and development

---

**Questions or feedback?** Open an issue at [github.com/tkstang/work-chronicler](https://github.com/tkstang/work-chronicler)
