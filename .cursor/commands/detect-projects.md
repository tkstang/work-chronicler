# Detect Projects

Analyze work history to identify major projects and group related work.

## Instructions

1. Read all PR and ticket data from:
   - `work-log/pull-requests/**/*.md`
   - `work-log/jira/**/*.md`

2. Detect project groupings by analyzing:
   - JIRA ticket prefixes (e.g., AUTH-*, PERF-*, MOBILE-*)
   - PR labels and repository patterns
   - Temporal clustering (work done in the same time period)
   - Semantic similarity in titles and descriptions
   - Cross-references between PRs and tickets

3. For each detected project, gather:
   - Name/theme
   - Time period (start to end dates)
   - Related PRs and tickets
   - Total scope (lines changed, story points)
   - Key outcomes or deliverables

4. Rank projects by significance:
   - Number of PRs/tickets
   - Total lines of code
   - Story points
   - Duration

## Example Output

```
## Detected Projects

### 1. Authentication Overhaul
**Period**: January - March 2024
**Scope**: 12 PRs, 8 tickets, +5,200 / -1,800 lines, 34 story points

**Related Work**:
- AUTH-101: Implement OAuth2 flow
- AUTH-102: Add MFA support
- AUTH-103: Session management refactor
- PRs: #234, #245, #256, #267, #278, #289, #301, #312, #323, #334, #345, #356

**Key Deliverables**:
- OAuth2 integration with Google, GitHub, Microsoft
- TOTP-based MFA
- Secure session handling with refresh tokens

---

### 2. Performance Optimization Initiative
**Period**: April - July 2024
**Scope**: 15 PRs, 6 tickets, +3,100 / -900 lines, 21 story points

**Related Work**:
- PERF-201: Database query optimization
- PERF-202: Implement caching layer
- PERF-203: Frontend bundle optimization
- PRs: #401, #412, #423, #434, #445, #456, #467, #478, #489, #501, #512, #523, #534, #545, #556

**Key Deliverables**:
- 73% reduction in API latency
- 60% reduction in database load
- 45% smaller frontend bundle

---

### 3. Mobile App Launch
**Period**: August - November 2024
**Scope**: 20 PRs, 12 tickets, +8,400 / -200 lines, 55 story points

...
```

## Analysis Tips

- Look for JIRA ticket key patterns (letters before the number)
- Check PR labels for project tags
- Consider work done within 2-4 week sprints as potentially related
- Use PR descriptions and commit messages for semantic grouping
- Note when multiple tickets are linked to the same PR
