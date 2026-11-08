---
title: Review packets and team analysis
description: Analyze each report and the team, then generate review packets, quarterly highlights and team summaries with the manager skills.
---

# Review packets and team analysis

Once a [manager profile](manager-mode.md) has reports with fetched data, analyze each report and the team, add context, and generate review content with the manager skills ([AI skills](../tools/skills.md#manager-mode-skills)).

## Analysis

Manager mode provides two analysis layers:

1. **Per-Report Analysis** - Individual IC-style analysis for each report
2. **Team Analysis** - Aggregated team-level insights

### Per-Report Analysis

Analyze work for a specific report:

```bash
# Interactive selection
work-chronicler analyze reports

? Select a report to analyze:
  ◉ Alice Smith (alice-smith)
  ◯ Bob Jones (bob-jones)
  ◯ Charlie Davis (charlie-davis)

# Non-interactive
work-chronicler analyze reports alice-smith
```

`analyze reports` analyzes one report at a time. With no flags it runs all analysis types; `--all` explicitly runs all analysis types (`--tag-prs`, `--projects`, `--timeline`) for that report, not all reports.

**Generated files** (per report):

```
profiles/manager/reports/alice-smith/analysis/
├── stats.json           # Impact breakdown, repo stats
├── projects.json        # Detected project groupings
└── timeline.json        # Chronological activity view
```

**What it analyzes:**

- **Impact classification**: Flagship, major, standard, minor tiers
- **Project detection**: Groups related PRs by shared tickets
- **Timeline**: Weekly/monthly activity with stats
- **Repository breakdown**: Contributions per repo

### Team Analysis

Generate team-level aggregations:

```bash
work-chronicler analyze team
```

**Generated files:**

```
profiles/manager/analysis/
├── team-projects.json        # All projects across all reports
├── contributor-matrix.json   # Who worked on which projects
└── team-timeline.json        # Week and month activity across reports
```

**What it includes:**

- **Team projects**: projects from every report's `analysis/projects.json`,
  merged by name, with PR and ticket lists and stats combined
- **Contributor matrix**: report ID → the projects detected in that report's
  own analysis
- **Team timeline**: every report's `analysis/timeline.json` merged by month
  and week. Each period has team totals in `stats` and each report's own
  numbers in `byReport`; week entries under `byReport` also list that
  report's PRs and tickets. Reports whose timeline is unavailable (missing,
  malformed or unreadable) are listed in `skippedReports`; run
  `analyze reports <id> --timeline` to regenerate it

Run `analyze reports <id>` for each report first; team analysis only reads
those per-report files.

`analyze reports --tag-prs` uses the default impact thresholds unless the
manager profile's `config.yaml` sets `analysis.thresholds`, in the same shape as
an IC profile (see [Impact thresholds](../tools/configuration.md#impact-thresholds)).

### Analyze Everything

Run both per-report and team analysis:

```bash
# Analyze each report, then generate team aggregations
work-chronicler analyze reports alice-smith
work-chronicler analyze reports bob-jones
work-chronicler analyze reports charlie-davis
work-chronicler analyze team
```

### Understanding Analysis Output

**Impact Tiers:**

- **Flagship**: Large initiatives (500+ lines or 15+ files), breaking changes (`feat!:`), migrations, platform changes
- **Major**: Significant features (200+ lines or 8+ files), `feat:` or `refactor:` commits
- **Standard**: Regular work, bug fixes, `fix:` or `test:` commits
- **Minor**: Small changes (<20 lines), docs and chores below major size, dependency updates at any size

See [Impact thresholds](../tools/configuration.md#impact-thresholds) for the full rule order.

**Project Detection:**

Projects are detected by grouping PRs that reference the same Jira tickets. PRs without ticket references remain unassigned.

**Timeline View:**

Shows work grouped by ISO week and month:

- Weekly/monthly PR counts
- Additions/deletions per period
- Busiest weeks/months
- Impact distribution over time

## Write a review packet

**Skill**: `/work-chronicler-manager-write-review-packet`

Generate evidence-based performance reviews for direct reports.

**Requirements:**

- Manager mode enabled
- Report added and data fetched
- Analysis generated (recommended)

**Usage:**

```
/work-chronicler-manager-write-review-packet alice-smith Q4-2025
```

**What it does:**

1. Reads supporting documents:
   - `performance-reviews/` - Past reviews for format/context
   - `peer-reviews/` - Peer feedback for collaboration insights
   - `notes/` - Manager notes about goals and focus areas
2. Reads analysis files:
   - `stats.json` - Impact distribution
   - `projects.json` - Major project groupings
   - `timeline.json` - Activity trends
3. Focuses on flagship and major impact work
4. Cross-references PRs with ticket context
5. Generates structured review with:
   - Key accomplishments (with evidence)
   - Technical growth
   - Collaboration & leadership
   - Alignment with goals
   - Areas for growth

**Output:**

- Saved to: `reports/{id}/outputs/review-packet-{date}.md`
- Evidence-based with specific PR/ticket citations
- Matches format of past reviews (if provided)
- No rankings/scoring (per roadmap requirements)

## Complete Workflow Examples

### Example 1: Quarterly Performance Review Preparation

```bash
# 1. Set up manager profile (one-time)
work-chronicler init --mode manager
# Follow prompts to configure GitHub, Jira, add reports

# 2. Fetch data for Q1 (January 1 - March 31)
# First set fetch.since: 2026-01-01 and fetch.until: 2026-03-31 in the profile config.yaml
work-chronicler fetch all --all-reports

# 3. Generate analysis for each report
work-chronicler analyze reports alice-smith

# 4. Generate team-level insights
work-chronicler analyze team

# 5. Add context (optional but recommended)
# Upload past reviews to:
#   profiles/manager/reports/alice-smith/performance-reviews/
# Add notes to:
#   profiles/manager/reports/alice-smith/notes/

# 6. Use AI skills to generate review packets
# (In Claude Code, Cursor, etc. with installed skills)
/work-chronicler-manager-write-review-packet alice-smith Q1-2026
```

### Example 2: New Manager Getting Started

```bash
# 1. Initialize manager profile
work-chronicler init --mode manager

# 2. Add first report with auto-discovery
# (run interactively and choose "Auto-discover" for repos)
work-chronicler reports add "Alice Smith"

# 3. Add more reports
work-chronicler reports add "Bob Jones"

work-chronicler reports add "Charlie Davis" \
  --github cdavis \
  --email charlie@acme.com \
  --repos frontend,mobile

# 4. Verify setup
work-chronicler reports list

# 5. Do initial data fetch
work-chronicler fetch all --all-reports

# 6. Generate baseline analysis
work-chronicler analyze reports alice-smith
work-chronicler analyze reports bob-jones
work-chronicler analyze reports charlie-davis
work-chronicler analyze team
```

### Example 3: Adding a New Direct Report Mid-Year

```bash
# 1. Add new report
# (run interactively and choose "Auto-discover" for repos)
work-chronicler reports add "Dana Martinez"

# 2. Fetch their data (YTD; date range comes from fetch.since in the profile config)
work-chronicler fetch all --report dana-martinez

# 3. Generate analysis for new report
work-chronicler analyze reports dana-martinez

# 4. Regenerate team analysis (includes new person)
work-chronicler analyze team
```

### Example 4: Updating for Mid-Quarter Check-In

```bash
# 1. Fetch new data (cache mode skips existing items)
work-chronicler fetch all --all-reports --cache

# 2. Regenerate analysis
work-chronicler analyze reports alice-smith
work-chronicler analyze team

# 3. Generate summary for 1:1s
# (Using AI skills)
/work-chronicler-manager-write-quarterly-highlights alice-smith
```

## Common Use Cases

### Preparing Quarterly Reviews

**Goal**: Generate evidence-based performance reviews for all reports.

**Workflow**:

1. Fetch data for the quarter: set `fetch.since` / `fetch.until` in the profile config, then `fetch all --all-reports`
2. Analyze per-report: `analyze reports <report-id>`
3. Upload past reviews to `performance-reviews/` directories
4. Add manager notes to `notes/` directories
5. Use AI skills: `/work-chronicler-manager-write-review-packet <report-id> Q1-2026`

**Output**: Evidence-based review packets with:

- Key accomplishments with PR citations
- Project contributions
- Impact analysis
- Consistency with past reviews

### Team Visibility & Project Tracking

**Goal**: Understand what your team is working on and who's working on what.

**Workflow**:

1. Fetch recent data: `fetch all --all-reports --cache`
2. Analyze each report: `analyze reports <report-id>` for every report
3. Generate team analysis: `analyze team`
4. Review generated files:
   - `team-projects.json` - All active projects
   - `contributor-matrix.json` - Who's on which projects
   - `team-timeline.json` - Team activity by month and week, per report

**Use cases**:

- Identify collaboration patterns
- Spot project bottlenecks
- Track project momentum
- Plan resource allocation

### Onboarding New Manager Workflow

**Goal**: Set up work-chronicler as a new manager.

**Steps**:

1. `init --mode manager` - Create profile
2. Add all reports: `reports add` (interactive, repeat for each person)
3. Fetch historical data: set `fetch.since` in the profile config to the hire date, then `fetch all --all-reports`
4. Generate baseline: `analyze reports <report-id>` for each report, then `analyze team`
5. Install AI skills: `skills install`
6. Add context: Upload past reviews, add notes about each report

**Timeline**: ~30 minutes for 5 reports (including discovery and fetching)

### Pre-Calibration Preparation

**Goal**: Prepare for calibration meetings with peer managers.

**Workflow**:

1. Ensure data is current: `fetch all --all-reports --cache`
2. Analyze each report: `analyze reports <report-id>` for every report
3. Generate team analysis: `analyze team`
4. Use AI skills for summaries:
   - `/work-chronicler-manager-write-quarterly-highlights <report-id>` - Key wins per person
   - `/work-chronicler-manager-write-team-summary` - Team overview for leadership

**Output**: Concise summaries with evidence for calibration discussions.

### Identifying Top Contributors

**Goal**: Find flagship work and major contributions for visibility and recognition.

**Workflow**:

1. Fetch data: `fetch all --all-reports`
2. Analyze: `analyze reports <report-id>`
3. Review `stats.json` for each report - filter by impact:
   - `flagship` - Biggest initiatives
   - `major` - Significant features
4. Use AI skills: `/work-chronicler-detect-projects` - Identify cross-team initiatives

**Use cases**:

- Performance review calibration
- Promotion packets
- Peer recognition nominations
- Team newsletters

## Tips & Best Practices

### Fetching Strategy

- **Initial setup**: Full fetch without cache (`fetch all --all-reports`)
- **Regular updates**: Use cache mode (`fetch all --all-reports --cache`)
- **Quarterly reviews**: Fetch specific date ranges (set `fetch.since` / `fetch.until` in the profile config)
- **Frequency**: Weekly or bi-weekly fetches keep data current

### Context Management

- **Upload past reviews**: Consistency across review cycles
- **Maintain notes**: Document goals, focus areas, feedback themes
- **Review regularly**: Update notes after 1:1s to inform AI summaries

### Report Organization

- **Consistent naming**: Use full names for clarity (e.g., "Alice Smith" not "Alice")
- **Email accuracy**: Ensures Jira ticket attribution works correctly
- **Repo discovery**: Use auto-discovery for comprehensive coverage
- **Jira projects**: Only add projects the person actively works on

### AI Skills Integration

- **Install skills once**: `skills install` - Works across all reports
- **Use profile context**: AI skills auto-detect manager mode
- **Iterate on outputs**: Generate, review, regenerate with feedback
- **Combine with manual edits**: AI provides draft, you refine

### Performance Optimization

- **Cache mode**: Skip already-fetched items for faster updates
- **Targeted fetches**: Use `--report <id>` for single-person updates
- **Analysis on-demand**: Only run team analysis when needed
- **Date ranges**: Limit fetch ranges for quarterly/annual reviews via `fetch.since` / `fetch.until`

### Manager workflow

**Quarterly review prep:**

1. Fetch data: set `fetch.since` in the profile config, then `fetch all --all-reports`
2. Add context: Upload past reviews, update notes
3. Generate: `/work-chronicler-manager-write-review-packet {id} Q1-2026`
4. Review and refine
5. Save to `reports/{id}/performance-reviews/` for next cycle

## Troubleshooting

### Analysis produces no projects

**Issue**: `projects.json` has no detected projects.

**Cause**: PRs don't reference Jira tickets (project detection requires ticket links).

**Expected behavior**: This is normal for teams not using ticket references in PRs. PRs remain unassigned.

### AI skills can't find data

**Issue**: AI skills report "no data found" for a report.

**Solution**:

1. Verify data exists: `reports list` (check "Last fetch" column)
2. Run fetch if needed: `fetch all --report <id>`
3. Generate analysis: `analyze reports <id>`
4. Confirm workspace: `workspace root` should show manager profile

## Next steps

- **Try it**: `work-chronicler init --mode manager`
- **Explore AI skills**: `skills install` and try `/work-chronicler-manager-write-review-packet`
- **Read more**: See the [command reference](../tools/commands.md) for every CLI flag and the [documentation index](../index.md) for the other guides
