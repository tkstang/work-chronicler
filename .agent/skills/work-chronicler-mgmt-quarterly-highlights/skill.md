---
name: work-chronicler-mgmt-quarterly-highlights
description: Generate concise quarterly highlight summaries for a specific direct report. Useful for 1:1s, check-ins, and calibration prep.
user-invocable: true
disable-model-invocation: true
---

# Quarterly Highlights (Manager Mode)

Generate concise quarterly highlight summaries for a specific direct report, useful for 1:1 conversations, check-ins, and calibration prep.

## Manager Mode Only

**This skill requires manager mode.** Verify with: `work-chronicler workspace profile`

If not in manager mode, run `work-chronicler init --mode manager` first.

## Workspace

**Active profile:** !`work-chronicler workspace profile`
**Manager root:** !`work-chronicler workspace root`

> **For non-Claude tools:** Run `work-chronicler workspace root` to get your manager profile path.

## User Input

**Required:**
- **Report ID**: The kebab-case report identifier (e.g., "alice-smith")
  - See available reports: `work-chronicler reports list`
- **Quarter**: The quarter to summarize (e.g., "Q1-2026", "Q4-2025")

**Optional:**
- **Focus areas**: Specific themes or projects to emphasize

**Example invocations:**
- `/work-chronicler-mgmt-quarterly-highlights alice-smith Q1-2026`
- `/work-chronicler-mgmt-quarterly-highlights bob-jones Q4-2025 focus on platform work`

## Data Location

Manager mode data structure:

```
<manager-root>/
└── reports/
    └── <report-id>/
        ├── work-log/
        │   ├── pull-requests/
        │   │   └── <org>/<repo>/*.md
        │   └── jira/
        │       └── <org>/<project>/*.md
        ├── analysis/
        │   ├── stats.json         # Impact breakdown for filtering
        │   ├── projects.json      # Project groupings
        │   └── timeline.json      # Filter by quarter here
        ├── notes/                 # Manager context
        └── outputs/               # Generated documents
```

## Instructions

1. **Validate inputs**:
   - Confirm report ID exists in manager config
   - Parse quarter (e.g., "Q1-2026" → Jan 1 - Mar 31, 2026)
   - If invalid, show available reports via `work-chronicler reports list`

2. **Filter timeline data**:
   - Read `timeline.json` and filter to the specified quarter
   - Identify weeks that fall within the quarter date range
   - Focus on this period's activity only

3. **Identify top work**:
   - From filtered timeline, identify flagship and major impact PRs
   - Read the actual PR markdown files for these top items
   - Extract titles, descriptions, and business context

4. **Group by themes**:
   - Use `projects.json` to group related work
   - Identify 3-5 key accomplishments for the quarter
   - Focus on highest impact and most visible work

5. **Keep it concise**:
   - This is NOT a full review packet
   - Aim for 1-2 pages maximum
   - Top 3-5 accomplishments with brief evidence
   - Quick snapshot format for conversations

## Output Location

Save generated documents to:
```
<manager-root>/reports/<report-id>/outputs/highlights-Q1-2026.md
```

Use the exact report ID and quarter in the filename.

## Output Format

```markdown
## Quarterly Highlights: [Report Name] - [Quarter]

### Summary
[2-3 sentence overview of the quarter's work]

### Top Accomplishments

#### 1. [Project/Initiative Name]
- **What**: [Brief description]
- **Impact**: [Business value or outcome]
- **Evidence**: [Key PR or ticket]

#### 2. [Project/Initiative Name]
- **What**: [Brief description]
- **Impact**: [Business value or outcome]
- **Evidence**: [Key PR or ticket]

#### 3. [Project/Initiative Name]
- **What**: [Brief description]
- **Impact**: [Business value or outcome]
- **Evidence**: [Key PR or ticket]

### Key Projects
- [Project A]: [Brief contribution summary]
- [Project B]: [Brief contribution summary]

### Notable Collaboration
[Any significant cross-team work or collaboration worth highlighting]

### Activity Snapshot
- PRs merged: [count]
- Flagship/Major work: [count]
- Primary focus areas: [list 2-3 themes]
```

## Use Cases

This skill is optimized for:
- **Mid-quarter check-ins**: Quick progress review in 1:1s
- **Calibration prep**: Concise summary for calibration discussions
- **Skip-level updates**: Brief overview for leadership
- **Performance conversations**: Quick reference for accomplishments

## Key Difference from Review Packet

- **Review Packet** (`work-chronicler-mgmt-write-review-packet`): Comprehensive, formal review content (5-10 pages)
- **Quarterly Highlights** (this skill): Concise summary (1-2 pages) for conversations

Use this skill for quick summaries, use review packet for formal reviews.

## Important Constraints

**Per roadmap requirements:**
- ✅ Evidence-based summaries only
- ❌ No rankings
- ❌ No scoring
- ❌ No comparisons with other team members

Focus on the individual's accomplishments with specific evidence.

## Tips

- Keep descriptions brief and high-level
- Focus on business impact, not technical details
- Perfect for preparing for 1:1 conversations
- Can generate multiple quarters to track progress over time
- Use manager notes to emphasize goal alignment if relevant
