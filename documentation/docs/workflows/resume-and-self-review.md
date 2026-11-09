---
title: Write resume bullets and self-reviews
description: Use the IC writing skills to summarize your work, draft a self-review, write resume bullets, update a resume and find projects and themes.
---

# Write resume bullets and self-reviews

These skills run in your AI assistant and read the active profile's work log. Fetch and analyze first (see [Getting started](../getting-started.md)); [AI skills](../tools/skills.md) lists every skill, how to install it and tips for better results.

## Draft a self-review

**Skill**: `/work-chronicler-write-self-review`

Draft self-review content for performance reviews when you need to write a
self-assessment. The draft is saved to
`<profile-root>/outputs/self-review-YYYY-MM-DD.md`.

## Summarizing Work

**Skill**: `/work-chronicler-summarize-work`

Summarize your work for a specific time period.

**Usage:**

```
/work-chronicler-summarize-work 2025-Q4
/work-chronicler-summarize-work --since 2025-10-01 --until 2025-12-31
```

**What it does:**

1. Reads PRs and tickets from specified period
2. Groups by projects (if analysis exists)
3. Highlights flagship and major impact work
4. Summarizes in bullet points or prose

**Output:**

- Concise summary of accomplishments
- Organized by project or theme
- Includes metrics (LOC, PRs merged, tickets closed)
- Suitable for 1:1s, updates, or review prep

## Resume & Career Documents

### Write Resume Bullets

**Skill**: `/work-chronicler-write-resume-bullets`

Create achievement-focused resume bullet points from your work.

**Usage:**

```
/work-chronicler-write-resume-bullets 2025
```

**What it does:**

1. Analyzes flagship and major PRs
2. Extracts business impact from ticket descriptions
3. Creates bullet points with:
   - Action verb ("Led", "Implemented", "Optimized")
   - What you did
   - Measurable impact
   - Technologies used

**Example output:**

```
- Led auth migration for 30 Eater sites with complex Fastly VCL routing,
  supporting multiple environments (production, staging, QA) and enabling
  successful brand launch

- Implemented infrastructure separation for Polygon brand, delivering
  isolated AWS deployment in <1 week to enable $X acquisition

- Optimized GraphQL query performance, reducing API response time by 40%
  and improving Core Web Vitals across 180 SB Nation sites
```

### Update Existing Resume

**Skill**: `/work-chronicler-update-resume`

Update your existing resume with recent accomplishments.

**Usage:**

```
/work-chronicler-update-resume path/to/resume.md --since 2025-01-01
```

**What it does:**

1. Reads your existing resume
2. Analyzes recent work (since date)
3. Suggests new bullet points to add
4. Maintains your resume's format and style
5. Identifies outdated bullets to remove/update

## Find projects and themes

- `/work-chronicler-detect-projects` identifies major project groupings from
  your work history: how your work clusters into initiatives.
- `/work-chronicler-detect-themes` finds recurring themes for a career
  narrative: building your career story and identifying strengths.

## Resume Best Practices

**Optimize for ATS and humans:**

- Use action verbs (Led, Implemented, Optimized, Delivered)
- Include metrics and impact
- Mention technologies/tools
- Focus on flagship and major work (skip minor PRs)

**Update regularly:**

- Run skills quarterly to capture recent work
- Keep resume in `resumes/` directory for skills to reference
- Archive old bullets to `resumes/archive/`
