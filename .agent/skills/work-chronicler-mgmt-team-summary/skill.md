---
name: work-chronicler-mgmt-team-summary
description: Generate team-level overview aggregating work across all reports. Useful for leadership updates and calibration meetings. Shows collaboration patterns and team-wide trends without individual comparisons.
user-invocable: true
---

# Team Summary (Manager Mode)

Generate team-level overview aggregating work across all direct reports, useful for leadership updates, calibration meetings, and team retrospectives.

## Manager Mode Only

**This skill requires manager mode.** Verify with: `work-chronicler workspace profile`

If not in manager mode, run `work-chronicler init --mode manager` first.

## Workspace

**Active profile:** !`work-chronicler workspace profile`
**Manager root:** !`work-chronicler workspace root`

> **For non-Claude tools:** Run `work-chronicler workspace root` to get your manager profile path.

## User Input

**Optional:**
- **Time period**: The period to summarize (e.g., "Q1-2026", "2025", "last-6-months")
  - If omitted, summarizes all available data
- **Focus areas**: Specific projects, themes, or initiatives to emphasize

**Example invocations:**
- `/work-chronicler-mgmt-team-summary Q1-2026`
- `/work-chronicler-mgmt-team-summary 2025`
- `/work-chronicler-mgmt-team-summary` (all time)
- `/work-chronicler-mgmt-team-summary last-6-months focus on platform initiatives`

## Data Location

Manager mode team-level data:

```
<manager-root>/
├── analysis/                      # Team-level aggregations
│   ├── team-projects.json         # All projects across team
│   ├── contributor-matrix.json    # Who worked on which projects
│   └── team-timeline.json         # Team activity rollup
└── reports/
    └── <report-id>/
        └── analysis/
            ├── stats.json         # Individual stats (for aggregation)
            ├── projects.json      # Individual projects
            └── timeline.json      # Individual timeline
```

## Instructions

1. **Read team-level analysis**:
   - `team-projects.json` - All projects across the team
   - `contributor-matrix.json` - Collaboration patterns (who worked with whom)
   - `team-timeline.json` - Team-wide activity trends

2. **Aggregate individual stats** (if needed for additional context):
   - Read each report's `analysis/stats.json`
   - Aggregate impact distribution (flagship, major, standard counts)
   - Calculate team-wide totals (PRs, tickets, repos touched)

3. **Filter by time period** (if specified):
   - Parse time period (e.g., "Q1-2026" → Jan 1 - Mar 31, 2026)
   - Filter projects and timeline data to that range
   - Focus only on work within the specified period

4. **Identify patterns**:
   - Cross-team collaboration (projects with multiple contributors)
   - Key initiatives and their contributors
   - Activity trends (busiest periods, focus shifts)
   - Impact distribution across the team

5. **Focus on team dynamics**:
   - How the team works together
   - Major initiatives and their outcomes
   - Areas of focus and expertise
   - Collaboration effectiveness

## Output Location

Save generated documents to:
```
<manager-root>/outputs/team-summary-YYYY-MM-DD.md
```

Or if time period specified:
```
<manager-root>/outputs/team-summary-Q1-2026.md
```

## Output Format

```markdown
## Team Summary: [Team Name or Org] - [Period]

### Team Overview
- **Team size**: [number] direct reports
- **Period**: [date range or "all time"]
- **Repositories**: [count] across [org]

### Key Projects & Initiatives

#### [Project Name]
- **Description**: [What was built/accomplished]
- **Contributors**: [List names, not as comparison but as collaboration]
- **Impact**: [Business value or outcome]
- **Status**: [Completed/In Progress/etc.]

#### [Project Name]
- **Description**: [What was built/accomplished]
- **Contributors**: [List names]
- **Impact**: [Business value or outcome]
- **Status**: [Completed/In Progress/etc.]

### Collaboration Patterns
- [Cross-team initiatives that involved multiple reports working together]
- [Knowledge sharing or mentorship patterns observed]
- [Areas where collaboration was particularly effective]

### Activity Trends
- **Total PRs**: [count]
- **Total Tickets**: [count]
- **Impact distribution**: [flagship: X, major: Y, standard: Z]
- **Busiest periods**: [from timeline data]
- **Primary focus areas**: [themes or domains]

### Team Strengths
[What the team does particularly well, based on the work patterns]

### Areas of Focus
[Current or recent areas where the team is concentrating effort]

### Notable Wins
[Significant achievements worth calling out for leadership visibility]
```

## Use Cases

This skill is optimized for:
- **Leadership skip-levels**: Provide visibility to senior leadership
- **Calibration meetings**: Context for discussing the team as a whole
- **Quarterly retrospectives**: Reflect on team accomplishments
- **Resource planning**: Understand team capacity and focus areas
- **Team health checks**: Identify collaboration patterns and engagement

## Critical Constraints

**Per roadmap requirements - THESE ARE MANDATORY:**
- ✅ Team-level patterns and trends
- ✅ Collaboration effectiveness
- ✅ Aggregate impact distribution
- ✅ Project-oriented narratives
- ❌ **NO individual rankings**
- ❌ **NO individual scoring**
- ❌ **NO individual comparisons**
- ❌ **NO "top performer" or similar language**

This is a TEAM summary, not a leaderboard. Focus on how the team works together and what the team accomplished.

## Important Notes

### Listing Contributors
When listing who worked on a project:
- **Do**: "Contributors: Alice, Bob, Charlie worked together on this initiative"
- **Do**: "This was a cross-team effort with Alice leading frontend and Bob handling backend"
- **Don't**: "Alice contributed the most" or "Bob's work was critical while others supported"
- **Don't**: Any language that implies ranking or comparison

### Aggregate Stats
When showing aggregate numbers:
- **Do**: "The team merged 150 PRs this quarter, with 20 flagship-level initiatives"
- **Do**: "Impact distribution: 20 flagship, 45 major, 85 standard"
- **Don't**: "Alice had the most PRs" or "Bob had the highest impact ratio"
- **Don't**: Individual breakdowns unless specifically showing collaboration patterns

### Collaboration Language
Focus on:
- Projects that brought people together
- Knowledge sharing across the team
- How different expertise combined for outcomes
- Cross-functional work patterns

## Tips

- Use project names and initiatives as organizing principles
- Highlight team accomplishments, not individual stars
- Perfect for showing leadership what the team is accomplishing
- Can identify gaps or opportunities for the team as a whole
- Useful for understanding team capacity and velocity trends
- Great for quarterly team retros to celebrate collective wins
