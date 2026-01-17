# Create PR Description

Creates a comprehensive PR description document based on git changes, planning documents, and project context.

## Instructions

### Step 1: Determine File Location
Ask the user where to place the PR description:
- **Option A**: `.agents/projects/pr-descriptions/<filename>.md` (standalone PRs)
- **Option B**: `.agents/projects/<project-name>/pr-description.md` (existing project directory)

Ask for preferred filename. Suggest based on context:
- `<project-name>.md` (e.g., `openapi-automation-workflow.md`)
- `<jira-ticket>.md` (e.g., `JIRA-1234.md`)
- `pr-description.md` (if in project directory)

### Step 2: Gather Information
Ask the user for:
1. **Detail level**: Minimum / Moderate / Maximum
2. **Jira ticket number/link** (if applicable)
3. **Starting commit SHA** (if available for git diff analysis)
4. **Planning documents** to reference (from current chat or existing files)
5. **Repository URL** (e.g., `https://github.com/org/repo`) (for generating GitHub blob links)

Get current branch automatically:
- Run `git branch --show-current` to get the current branch name
- Use this branch name in all GitHub blob URLs

### Step 3: Analyze Changes
If commit SHA provided:
1. Run `git diff <sha>` to review all changes
2. Assess complexity and scope
3. **Recommend structure approach**:
   - **Standard template** (PULL_REQUEST_TEMPLATE.md structure) for:
     - Simple changes explainable in bullet points
     - Infrastructure/tooling setup
     - Documentation updates
     - Configuration changes
     - Bug fixes and straightforward features
     - File organization changes
   - **Expanded structure** for:
     - Complex multi-component features
     - Changes needing extensive context
     - Modifications affecting multiple systems
     - Performance optimizations needing detailed rationale
4. Wait for user confirmation of structure choice

### Step 4: Create PR Description

**For Standard Template Structure:**
Use these sections (matching PULL_REQUEST_TEMPLATE.md heading levels):
- **Purpose**: Context, Jira link, problem statement
- **Changes**: Bullet list with checkboxes, audience classification
- **Launch Plan**: Deployment steps, rollout plan
- **GIF**: Suggest relevant GIPHY GIF

**For Expanded Structure:**
Use these sections when standard template is insufficient:
```markdown
# [Project Name]

## Overview
Brief summary and purpose

## Context & Background
- Jira link: [TICKET-NUMBER](https://your-org.atlassian.net/browse/TICKET-NUMBER)
- Background and motivation
- Problem statement

## Changes Summary
High-level overview

## Detailed Implementation
### Component/Feature 1
- What was changed
- Why it was changed
- How it works

[Repeat for each major component]

## Technical Details
- Architecture decisions
- Dependencies added/removed
- Configuration changes
- Database changes

## Testing Strategy
- Unit tests
- Integration tests
- Manual testing performed

## Deployment Considerations
- Migration steps
- Environment variables
- Feature flags
- Rollback plan

## QA Notes
- Test scenarios
- Edge cases
- Known limitations

## Follow-up Items
- Future improvements
- Technical debt
- Related tickets
```

### Step 5: Content Guidelines
- **Use clear headings** organized by topic
- **Include code examples** when illustrating changes
- **Link to committed files** using GitHub blob URLs:
  - Format: `https://github.com/org/repo/blob/<branch-name>/<file-path>`
  - Example: `https://github.com/your-org/your-repo/blob/feature/openapi-automation/src/workflows/openapi-update.yml`
  - Get branch name by running `git branch --show-current`
  - Make links clickable: `[filename](blob-url)` or `[descriptive text](blob-url)`
- **Never reference `.agents/` directory** files (not version controlled, reviewers can't access)
- **Reference planning documents** as context but don't link to them in the PR description
- **Scale detail** to the requested level (minimum/moderate/maximum)
- **Include rationale** for decisions when using maximum detail

### Step 6: Review and Finalize
After creating the document:
1. Verify all Jira links are properly formatted
2. Verify all GitHub blob links use correct branch name and repository URL
3. Ensure no references to `.agents/` directory files
4. Confirm structure matches the chosen approach
5. Save to the agreed-upon file location

## Examples

### Simple bug fix (Standard Template)
```
@.agents/PULL_REQUEST_TEMPLATE.md
@src/api/handler.ts

Create PR description for JIRA-1234 bug fix. Use the standard template structure.
Starting commit: abc123
Repo: https://github.com/your-org/your-repo
```

### Complex feature (Expanded Structure)
```
@.agents/projects/openapi-automation/planning.md
@src/workflows/openapi-update.yml
@src/scripts/validate-openapi.ts

Create PR description for OpenAPI automation workflow. Maximum detail, starting commit: def456.
Use expanded structure.
Repo: https://github.com/your-org/your-repo
```

### Documentation update (Standard Template)
```
@docs/api/overview.md
@README.md

Create PR description for documentation update. Moderate detail, starting commit: ghi789.
Repo: https://github.com/your-org/your-repo
```
