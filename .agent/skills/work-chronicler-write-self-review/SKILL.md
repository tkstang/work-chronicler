---
name: work-chronicler-write-self-review
description: Use when drafting self-review content for performance reviews. Analyzes work history to create structured review narratives.
user-invocable: true
disable-model-invocation: true
---

# Write Self-Review

Draft self-review content for performance reviews using the user's work history.

## Workspace

**Active profile:** !`work-chronicler workspace profile`
**Work log:** !`work-chronicler workspace work-log`
**Analysis:** !`work-chronicler workspace analysis`

> **For non-Claude tools:** Run `work-chronicler workspace work-log` to get your data path.

## User Input

You can optionally provide:
- **Self-review prompt/questions**: If your company provides specific questions or prompts to answer
- **Review format template**: If you have a specific format to follow
- **Review period**: The time range to focus on (e.g., "Q4 2025", "2025 annual review")
- **Focus areas**: Specific themes or projects to emphasize

Example: `/work-chronicler-write-self-review Q4 2025, focus on platform work, here are the review questions: [paste questions]`

If the user provides their own format or questions, prioritize answering those over the default structure below.

## Data Location

Work data is stored in the workspace work-log directory:

```
<work-log>/
├── filtered/               # ⭐ USE THIS IF IT EXISTS (pre-filtered subset)
├── .analysis/
│   ├── stats.json      # Impact breakdown, repo stats
│   ├── projects.json   # Detected project groupings
│   └── timeline.json   # Chronological view
├── pull-requests/
│   └── <org>/<repo>/*.md
├── jira/
│   └── <org>/<project>/*.md
├── performance-reviews/ # IMPORTANT: Past reviews for format/context
├── resumes/            # User's resume for accomplishment framing
└── notes/              # User's goals, highlights, areas to emphasize
```

## Instructions

1. **Read supporting documents first** (critical for context):
   - `performance-reviews/` - Match format, understand what's valued
   - `notes/` - User's goals and what they want to highlight
   - Past reviews show company format, rating criteria, and expectations

2. **Read analysis files**:
   - `stats.json` - Overall impact distribution
   - `projects.json` - Major project groupings (focus on high confidence)
   - `timeline.json` - Activity trends, busiest periods

3. **Focus on flagship and major impact work**:
   - These represent the most significant contributions
   - Cross-reference with ticket summaries for business context
   - Group related work into narrative themes

4. **Structure for self-review**:
   - **Accomplishments**: What was delivered, with quantifiable impact
   - **Impact**: How it helped the team, product, or business
   - **Growth**: Skills developed, challenges overcome
   - **Collaboration**: Cross-team work, mentorship, knowledge sharing
   - **Goals**: How work aligned with or exceeded goals

## Output Location

**IMPORTANT:** You must do BOTH of the following:

1. **Respond in-thread** with the self-review (for immediate feedback and MCP integration)
2. **Save to file**: `<profile-root>/outputs/self-review-YYYY-MM-DD.md`

Get the profile root with: `work-chronicler workspace root`

This ensures users have both immediate feedback AND a persistent file they can reference later.

## Output Format

Structure depends on company format (from past reviews). If no past reviews, use this structure:

```markdown
## Self-Review: [Review Period]

### Summary
[2-3 sentence overview of key accomplishments and impact]

### Key Accomplishments

#### [Project/Theme 1]
**What I did**: [Description of work]
**Impact**: [Measurable outcomes, business value]
**PRs/Tickets**: [Key references]

#### [Project/Theme 2]
**What I did**: [Description of work]
**Impact**: [Measurable outcomes, business value]
**PRs/Tickets**: [Key references]

### Technical Growth
- [Skills developed or deepened]
- [New technologies or practices adopted]
- [Technical challenges overcome]

### Collaboration & Leadership
- [Cross-team initiatives]
- [Mentorship or knowledge sharing]
- [Process improvements]

### Alignment with Goals
[How work aligned with or exceeded stated goals]

### Looking Ahead
[Areas for continued growth, upcoming focus areas]
```

## Tips

- Match the tone and format of previous self-reviews if available
- Use specific numbers and metrics when possible
- Connect technical work to business outcomes
- Highlight work that demonstrates growth from feedback
- Be specific about YOUR contribution vs team work
- Include both planned work and unplanned wins (incidents handled, etc.)
- Reference the timeline for seasonal patterns (launches, migrations, etc.)
