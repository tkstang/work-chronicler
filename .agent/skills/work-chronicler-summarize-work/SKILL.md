---
name: work-chronicler-summarize-work
description: Use when preparing for performance reviews, 1:1s, or summarizing accomplishments. Reads PRs and tickets from work-chronicler workspace.
user-invocable: true
disable-model-invocation: true
---

# Summarize Work

Summarize the user's work history from their work-chronicler data.

## Workspace

**Active profile:** !`work-chronicler workspace profile`
**Work log:** !`work-chronicler workspace work-log`
**Analysis:** !`work-chronicler workspace analysis`

> **For non-Claude tools:** Run `work-chronicler workspace work-log` to get your data path.

## Data Location

Work data is stored in the workspace work-log directory:

```
<work-log>/
├── filtered/               # ⭐ USE THIS IF IT EXISTS (pre-filtered subset)
│   ├── .analysis/
│   ├── pull-requests/
│   └── jira/
├── .analysis/
│   ├── stats.json      # Impact breakdown, repo stats, PR/ticket counts
│   ├── projects.json   # Detected project groupings
│   └── timeline.json   # Chronological view by week/month
├── pull-requests/
│   └── <org>/<repo>/*.md
└── jira/
    └── <org>/<project>/*.md
```

**Important**: If `filtered/` exists, use it instead of the main directories. This contains a pre-filtered subset of significant work.

## Instructions

1. **Start with analysis files** (preferred - already computed):
   - `stats.json` - Overall stats, impact breakdown, repo/project counts
   - `timeline.json` - Activity by week/month with impact distribution
   - `projects.json` - Detected project groupings with confidence levels

2. **Read PR/ticket files** for details:
   - PRs have frontmatter: title, prNumber, repository, state, additions, deletions, impact (flagship/major/standard/minor), jiraTickets
   - Tickets have frontmatter: key, summary, project, issueType, status, linkedPRs

3. **Check for supporting documents** (optional context):
   - `performance-reviews/` - Past reviews for format/context
   - `resumes/` - Existing resume for tone
   - `notes/` - User's own notes and goals

## Summary Structure

Generate a summary including:
- **Overview**: Date range, total PRs/tickets, impact distribution
- **By Repository**: PR counts and lines changed per repo
- **By Impact**: Flagship and major work highlighted
- **Major Projects**: From projects.json (high confidence first)
- **Timeline**: Busiest periods, activity trends
- **Notable Contributions**: Largest PRs, most complex changes

## Example Output

```markdown
## Work Summary

### Overview
- **Period**: January 2025 - December 2025
- **Total PRs**: 274 (78 flagship, 50 major, 58 standard, 88 minor)
- **Total JIRA Tickets**: 72
- **PRs linked to tickets**: 31

### Impact Highlights

**Flagship Work** (28% of PRs):
- Platform migration to new authentication system
- Complete redesign of data pipeline architecture
- Multi-region deployment infrastructure

**Major Features** (18% of PRs):
- User dashboard overhaul
- API rate limiting implementation
- Search functionality rewrite

### Top Repositories
1. voxmedia/duet: 206 PRs (+45,000 / -12,000 lines)
2. voxmedia/honeycomb: 63 PRs (+8,500 / -2,100 lines)

### Activity Timeline
- Busiest month: August 2025 (41 PRs)
- Busiest week: Aug 4-10, 2025 (19 PRs)

### Key Projects (High Confidence)
1. **Authentication Overhaul** - 5 PRs, 4 tickets
2. **Eater App Migration** - 4 PRs, 3 tickets
```

## Tips

- Flagship/major PRs are the most important to highlight
- Use projects.json confidence levels (high > medium > low)
- Cross-reference timeline.json for temporal context
- Look for patterns in ticket prefixes to identify initiatives
