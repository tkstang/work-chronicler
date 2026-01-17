# Generate Resume Bullets

Generate achievement-focused resume bullet points from the user's work history.

## Instructions

1. Read the work-log data:
   - Check `work-log/.analysis/` for pre-computed analysis
   - Read PR files from `work-log/pull-requests/**/*.md`
   - Read ticket files from `work-log/jira/**/*.md`

2. Focus on **impact and achievements**, not tasks:
   - Use action verbs: "Implemented", "Reduced", "Architected", "Led"
   - Quantify when possible: percentages, numbers, scale
   - Highlight business impact, not just technical changes

3. Group by project or theme when multiple PRs relate to the same initiative.

4. Format each bullet point for resume use:
   - Start with strong action verb
   - Include context (what, for whom)
   - Show measurable impact
   - Keep concise (1-2 lines max)

## Example Output

```
## Resume Bullet Points

### Backend Engineering

- **Architected OAuth2 authentication system** supporting 3 identity providers, enabling SSO for 50,000+ enterprise users and reducing login friction by 40%

- **Implemented distributed caching layer** using Redis, reducing API response times from 450ms to 120ms (73% improvement) and cutting database load by 60%

- **Led database migration** from PostgreSQL 12 to 15, achieving zero-downtime deployment across 3 production clusters with automated rollback capabilities

### Frontend Development

- **Redesigned checkout flow** reducing cart abandonment by 25% and increasing mobile conversion rate from 2.1% to 3.4%

- **Built component library** with 40+ reusable React components, accelerating feature development by 30% across 3 product teams

### Technical Leadership

- **Mentored 2 junior engineers** through code reviews and pair programming, both promoted within 12 months

- **Established CI/CD pipeline** reducing deployment time from 45 minutes to 8 minutes and enabling 5x more frequent releases
```

## Tips for the AI

- Look for PRs with high line counts or many files changed as indicators of significant work
- Cross-reference JIRA tickets for story points and business context
- Group related PRs (same project prefix, similar timeframe) into cohesive achievements
- Infer impact from PR descriptions and commit messages
- If specific metrics aren't available, use relative terms ("significantly improved", "major reduction")
