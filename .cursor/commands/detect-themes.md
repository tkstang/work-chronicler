# Detect Themes

Identify recurring themes in work history for career narrative and skill development tracking.

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
├── performance-reviews/ # Past reviews - themes valued by company
├── resumes/            # Career narrative and positioning
└── notes/              # User's growth goals and focus areas
```

**Important**: If `work-log/filtered/` exists, use it instead of the main work-log directories. This contains a pre-filtered subset of significant work (e.g., filtered by organization, impact level, or linked tickets). The filtered data focuses on the most theme-worthy contributions.

## Instructions

1. **Read supporting documents first**:
   - `notes/` - User's stated goals and areas of focus
   - `performance-reviews/` - Themes company has recognized/valued
   - `resumes/` - Existing career narrative to build upon

2. **Read analysis files**:
   - `projects.json` - Project groupings for pattern detection
   - `stats.json` - Distribution across repos and impact levels
   - `timeline.json` - Temporal patterns in work

3. **Identify themes across multiple dimensions**:

   **Technical Areas**:
   - Infrastructure (deployment, CI/CD, monitoring)
   - Security (auth, permissions, compliance)
   - Performance (optimization, caching, scaling)
   - Architecture (system design, migrations, refactoring)
   - Frontend/Backend/Fullstack work

   **Business Impact**:
   - Revenue/Growth (features that drive business)
   - Reliability (reducing incidents, improving uptime)
   - Efficiency (automation, tooling, developer experience)
   - Customer-facing (user experience, new capabilities)

   **Skill Development**:
   - New technologies or languages adopted
   - Increasing complexity/scope over time
   - Leadership patterns (leading projects, mentoring)
   - Cross-team collaboration

4. **Look for patterns**:
   - Conventional commit types (feat, fix, refactor, perf)
   - Repository/project clustering
   - JIRA project prefixes and issue types
   - PR titles and descriptions keywords
   - Timeline trends (what themes emerged when?)

## Output Format

```markdown
## Work Themes Analysis

### Technical Themes

#### 1. [Theme Name] (X PRs, Y% of flagship work)
**Description**: [What this theme encompasses]
**Key Projects**: [From projects.json]
**Skills Demonstrated**: [Technologies, patterns, practices]
**Evolution**: [How this area developed over time]

Example PRs:
- [PR title] (org/repo#123) - [impact level]
- [PR title] (org/repo#456) - [impact level]

---

#### 2. [Theme Name] (X PRs, Y% of flagship work)
...

### Business Impact Themes

#### [Theme Name]
**Description**: [How work connected to business outcomes]
**Contributions**: [Key deliverables]
**Measurable Impact**: [Metrics if available]

### Career Narrative

**Primary Identity**: [What defines this person's work - e.g., "Platform Engineer focused on developer experience and reliability"]

**Growth Trajectory**: [How themes show progression]

**Differentiators**: [What makes this work stand out]

### Recommendations

**Strengths to Emphasize**:
- [Theme that should be highlighted for career development]

**Emerging Areas**:
- [New themes that show growth direction]

**Potential Gaps**:
- [Areas that might benefit from more focus]
```

## Example Theme

```markdown
#### 1. Platform Infrastructure (45 PRs, 65% of flagship work)
**Description**: Building and maintaining deployment infrastructure, CI/CD pipelines, and developer tooling.

**Key Projects**:
- Multi-region Kubernetes deployment (high confidence)
- CI/CD pipeline overhaul (high confidence)
- Developer environment automation (medium confidence)

**Skills Demonstrated**: Kubernetes, Helm, GitHub Actions, Terraform, AWS

**Evolution**:
- Q1: Individual deployment improvements
- Q2: Led complete CI/CD redesign
- Q3-Q4: Expanded to multi-region architecture

Example PRs:
- "feat: Add multi-region helm chart support" (org/platform#234) - flagship
- "refactor: Migrate CI from Jenkins to GitHub Actions" (org/platform#189) - flagship
- "feat: Add automatic rollback on deployment failure" (org/platform#267) - major
```

## Tips

- Look for themes that appear consistently across time periods
- Connect technical themes to business impact when possible
- Use timeline.json to understand how themes evolved
- Consider what themes from past reviews/notes should be prioritized
- Identify themes that could strengthen career narrative
- Note themes that represent growth or new directions
