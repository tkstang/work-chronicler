---
name: work-chronicler-detect-projects
description: Use when analyzing work history to identify major projects and group related PRs and tickets together.
user-invocable: true
disable-model-invocation: true
---

# Detect Projects

Analyze work history to identify major projects and group related work.

## Workspace

**Active profile:** !`work-chronicler workspace profile`
**Work log:** !`work-chronicler workspace work-log`
**Analysis:** !`work-chronicler workspace analysis`

> **For non-Claude tools:** Run `work-chronicler workspace work-log` to get your data path.

**Note**: Project detection is now built into the CLI. Run `work-chronicler analyze --projects` to generate `projects.json`. This skill is for reviewing and refining those results.

## Data Location

```
<work-log>/
├── filtered/               # ⭐ USE THIS IF IT EXISTS (pre-filtered subset)
│   ├── .analysis/
│   ├── pull-requests/
│   └── jira/
├── .analysis/
│   ├── projects.json   # Pre-computed project groupings (use this first!)
│   ├── stats.json      # Impact breakdown, repo stats
│   └── timeline.json   # Chronological view
├── pull-requests/
│   └── <org>/<repo>/*.md
└── jira/
    └── <org>/<project>/*.md
```

## Instructions

1. **Start with projects.json** (if it exists):
   - Contains pre-detected project groupings
   - Has confidence levels: high, medium, low
   - High confidence = PRs share JIRA ticket references
   - Low confidence = time-based clustering (may need refinement)

2. **Review and refine groupings**:
   - Merge related projects that were detected separately
   - Split projects that are too broad
   - Add context from ticket summaries and PR descriptions
   - Identify themes across projects

3. **For manual detection** (if projects.json doesn't exist):
   - Look for shared JIRA ticket references across PRs
   - Check ticket prefixes (e.g., AUTH-*, PERF-*)
   - Consider temporal clustering (work in same 2-4 week period)
   - Use PR labels and repository patterns

## Output Location

**IMPORTANT:** You must do BOTH of the following:

1. **Respond in-thread** with the project summary (for immediate feedback and MCP integration)
2. **Save to file**: `<profile-root>/outputs/projects-detected-YYYY-MM-DD.md`

Get the profile root with: `work-chronicler workspace root`

This ensures users have both immediate feedback AND a persistent file they can reference later.

## Project Summary Format

For each project, gather:
- Name/theme (from primary ticket or inferred)
- Time period (earliest to latest PR)
- Related PRs and tickets
- Total scope (lines changed, PR count)
- Impact level distribution
- Key outcomes or deliverables

## Example Output

```markdown
## Detected Projects

### 1. Authentication Overhaul (High Confidence)
**Period**: January - March 2025
**Scope**: 5 PRs, 4 tickets, +5,200 / -1,800 lines
**Impact**: 3 flagship, 2 major

**Tickets**:
- DWP-575: Add cursor command for creating jira ticket
- DWP-576: Create honeycomb-env package
- DWP-577: Refactor helm charts
- DWP-578: Update deployment scripts

**Key Deliverables**:
- OAuth2 integration with multiple providers
- TOTP-based MFA support
- Secure session handling with refresh tokens

---

### 2. Performance Optimization (High Confidence)
**Period**: April - June 2025
**Scope**: 8 PRs, 3 tickets, +3,100 / -900 lines
**Impact**: 2 flagship, 4 major, 2 standard

**Tickets**:
- DWP-463: Eater app lambda optimization
- DWP-529: Caching layer implementation
- DWP-530: Database query optimization

**Key Deliverables**:
- 73% reduction in API latency
- 60% reduction in database load

---

### 3. Unrelated Work Cluster (Low Confidence - Needs Review)
**Period**: July 2025
**Scope**: 12 PRs, 0 tickets, +800 / -200 lines

*This cluster was detected by time proximity. Review PRs to determine if they form a cohesive project or should be split.*

PRs: #4074, #4091, #4094, #4096, #4098, #4103, #4104, #4109, #4110, #4114, #4120, #4126
```

## Tips

- High confidence projects are most reliable - start there
- Low confidence projects may need manual review
- Look for patterns in PR titles that suggest related work
- Consider the "filtered/" directory if you only want to see significant work
- Check timeline.json to understand when projects overlapped
