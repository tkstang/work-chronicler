---
name: release-notes
description: Use when releasing a new version, after tagging, or when the user asks to update release notes. Generates meaningful release notes from git history and updates the GitHub release.
user-invocable: true
---

# Generate Release Notes

Generate meaningful release notes from git history between two tags and update the corresponding GitHub release.

## User Input

**Optional:**
- **Tag**: The tag to generate notes for (e.g., "v0.2.0")
  - If omitted, uses the latest tag
- **Previous tag**: The starting point for the diff
  - If omitted, uses the tag immediately before the target tag

**Example invocations:**
- `/release-notes` (latest tag vs its predecessor)
- `/release-notes v0.2.0` (specific tag)
- `/release-notes v0.3.0 v0.1.1` (explicit range)

## Instructions

### 1. Determine the tag range

```bash
# If no tag specified, get the latest
git tag --sort=-v:refname | head -1

# Get the previous tag
git tag --sort=-v:refname | head -2 | tail -1

# Check when the tag was created (to detect stale releases)
git log -1 --format="%ci" <latest-tag>
```

**Staleness check:** If no tag was explicitly provided, compare the tag's date to today. If the tag is older than 7 days, ask the user to confirm this is the intended release before proceeding — they may have forgotten to specify a tag, or may need to create a new one first.

Confirm the two tags with the user before proceeding.

### 2. Gather commit data

```bash
# All commits in the range
git log --oneline <previous-tag>..<target-tag>

# Merged PRs (first-parent view)
git log --oneline --first-parent <previous-tag>..<target-tag>

# Full commit messages for context
git log --format="%h %s%n%b" <previous-tag>..<target-tag>
```

### 3. Gather PR details (if available)

For each merged PR number found in commit messages:

```bash
gh pr view <number> --json title,body,labels
```

### 4. Categorize changes

Group commits into categories based on conventional commit prefixes:

| Prefix | Category |
|--------|----------|
| `feat` | New Features |
| `fix` | Bug Fixes |
| `perf` | Performance |
| `refactor` | Refactoring |
| `test` | Testing |
| `docs` | Documentation |
| `chore` | Maintenance |

Within each category, group related commits together and summarize them as a single item rather than listing every commit individually. Focus on **what changed for the user**, not implementation details.

### 5. Write release notes

Structure:

```markdown
## Highlights

[1-3 sentence summary of the most important changes in this release]

## What's New

### [Category Name]
- **[Feature/change name]** — [Description of what it does and why it matters]
- **[Feature/change name]** — [Description]

### [Category Name]
- **[Fix/change name]** — [Description]

## Installation

\`\`\`bash
npm install -g work-chronicler@<version>
\`\`\`
```

### 6. Update the GitHub release

First, show the user the generated notes and get their approval. Then:

```bash
gh release edit <tag> --notes "<approved notes>"
```

Use a heredoc for the notes body to preserve formatting:

```bash
gh release edit <tag> --notes "$(cat <<'NOTES'
<release notes content>
NOTES
)"
```

## Guidelines

- **Summarize, don't list** — "Added manager mode with report management, per-report analysis, and team aggregations" is better than listing 15 individual commits
- **User-facing language** — Describe what users can do now, not what files changed
- **Group by feature, not by commit** — Multiple commits that build one feature should be a single bullet point
- **Skip noise** — Formatting fixes, import cleanup, and file moves don't need to be mentioned unless they affect users
- **Keep it scannable** — Someone should understand the release in 30 seconds
- **Preserve the installation section** — The CI workflow includes this; keep it consistent
