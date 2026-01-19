# Write Self-Review

Draft self-review content for performance reviews using the user's work history.

## User Input

You can optionally provide:
- **Self-review prompt/questions**: If your company provides specific questions or prompts to answer
- **Review format template**: If you have a specific format to follow
- **Review period**: The time range to focus on (e.g., "Q4 2025", "2025 annual review")
- **Focus areas**: Specific themes or projects to emphasize

Example: `/write-self-review Q4 2025, focus on platform work, here are the review questions: [paste questions]`

If the user provides their own format or questions, prioritize answering those over the default structure below.

## Data Location

Work data is stored in the `work-log/` directory:

```
work-log/
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

## Example Accomplishment

```markdown
#### Authentication System Migration
**What I did**: Led the migration of our authentication system from legacy session-based auth to OAuth2 with MFA support. Architected the solution, coordinated with security team, and implemented the rollout across 3 applications.

**Impact**:
- Enabled enterprise SSO integration, unblocking 5 enterprise deals worth $2M+ ARR
- Reduced authentication-related support tickets by 60%
- Improved security posture with MFA adoption reaching 85% of users

**PRs/Tickets**: DWP-575, DWP-576, DWP-577, DWP-578 (5 flagship PRs, +5,200/-1,800 lines)
```

## Tips

- Match the tone and format of previous self-reviews if available
- Use specific numbers and metrics when possible
- Connect technical work to business outcomes
- Highlight work that demonstrates growth from feedback
- Be specific about YOUR contribution vs team work
- Include both planned work and unplanned wins (incidents handled, etc.)
- Reference the timeline for seasonal patterns (launches, migrations, etc.)
