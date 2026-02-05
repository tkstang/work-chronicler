---
name: work-chronicler-mgmt-write-review-packet
description: Generate evidence-based performance review content for a specific direct report. Analyzes report's work history to create structured review narratives with PR/ticket citations.
user-invocable: true
disable-model-invocation: true
---

# Write Review Packet (Manager Mode)

Generate evidence-based performance review content for a specific direct report.

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

**Optional:**
- **Review period**: The time range to focus on (e.g., "Q4 2025", "2025 annual review")
- **Review template/questions**: If your company provides specific prompts to answer
- **Focus areas**: Specific themes or projects to emphasize

**Example invocations:**
- `/work-chronicler-mgmt-write-review-packet alice-smith Q4-2025`
- `/work-chronicler-mgmt-write-review-packet bob-jones 2025-annual, here are the review questions: [paste questions]`

If the user provides a specific review template or questions, prioritize answering those over the default structure below.

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
        │   ├── stats.json         # Impact breakdown, repo stats
        │   ├── projects.json      # Detected project groupings
        │   └── timeline.json      # Chronological view
        ├── performance-reviews/   # IMPORTANT: Past reviews for format/context
        ├── peer-reviews/          # IMPORTANT: Peer feedback for collaboration insights
        ├── notes/                 # IMPORTANT: Manager notes about goals, focus areas
        └── outputs/               # Generated documents
```

## Instructions

1. **Validate report ID**:
   - Confirm report exists in manager config
   - Use exact report ID provided by user
   - If invalid, show available reports via `work-chronicler reports list`

2. **Read supporting documents first** (critical for context):
   - `performance-reviews/` - Match format, tone, and understand what's valued
   - `peer-reviews/` - Collaboration effectiveness, how report is perceived by colleagues
   - `notes/` - Manager's notes about goals, focus areas, and themes to emphasize
   - These provide essential context for consistent, well-informed reviews

3. **Read analysis files**:
   - `stats.json` - Overall impact distribution, repo stats
   - `projects.json` - Major project groupings (focus on high confidence)
   - `timeline.json` - Activity trends, busiest periods

4. **Focus on flagship and major impact work**:
   - These represent the most significant contributions
   - Cross-reference with ticket summaries for business context
   - Group related work into narrative themes

5. **Structure for performance review**:
   - **Accomplishments**: What was delivered, with quantifiable impact
   - **Impact**: How it helped the team, product, or business
   - **Growth**: Skills developed, challenges overcome
   - **Collaboration**: Cross-team work, mentorship, knowledge sharing (reference peer reviews)
   - **Goals**: How work aligned with or exceeded goals (reference notes)

## Output Location

Save generated documents to:
```
<manager-root>/reports/<report-id>/outputs/review-packet-YYYY-MM-DD.md
```

Use the exact report ID (e.g., `alice-smith`) in the path.

## Output Format

Structure depends on company format (from past reviews). If no past reviews exist, use this structure:

```markdown
## Performance Review: [Report Name] - [Review Period]

### Summary
[2-3 sentence overview of key accomplishments and impact]

### Key Accomplishments

#### [Project/Theme 1]
**What they did**: [Description of work]
**Impact**: [Measurable outcomes, business value]
**Evidence**: [PR/ticket citations]

#### [Project/Theme 2]
**What they did**: [Description of work]
**Impact**: [Measurable outcomes, business value]
**Evidence**: [PR/ticket citations]

### Technical Growth
- [Skills developed or deepened]
- [New technologies or practices adopted]
- [Technical challenges overcome]

### Collaboration & Leadership
- [Cross-team initiatives]
- [Mentorship or knowledge sharing]
- [Process improvements]
- [Peer feedback themes]

### Alignment with Goals
[How work aligned with or exceeded stated goals from manager notes]

### Areas for Growth
[Development opportunities, stretch areas for next period]

### Looking Ahead
[Future focus areas, upcoming challenges]
```

## Important Constraints

**Per roadmap requirements:**
- ✅ Evidence-based summaries only
- ❌ No rankings
- ❌ No scoring
- ❌ No comparisons with other team members

Focus on the individual's contributions, growth, and impact with specific evidence.

## Tips

- Match the tone and format of previous performance reviews if available
- Use specific numbers and metrics when possible
- Connect technical work to business outcomes
- Highlight work that demonstrates growth from previous feedback
- Be specific about THIS PERSON's contribution vs team work
- Include both planned work and unplanned wins (incidents handled, etc.)
- Reference peer reviews for collaboration effectiveness
- Use manager notes to emphasize goal alignment
- Reference the timeline for seasonal patterns (launches, migrations, etc.)
