# Update Resume

Update the user's existing resume with accomplishments from their work history.

## User Input

You can optionally provide:
- **Resume file path**: Specific resume to update (e.g., `resume-2025.md`)
- **Time period**: Date range for new accomplishments (e.g., "last 6 months", "2025")
- **Focus areas**: Specific types of work to emphasize

Example: `/update-resume resume.md, focus on platform and infrastructure work from 2025`

## Data Location

Work data is stored in the `work-log/` directory:

```
work-log/
├── filtered/               # ⭐ USE THIS IF IT EXISTS (pre-filtered subset)
│   ├── .analysis/
│   ├── pull-requests/
│   └── jira/
├── .analysis/
│   ├── stats.json      # Impact breakdown, repo stats
│   ├── projects.json   # Detected project groupings
│   └── timeline.json   # Chronological view
├── pull-requests/
│   └── <org>/<repo>/*.md
├── jira/
│   └── <org>/<project>/*.md
├── resumes/            # ⭐ FIND EXISTING RESUME(S) HERE
├── performance-reviews/ # Past reviews for context (prioritize recent)
└── notes/              # User's goals and highlights
```

**Important**:
- If `work-log/filtered/` exists, use it for work data (pre-filtered for significant contributions)
- Look in `work-log/resumes/` or `resumes/` for existing resume files
- If no resume found, ask the user where their resume is located

## Instructions

### Step 1: Find and Read Existing Resume

1. **Search for resume files**:
   - Check `work-log/resumes/` directory first
   - Check `resumes/` in the project root
   - Look for common filenames: `resume.md`, `resume.pdf`, `*.resume.*`, `cv.*`
   - Ask user if no resume is found

2. **Understand current resume structure**:
   - Note the formatting style (markdown, bullets, sections)
   - Identify existing experience entries and their format
   - Note the level of detail and tone used
   - Identify which sections need updating (usually recent experience)

### Step 2: Gather Context from Supporting Documents

1. **Read recent performance reviews** (prioritize by recency):
   - Check `work-log/performance-reviews/` directory
   - **Prioritize reviews from the last 1-2 years** - these reflect current role and impact
   - Use older reviews only for career progression context, not accomplishments
   - Extract themes: what was valued, what feedback was given, growth areas

2. **Read notes** (if present):
   - Check `work-log/notes/` for user-provided context
   - Note what the user wants to highlight or emphasize
   - Check for career goals that accomplishments should support

### Step 3: Analyze Work Data

1. **Read analysis files** (from filtered/ if exists, otherwise main work-log):
   - `stats.json` - Impact distribution
   - `projects.json` - High-confidence project groupings
   - `timeline.json` - Recent activity trends

2. **Focus on high-impact work**:
   - **Flagship** PRs: Major initiatives, lead with these
   - **Major** PRs: Significant features worth highlighting
   - Skip minor/standard unless they support a larger narrative

3. **Cross-reference with JIRA tickets** for business context:
   - Ticket summaries often have business impact language
   - Story points indicate complexity/effort
   - Look for epic/initiative level context

### Step 4: Generate Resume Updates

1. **Match the existing resume format exactly**:
   - Use same heading styles, bullet formats, and tone
   - Maintain consistent level of detail
   - Keep the same section structure

2. **Create new accomplishment bullets**:
   - Start with strong action verbs
   - Quantify impact when possible
   - Connect technical work to business outcomes
   - Group related PRs into cohesive achievements

3. **Prioritize recency**:
   - Most recent accomplishments should come first
   - Phase out older accomplishments that are less relevant
   - Suggest which older items might be condensed or removed

## Output Location

Save generated documents to the `generated/` directory at the project root:
- `generated/resume-updated-YYYY-MM-DD.md` - Updated resume

Create the directory if it doesn't exist.

## Output Format

```markdown
## Resume Update Suggestions

### Context
- **Resume file**: [path to resume found]
- **Work data period**: [date range analyzed]
- **Recent reviews referenced**: [list of review files, by recency]

### New Experience Bullets

These accomplishments from your work history should be added to your resume:

#### [Most Recent Position/Company Section]

**Add these bullets** (suggested placement: top of section):

- **[Achievement 1]** - [Action verb + what you did + impact/outcome]
  - *Based on*: [PR refs or project name]

- **[Achievement 2]** - [Action verb + what you did + impact/outcome]
  - *Based on*: [PR refs or project name]

#### Suggested Removals/Condensing

To keep resume length appropriate, consider:
- Condensing: [older bullet that could be shortened]
- Removing: [bullet that's now less relevant]

### Updated Resume Section

Here's how the [relevant section] of your resume would look with these changes:

---
[Full updated section in exact format of original resume]
---

### Review Alignment

These additions align with themes from your recent reviews:
- [Theme from recent review] → [Which accomplishments support it]
- [Growth area from review] → [Evidence of growth in new work]
```

## Example Output

```markdown
## Resume Update Suggestions

### Context
- **Resume file**: work-log/resumes/resume-2024.md
- **Work data period**: January 2025 - December 2025
- **Recent reviews referenced**: H2-2025-review.md (most recent), H1-2025-review.md

### New Experience Bullets

#### Senior Software Engineer, Acme Corp (Current Role)

**Add these bullets** (suggested placement: top of section):

- **Architected and led migration to OAuth2 authentication system** with MFA support, enabling enterprise SSO integrations that unblocked $2M+ in ARR from 5 enterprise contracts
  - *Based on*: DWP-575 through DWP-578 (5 flagship PRs)

- **Designed real-time collaboration infrastructure** supporting 10 concurrent editors, driving 25% increase in user engagement and reducing sync conflicts by 80%
  - *Based on*: Collaboration project (4 major PRs)

- **Reduced API response times by 73%** (450ms → 120ms) through implementation of Redis caching layer, improving user experience across mobile and web clients
  - *Based on*: Performance optimization initiative

#### Suggested Removals/Condensing

To keep resume length appropriate, consider:
- Condensing: "Implemented unit test coverage..." → This is now table stakes, condense to mention within another bullet
- Removing: "Fixed various bugs..." → Too generic for senior-level resume

### Review Alignment

These additions align with themes from your recent H2-2025 review:
- **Technical Leadership** → OAuth2 migration demonstrates architecture and cross-team coordination
- **User Impact** → Collaboration features and performance improvements show user-centric thinking
- **Growth in system design** (from H1 feedback) → Caching layer shows application of feedback
```

## Tips

- **Recency matters**: Recent performance reviews (1-2 years) are most relevant for current role framing
- **Don't just list PRs**: Group related work into cohesive narratives
- **Match tone exactly**: A formal resume needs formal language; a casual one can be more conversational
- **Business impact > technical details**: "Reduced costs by 40%" > "Migrated to microservices"
- **Show growth**: If reviews mentioned areas for improvement, highlight work that shows that growth
- **Keep it scannable**: Hiring managers skim; front-load the most impressive parts of each bullet
