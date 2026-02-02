---
name: work-chronicler-generate-resume-bullets
description: Use when creating achievement-focused resume bullet points from work history. Extracts impactful accomplishments for resumes.
user-invocable: true
---

# Generate Resume Bullets

Generate achievement-focused resume bullet points from the user's work history.

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
│   ├── stats.json      # Impact breakdown, repo stats
│   ├── projects.json   # Detected project groupings
│   └── timeline.json   # Chronological view
├── pull-requests/
│   └── <org>/<repo>/*.md
├── jira/
│   └── <org>/<project>/*.md
├── resumes/            # User's existing resume(s) - use for tone/format
├── performance-reviews/ # Past reviews - use for context
└── notes/              # User's goals and highlights
```

**Important**: If `filtered/` exists, use it for the most resume-worthy contributions.

## Instructions

1. **Read analysis files first**:
   - `stats.json` - Get impact distribution
   - `projects.json` - Get high-confidence project groupings
   - Focus on **flagship** and **major** impact PRs

2. **Read supporting documents** (if present):
   - `resumes/` - Match tone and format of existing resume
   - `notes/` - Prioritize what user wants to highlight

3. **Focus on impact, not tasks**:
   - Use action verbs: "Architected", "Led", "Reduced", "Implemented"
   - Quantify when possible: percentages, numbers, scale
   - Highlight business impact, not just technical changes
   - Group related PRs into cohesive achievements

4. **Use impact levels as signals**:
   - **Flagship** (500+ lines or 15+ files): Major initiatives, lead with these
   - **Major** (200+ lines or 8+ files): Significant features
   - Skip minor/standard unless specifically relevant

## Output Location

Save generated documents to `generated/resume-bullets-YYYY-MM-DD.md` in the workspace root.

## Bullet Point Format

- Start with strong action verb
- Include context (what, for whom)
- Show measurable impact
- Keep concise (1-2 lines max)

## Example Output

```markdown
## Resume Bullet Points

### Platform Engineering

- **Architected multi-region deployment infrastructure** using Kubernetes and Helm, enabling 99.9% uptime and reducing deployment time by 70%

- **Led authentication system migration** to OAuth2 with MFA support, serving 50,000+ enterprise users across 3 identity providers

- **Designed and implemented caching layer** using Redis, reducing API response times from 450ms to 120ms (73% improvement)

### Product Development

- **Built real-time collaboration features** enabling 10 concurrent editors, driving 25% increase in user engagement

- **Redesigned checkout flow** reducing cart abandonment by 25% and increasing mobile conversion from 2.1% to 3.4%

### Technical Leadership

- **Established CI/CD pipeline** with automated testing and rollback, enabling 5x more frequent deployments

- **Mentored 3 junior engineers** through code reviews and pair programming, all promoted within 12 months
```

## Tips

- Prioritize flagship/major PRs from projects.json high-confidence groups
- Cross-reference JIRA tickets for business context and story points
- Infer metrics from PR descriptions when exact numbers aren't available
- Use relative terms ("significantly improved", "major reduction") if specific metrics unavailable
- Group PRs by project rather than listing individually
- Match tone/format of existing resume if one is provided
