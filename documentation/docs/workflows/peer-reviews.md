---
title: Write peer reviews
description: Write a quick peer review from your company's template in any profile, or an evidence-backed one for a colleague tracked as a report.
---

# Write peer reviews

**Skill**: `/work-chronicler-write-peer-review`

The most flexible skill - supports both quick one-off reviews and comprehensive evidence-based reviews.

## Quick Mode (No Setup Required)

For writing one-off peer reviews without creating a report:

**Usage:**

```
/work-chronicler-write-peer-review
```

**Interactive flow:**

1. Asks: "Is this a quick peer review, or would you like to add them as a report?"
2. Choose "Quick peer review"
3. Enter colleague's name
4. Paste company template (or use standard competencies)
5. Answer rating questions interactively (Rarely/Sometimes/Consistently)
6. Provide specific examples for each rating
7. Add any additional feedback

**Output:**

- Saved to: `<profile>/outputs/peer-review-{name}-{date}.md`
- Synthesized prose (not bullet lists)
- First-person language ("I observed", "Working with them")

**Example:**

```
You: /work-chronicler-write-peer-review

Skill: Is this a quick peer review, or would you like to add them as a report?
You: Quick peer review

Skill: What is the person's name?
You: Alice Smith

Skill: Does your company provide a peer review template?
You: [Paste template with Rarely/Sometimes/Consistently questions]

Skill: Let's go through each question...
      "They easily adapt to change" - How would you rate this?
You: Consistently

Skill: Would you like to share specific examples?
You: Yes, during the auth migration we pivoted mid-sprint and she...

[Continues through all questions, then generates:]

# Peer Review: Alice Smith
...
Alice consistently adapts to change with professionalism. For example,
when we pivoted our auth migration approach mid-sprint, she quickly
adjusted her implementation and helped onboard others...
```

## Full Mode (With Supporting Data)

For ongoing peer relationships where you want to track notes and evidence:

**Setup:**

```bash
# Add colleague as a report (even if not your direct report)
work-chronicler init --mode manager  # If not in manager mode
work-chronicler reports add "Alice Smith"

# Add supporting data
echo "Observations about Alice..." > reports/alice-smith/notes/collaboration.md

# Optional: fetch their work-log
work-chronicler fetch github --report alice-smith
```

**Usage:**

```
/work-chronicler-write-peer-review alice-smith
```

**Output:**

- Saved to: `<manager-root>/reports/alice-smith/outputs/peer-review-{date}.md`
- References notes, work-log data, past reviews
- Evidence-based with specific PR/ticket citations

## Template Support

**Common template formats:**

```
They easily adapt to change.
□ Rarely  □ Sometimes  □ Consistently

They welcome perspectives different from their own.
□ Rarely  □ Sometimes  □ Consistently

[etc.]

Additional feedback: [open text]
```

The skill:

1. Parses template questions
2. Collects ratings and examples interactively
3. Synthesizes into narrative prose (not bullet lists)
4. Groups strengths together, growth areas separately
5. Uses specific examples to make feedback concrete

**Good synthesis example:**

❌ **Don't do this:**

```
- Adapts to change: Consistently
- Welcomes perspectives: Sometimes
```

✅ **Do this:**

```
Alice consistently demonstrates strong adaptability. When we pivoted
our auth migration approach mid-sprint, she quickly adjusted her
implementation without complaint and helped onboard others.

In terms of collaboration, Alice sometimes struggles to welcome
perspectives different from her own. During design reviews, I've
noticed she can be defensive initially, though she generally comes
around after discussion.
```

Full mode uses a manager profile; see [Manager mode](manager-mode.md).

## Peer review tips

**For quick reviews:**

- Have specific examples ready
- Think about 2-3 key projects you collaborated on
- Balance positive and constructive feedback

**For comprehensive reviews:**

- Add notes over time (after collaboration, meetings)
- Reference specific PRs if you have work-log data
- Read past peer reviews to maintain consistency

**Interactive mode:**

- Don't just say "Consistently" - provide examples
- Be specific: "During the auth migration..." not "They're good at their job"
- Use first person: "I observed", "Working with them", "In my experience"

**Peer review requests:**

1. Quick mode for one-offs
2. Full mode if you collaborate regularly and want to track notes
