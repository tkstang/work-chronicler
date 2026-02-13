---
name: work-chronicler-mgmt-write-peer-review
description: Write peer reviews for colleagues. Use when writing peer feedback, 360 reviews, or colleague evaluations. Supports both evidence-based reviews (with work-log data) and narrative reviews (notes-only).
user-invocable: true
disable-model-invocation: true
---

# Write Peer Review

Write peer reviews for colleagues. Adapts to available data - works with full work-log evidence or just manager/peer notes.

## Quick Review vs Full Mode

**Quick mode** (no report needed):
- For one-off peer reviews
- Interactive questions only (no work-log data or supporting documents)
- Saves to `outputs/peer-review-{name}-{date}.md` in your current profile
- Works in any profile (IC or manager mode)

**Full mode** (with report):
- Track peer over time with notes, work-log, past reviews
- **Requires manager mode and adding them as a report** (even if they don't report to you)
- Saves to `reports/{report-id}/outputs/peer-review-{date}.md`
- Use this if you want to:
  - Reference their work-log data (PRs, tickets)
  - Add notes about them over time
  - Include past peer reviews or performance reviews
  - Build evidence-based reviews with specific examples

> **Important:** If you want to use work-log data or additional supporting artifacts (notes, past reviews, etc.), you MUST add them as a report in manager mode. Quick mode is interactive-only with no data references.

## Workspace

**Active profile:** !`work-chronicler workspace profile`
**Manager root:** !`work-chronicler workspace root`

> **For non-Claude tools:** Run `work-chronicler workspace root` to get your manager profile path.

## User Input

**Optional:**
- **Report ID**: The kebab-case identifier if using full mode (e.g., "alice-smith")
  - See available reports: `work-chronicler reports list`
  - If not provided, skill will ask if this is a quick review or if you want to add them as a report

**Also Optional:**
- **Review period**: Time range if relevant (e.g., "Q4 2025", "2025 annual")
- **Review template**: Company-specific questions or format to follow
- **Focus areas**: Specific themes, projects, or competencies to address

**Example invocations:**

*Full mode (with report):*
- `/work-chronicler-mgmt-write-peer-review alice-smith`
- `/work-chronicler-mgmt-write-peer-review bob-jones Q4-2025`

*Quick mode (no report):*
- `/work-chronicler-mgmt-write-peer-review` → Will ask if quick review or add report

**When user provides a template:**

If the template includes structured rating questions (e.g., "Rarely/Sometimes/Consistently"), automatically offer interactive mode:

> "I see your template has rating questions. Would you like me to guide you through each question interactively, collect your answers, and synthesize them into a polished narrative review?"

If they say yes, proceed to Interactive Mode (step 3a in Instructions).
If they say no, use the template as-is and ask them to provide their overall thoughts.

**Template parsing:**
- Extract all competency statements (e.g., "They easily adapt to change")
- Note the rating scale (Rarely/Sometimes/Consistently, or Poor/Good/Excellent, etc.)
- Identify any open-ended questions at the end
- Preserve any company-specific sections or requirements

## Data Location

**Quick mode** (no supporting data):
```
<profile-root>/
└── outputs/                   # Generated peer reviews
    └── peer-review-{name}-{date}.md
```

**Full mode** (with report in manager mode):
```
<manager-root>/
└── reports/
    └── <report-id>/
        ├── work-log/              # Optional - may not exist for peers
        │   ├── pull-requests/     # Evidence if available
        │   └── jira/              # Evidence if available
        ├── analysis/              # Optional - only if work-log exists
        │   ├── stats.json
        │   ├── projects.json
        │   └── timeline.json
        ├── notes/                 # IMPORTANT: Your observations and collaboration notes
        ├── peer-reviews/          # Optional: Feedback from others about this person
        ├── performance-reviews/   # Optional: Past reviews for context
        └── outputs/               # Generated peer reviews
```

## Instructions

1. **Determine mode (quick vs full)**:

   **If user provided a report ID:**
   - Validate it exists in manager config
   - Use exact report ID provided by user
   - If invalid, show available reports via `work-chronicler reports list`
   - Proceed with full mode (skip to step 2)

   **If NO report ID provided:**

   Ask the user:
   > "Is this a quick peer review, or would you like to add them as a report to track over time?"

   **If they choose "Quick peer review":**
   - Ask: "What is the person's name?"
   - Store name for output filename (convert to kebab-case: "Alice Smith" → "alice-smith")
   - Skip to step 2 (no data to check, will use interactive mode only)
   - **Save location:** `<profile-root>/outputs/peer-review-{name}-{date}.md`

   **If they choose "Add as report":**
   - Explain: "Adding them as a report lets you track work-log data, notes, and past reviews for evidence-based peer reviews. Even if they don't report to you, this is how you include supporting data."
   - Show them: "To add them as a report, run these commands:"
     ```bash
     work-chronicler init --mode manager  # If not already in manager mode
     work-chronicler reports add <their-id> --skip-fetch

     # Then optionally add supporting data:
     # - Add notes: reports/<their-id>/notes/observations.md
     # - Fetch their PRs: work-chronicler fetch github --report <their-id>
     # - Fetch their tickets: work-chronicler fetch jira --report <their-id>
     ```
   - Ask: "Have you added them as a report? If so, what's the report ID?"
   - If they provide ID, validate and proceed with full mode
   - If they say no, offer to continue with quick mode instead

2. **Ask about template FIRST**:

   ⚠️ **ALWAYS start by asking this question:**

   > "Does your company provide a peer review template or specific questions you need to answer? If so, please paste it now."

   **If they provide a template:**
   - Parse it for structured rating questions (Rarely/Sometimes/Consistently, etc.)
   - Note any open-ended questions
   - Preserve company-specific format requirements
   - Proceed to step 3 with template context

   **If they say no template:**
   - Use standard competency questions (defined in step 4a)
   - Proceed to step 3

3. **Check what data is available** (full mode only, skip in quick mode):

   **If quick mode:**
   - Skip this step - no data to check
   - Proceed directly to step 2 (ask about template)

   **If full mode (with report):**
   - Look for `work-log/pull-requests/` and `work-log/jira/` directories
   - Check if `analysis/` exists
   - Always check `notes/` directory (critical for peer reviews)
   - Check `peer-reviews/` and `performance-reviews/` for additional context

4. **Determine review mode**:

   **If user provided a template with structured questions:**
   - Ask: "Would you like to answer these questions interactively, or provide your own notes?"
   - If interactive → proceed to Interactive Mode (step 4a)
   - If notes → skip to step 5

   **If minimal/no notes and no template:**
   - Suggest interactive mode: "I don't see many notes. Would you like me to guide you through some peer review questions?"
   - Offer to use standard competency questions (see below)

4a. **Interactive Mode** (when selected):

   **Common template format** (example):
   ```
   They easily adapt to change.
   □ Rarely  □ Sometimes  □ Consistently

   They welcome perspectives different from their own.
   □ Rarely  □ Sometimes  □ Consistently

   They commit to tasks and see them through to completion.
   □ Rarely  □ Sometimes  □ Consistently

   [etc.]

   Additional feedback: [open text field]
   ```

   **For each question/competency:**

   1. **Present the competency statement**
      - Example: "They easily adapt to change"

   2. **Ask for the rating**
      - "How would you rate this? (Rarely / Sometimes / Consistently)"
      - Accept their response

   3. **Ask for context/examples**
      - "Would you like to share specific examples or context for this rating?"
      - If they say yes, collect their examples
      - If they say no or their answer is vague, prompt: "Can you think of a specific situation that illustrates this?"

   4. **Move to next question**
      - Repeat for all competencies in template

   5. **Ask for additional open feedback**
      - "Is there anything else you'd like to mention about working with [Name]?"
      - "Any other strengths or growth areas to highlight?"

   **Standard competency questions** (use if no template provided):
   - "They adapt to change" (Rarely/Sometimes/Consistently) + Examples?
   - "They welcome different perspectives" (Rarely/Sometimes/Consistently) + Examples?
   - "They commit to tasks and see them through" (Rarely/Sometimes/Consistently) + Examples?
   - "They are open to feedback" (Rarely/Sometimes/Consistently) + Examples?
   - "They take initiative" (Rarely/Sometimes/Consistently) + Examples?
   - "They communicate effectively" (Rarely/Sometimes/Consistently) + Examples?
   - "They demonstrate technical excellence" (Rarely/Sometimes/Consistently) + Examples?

   **After gathering all answers:**

   **DO NOT** output a bullet list of ratings. Instead:

   1. **Synthesize into narrative prose**
      - Convert ratings and examples into natural paragraphs
      - Group related competencies together
      - Use their specific examples as evidence

   2. **Example synthesis:**

      ❌ **Bad (don't do this):**
      ```
      - Adapts to change: Consistently
      - Welcomes different perspectives: Sometimes
      - Commits to tasks: Consistently
      ```

      ✅ **Good (do this):**
      ```
      Alice demonstrates strong adaptability and commitment to her work.
      She consistently adapts to change - for example, when we pivoted
      the auth migration approach mid-sprint, she quickly adjusted her
      implementation and helped the team understand the new direction.
      She also commits fully to tasks and sees them through; I've never
      seen her drop a commitment, even when priorities shift.

      In terms of collaboration, Alice sometimes struggles to welcome
      perspectives different from her own. During design reviews, I've
      noticed she can be defensive about her approach initially, though
      she generally comes around after discussion. This is an area where
      continued growth would strengthen her impact on the team.
      ```

   3. **Organization tips:**
      - Group "Consistently" items together as strengths
      - Address "Sometimes" or "Rarely" items as growth opportunities
      - Use their specific examples to make it concrete
      - Balance positive and constructive feedback
      - Write in first person ("I've observed", "In my experience working with them")

5. **Read supporting documents** (critical context):
   - `notes/` - YOUR observations about working with this person
   - `peer-reviews/` - What others have said about them
   - `performance-reviews/` - Past review language and format (if available)

6. **Adapt approach based on available data**:

   **If quick mode (no data):**
   - Use interactive mode exclusively
   - Rely entirely on template questions or standard competencies
   - Synthesize user's responses into prose

   **If full mode with work-log data:**
   - Read `analysis/stats.json`, `projects.json`, `timeline.json`
   - Focus on flagship and major impact work
   - Cross-reference with notes for collaboration context
   - Use evidence-based structure (see below)

   **If full mode with only notes:**
   - Focus entirely on qualitative observations from notes
   - Organize by themes from notes
   - Supplement with interactive questions if notes are minimal
   - Use narrative structure (see below)

7. **Structure the review**:

   **Evidence-based format** (when work-log exists):
   ```markdown
   # Peer Review: [Name]
   **Review Period:** [Period]
   **Reviewed by:** [Your name from context]
   **Date:** [Current date]

   ## Summary
   [2-3 sentences on overall collaboration and impact]

   ### Technical Contributions
   - **[Project/Area]**: [What they did, impact, your observations]
   - **[Project/Area]**: [What they did, impact, your observations]

   ### Collaboration & Communication
   - [How they work with others]
   - [Communication effectiveness]
   - [Cross-team work examples]

   ### Strengths
   - [What they excel at]
   - [Skills that stand out]

   ### Growth Opportunities
   - [Areas for development]
   - [Constructive feedback]
   ```

   **Narrative format** (when only notes exist):
   ```markdown
   # Peer Review: [Name]
   **Review Period:** [Period]
   **Reviewed by:** [Your name from context]
   **Date:** [Current date]

   ## Summary
   [2-3 sentences on your working relationship and overall assessment]

   ### What I've Observed

   #### Strengths
   - [Specific observations from notes]
   - [Examples of excellent work or collaboration]

   #### Areas of Impact
   - [Projects or areas where they've made a difference]
   - [How they've helped you or the team]

   #### Collaboration Style
   - [How they communicate]
   - [How they work with others]
   - [Team dynamics]

   ### Constructive Feedback
   - [Growth areas]
   - [Development opportunities]

   ### Overall Assessment
   [Final thoughts on working with this person]
   ```

   **Interactive mode format** (synthesized from template questions):
   ```markdown
   # Peer Review: [Name]
   **Review Period:** [Period]
   **Reviewed by:** [Your name from context]
   **Date:** [Current date]

   ## Summary
   [2-3 sentences highlighting key strengths and overall impression]

   ## Work Style & Collaboration

   [Synthesized narrative from "adapt to change", "welcome perspectives",
   "open to feedback" responses. Group "Consistently" ratings together as
   strengths, weave in specific examples provided during interactive mode]

   Example:
   Alice consistently demonstrates strong adaptability and openness to
   feedback. When we pivoted our auth migration approach mid-sprint, she
   quickly adjusted her implementation without complaint and helped onboard
   others to the new direction. She's also receptive to feedback - during
   code reviews, I've seen her thoughtfully incorporate suggestions and
   explain her reasoning when she disagrees, leading to better outcomes.

   ## Reliability & Initiative

   [Synthesized narrative from "commit to tasks", "take initiative"
   responses]

   Example:
   I can consistently count on Alice to follow through on commitments. She
   takes initiative when problems arise - for instance, when we discovered
   a security gap in our API, she proactively researched solutions and
   presented options to the team before being asked.

   ## Areas for Growth

   [Synthesized narrative from "Sometimes" or "Rarely" ratings, with
   constructive framing and specific examples]

   Example:
   One area where Alice could grow is in welcoming perspectives different
   from her own. During design discussions, I've noticed she can initially
   be defensive about her approach, though she generally comes around after
   further discussion. Actively seeking out alternative viewpoints earlier
   in the process could strengthen her designs and team collaboration.

   ## Additional Feedback

   [Any open-ended thoughts provided during interactive mode]
   ```

8. **Template adaptation**:
   - If user provided a template (from step 2), use that structure exactly
   - Map available data and interactive responses to template questions
   - Note where you don't have information to answer specific questions

## Output Location

**Quick mode** (no report ID):
```
<profile-root>/outputs/peer-review-{name}-YYYY-MM-DD.md
```

Example: `~/.work-chronicler/profiles/default/outputs/peer-review-alice-smith-2026-02-13.md`

Use the person's name in kebab-case (e.g., "Alice Smith" → "alice-smith").

**Full mode** (with report ID):
```
<manager-root>/reports/<report-id>/outputs/peer-review-YYYY-MM-DD.md
```

Example: `~/.work-chronicler/profiles/manager/reports/alice-smith/outputs/peer-review-2026-02-13.md`

Use the exact report ID in the path.

**Important:** Ensure the document clearly indicates this is PEER REVIEW feedback:
- Filename must include `peer-review-` prefix (and person's name in quick mode)
- Document title should say "Peer Review" or "Peer Feedback"
- Use first-person language ("I observed", "Working with them")
- This distinguishes it from manager performance reviews

## Important Constraints

- ✅ Be specific and honest
- ✅ Balance positive feedback with constructive growth areas
- ✅ Focus on observable behaviors and outcomes
- ❌ No rankings or numerical scores
- ❌ No comparisons with other team members
- ❌ Don't make up evidence - only cite what you have

## Tips

- **If notes are minimal**: Ask the user if they want to add more observations before generating
- **For evidence-based reviews**: Connect code contributions to team/business impact
- **For narrative reviews**: Use specific examples from notes rather than vague praise
- **Tone**: Professional but authentic - this is peer feedback, not a formal manager review
- **Balance**: Include both strengths and growth areas in every review
- **Be specific**: "Great communicator" is weak; "Proactively documented the auth migration in Confluence, making it easy for others to contribute" is strong
- **Use first person**: "I observed...", "Working with them on...", "I appreciated..."

## Adding Notes Before Generating

If you don't have enough notes to write a meaningful review, suggest the user add observations first:

```bash
# Create a notes file
echo "Observations about Alice:
- Led the auth migration, clear communication
- Great at explaining complex systems
- Sometimes moves too fast, could involve team more in decisions
" > reports/alice-smith/notes/collaboration.md
```

Then re-run the skill.
