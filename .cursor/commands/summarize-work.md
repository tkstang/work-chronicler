# Summarize Work

Summarize the user's work history from their work-chronicler data.

## Instructions

1. First, check if the work-log directory exists by looking for `work-log/` in the project root or the location specified in `work-chronicler.yaml`.

2. Read the analysis files if they exist:
   - `work-log/.analysis/large-prs.json` - PRs with significant changes
   - `work-log/.analysis/projects.json` - Detected project groupings
   - `work-log/.analysis/timeline.json` - Work by time period

3. If analysis files don't exist, read the PR and ticket files directly:
   - `work-log/pull-requests/**/*.md` - PR files with frontmatter
   - `work-log/jira/**/*.md` - JIRA ticket files with frontmatter

4. Each markdown file has YAML frontmatter containing metadata:
   - PRs: title, prNumber, repository, additions, deletions, state, createdAt, mergedAt, labels
   - Tickets: key, summary, project, issueType, status, storyPoints

5. Generate a summary that includes:
   - Total PRs and tickets
   - Breakdown by repository/project
   - Notable large changes (high LOC, many files)
   - Timeline of activity
   - Key themes or areas of work

## Example Output

```
## Work Summary

### Overview
- **Period**: January 2024 - December 2024
- **Total PRs**: 47
- **Total JIRA Tickets**: 32

### By Repository
- acme/api: 23 PRs (+4,521 / -1,203 lines)
- acme/frontend: 18 PRs (+2,100 / -890 lines)
- acme/shared: 6 PRs (+340 / -120 lines)

### Major Projects
1. **User Authentication Overhaul** (Q1)
   - 8 PRs, AUTH-* tickets
   - Implemented OAuth2, MFA support

2. **Performance Optimization** (Q2-Q3)
   - 12 PRs, PERF-* tickets
   - 40% latency reduction

### Notable Contributions
- Largest PR: "Add caching layer" (+847 lines, 24 files)
- Most complex: "Database migration" (12 files changed)
```
