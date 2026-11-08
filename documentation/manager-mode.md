# Manager Mode Guide

Manager mode enables people managers to track work across multiple reports, making performance review preparation and team visibility significantly easier.

## Table of Contents

- [Overview](#overview)
- [Setup](#setup)
- [Managing Reports](#managing-reports)
- [Fetching Data](#fetching-data)
- [Analysis](#analysis)
- [Directory Structure](#directory-structure)
- [Complete Workflow Examples](#complete-workflow-examples)
- [Common Use Cases](#common-use-cases)

---

## Overview

### What is Manager Mode?

Manager mode extends work-chronicler to support people managers who need to:
- Track work across multiple direct reports
- Prepare evidence-based performance reviews
- Maintain team visibility and project awareness
- Generate quarterly rollups and team summaries

Unlike individual contributor (IC) mode where you track your own work, manager mode lets you collect, analyze, and summarize work for your entire team.

### Who is it for?

- **Engineering managers** preparing quarterly performance reviews
- **Tech leads** tracking team contributions across projects
- **Directors** needing team-level visibility
- Anyone managing 2+ engineers who wants automated evidence collection

### Key Features

- **Per-report workspaces**: Each direct report gets isolated data collection (PRs, tickets, notes)
- **Automated discovery**: Auto-discover repos where each person contributed
- **Dual-layer analysis**: Individual analysis per report + team-level aggregations
- **Review packet generation**: AI skills generate evidence-based review content
- **Context-rich**: Include past reviews and notes for consistency

---

## Setup

### Creating a Manager Profile

Initialize work-chronicler with manager mode:

```bash
# Interactive setup (recommended)
work-chronicler init --mode manager

# This will guide you through:
# 1. Naming the profile (default "manager"; any name works)
# 2. Configuring GitHub org and token
# 3. Optionally configuring Jira
# 4. Adding your first reports
```

**Example interactive flow:**

```
Creating manager profile...
✓ Profile 'manager' created

GitHub Configuration:
? GitHub organization: acme-corp
? GitHub token: ghp_******************** (input hidden)

Jira Configuration (optional):
? Configure Jira? Yes
? Jira host: acme.atlassian.net
? Jira email: manager@acme.com
? Jira API token: ****************** (input hidden)

✓ Configuration saved

? Would you like to add reports now? Yes
```

### GitHub Token Requirements

Create a GitHub personal access token at https://github.com/settings/tokens with:
- **Scope**: `repo` (for private repos) or `public_repo` (for public repos only)
- **Read access** to PRs, commits, and repositories

The manager's token is used to fetch data for all reports.

### Jira Configuration (Optional)

If your team uses Jira:
1. Create an API token at https://id.atlassian.com/manage-profile/security/api-tokens
2. Provide your Jira host (e.g., `company.atlassian.net`)
3. Use your manager email for attribution

### Adding Your First Reports

During `init`, you can add reports interactively:

```
Report 1:
  Name: Alice Smith
  GitHub username: alice
  Email: alice@acme.com

  Repos: [Auto-discover] [Specify manually] [Skip for now]
  → Auto-discover

  Discovering repos for alice in acme-corp...
  ✓ Found 12 repos with contributions

  Jira projects (comma-separated, optional): PLAT, AUTH

✓ Alice Smith (alice-smith) added

? Add another report? Yes
```

**Or skip and add later:**

```bash
work-chronicler reports add
```

---

## Managing Reports

### Adding Reports

**Interactive mode** (recommended for first-time setup):

```bash
work-chronicler reports add
```

This prompts for:
- Name (e.g., "Alice Smith")
- GitHub username (e.g., "alice")
- Email (e.g., "alice@acme.com")
- Repo discovery method:
  - **Auto-discover**: Scan org for repos where this person contributed
  - **Specify manually**: Enter comma-separated repo list
  - **Skip for now**: Add repos later
- Jira projects (comma-separated, optional)

**Non-interactive mode** (for scripting):

```bash
work-chronicler reports add "Alice Smith" \
  --github alice \
  --email alice@acme.com \
  --repos frontend,backend,infra \
  --jira-projects PLAT,AUTH
```

The optional `[name]` argument is the display name (the report ID is derived from it, e.g. `alice-smith`). The command only runs non-interactively when both `--github` and `--email` are given; otherwise it prompts. Repo auto-discovery is available only in the interactive prompts (choose **Auto-discover**).

### Listing Reports

View all configured reports:

```bash
work-chronicler reports list
```

**Example output:**

```
Manager profile: manager
Org: acme-corp

Reports (3):
  1. Alice Smith (alice-smith)
     GitHub: alice | Email: alice@acme.com
     Repos: 12 | Jira Projects: 2 (PLAT, AUTH)
     Last fetch: 2026-02-01 10:30 AM
     Status: ✓ Up to date

  2. Bob Jones (bob-jones)
     GitHub: bjones | Email: bob.jones@acme.com
     Repos: 8 | Jira Projects: 1 (PLAT)
     Last fetch: 2026-02-03 2:15 PM
     Status: ✓ Up to date

  3. Charlie Davis (charlie-davis)
     GitHub: cdavis | Email: charlie@acme.com
     Repos: 5 | Jira Projects: 0
     Last fetch: Never
     Status: ⚠ Not yet fetched
```

### Updating Reports

Modify repos or projects for existing reports:

```bash
# Add a repository
work-chronicler reports update alice-smith --add-repo new-service

# Remove a repository
work-chronicler reports update alice-smith --remove-repo old-repo

# Add Jira project
work-chronicler reports update bob-jones --add-jira-project FRONTEND

# Remove Jira project
work-chronicler reports update bob-jones --remove-jira-project LEGACY
```

### Removing Reports

Remove a report with optional data deletion:

**Interactive** (prompts for data deletion choice):

```bash
work-chronicler reports remove alice-smith
```

**Output:**

```
? What should we do with alice-smith's data?
  ◯ Keep data (remove from config only)
  ◉ Delete data (remove config + delete all work-log/analysis/outputs)

⚠️  Deleting data is permanent and cannot be undone.
```

**Non-interactive:**

```bash
# Keep data in filesystem, remove from config
work-chronicler reports remove alice-smith --keep-data

# Delete everything (config + all data)
work-chronicler reports remove alice-smith --delete-data
```

---

## Fetching Data

All fetch commands (`github`, `jira`, `all`) support three modes in manager mode:
- **Interactive**: Prompts for report selection when no flags provided
- **Single report**: `--report <id>` to fetch for one report
- **All reports**: `--all-reports` to fetch for all reports

**Important**: Each report is fetched using their individual credentials (GitHub username, email), not the manager's credentials.

### Fetch All Reports

Fetch data for all reports at once:

```bash
# Interactive (prompts for report selection)
work-chronicler fetch all

# Non-interactive (fetch all reports)
work-chronicler fetch all --all-reports

# Also works with github and jira commands
work-chronicler fetch github --all-reports
work-chronicler fetch jira --all-reports
```

**Example output:**

```
Fetching data for all reports...

Fetching data for Alice Smith (1/3)...
  ✓ Found 12 repos
  Fetching GitHub PRs... 45/120 (37%)
  Fetching Jira tickets... 12/30 (40%)
✓ Alice Smith complete (2m 15s)

Fetching data for Bob Jones (2/3)...
  ✓ Found 8 repos
  Fetching GitHub PRs... 23/80 (28%)
  Fetching Jira tickets... 8/20 (40%)
✓ Bob Jones complete (1m 45s)

Fetching data for Charlie Davis (3/3)...
  ✓ Found 5 repos
  Fetching GitHub PRs... 12/50 (24%)
✓ Charlie Davis complete (1m 10s)

Summary:
✓ 3/3 reports completed
  Total PRs: 80
  Total tickets: 20
  Time: 5m 10s
```

### Fetch Individual Report

Fetch data for a specific report:

```bash
# Interactive selection (any fetch command)
work-chronicler fetch all
work-chronicler fetch github
work-chronicler fetch jira

? Which report(s)?
  ◯ Alice Smith (alice-smith)
  ◯ Bob Jones (bob-jones)
  ◯ Charlie Davis (charlie-davis)
  ◉ All reports

# Or specify directly
work-chronicler fetch all --report alice-smith
work-chronicler fetch github --report bob-jones
work-chronicler fetch jira --report charlie-davis
```

### Cache Mode

Use `--cache` to skip already-fetched items:

```bash
# Works with any fetch command
work-chronicler fetch all --all-reports --cache
work-chronicler fetch github --report alice-smith --cache
```

This is useful for incremental updates - only new PRs and tickets are fetched.

### Importing Records for a Report

Records staged by an import skill go into one report's work log with
`--report`. Every record must name that report as its subject, and the report
must be in the profile:

```bash
work-chronicler validate ./staged-batch --report alice-smith
work-chronicler import ./staged-batch --report alice-smith
```

See [Import](commands.md#import) for the record format and how a batch is
stored all or nothing. `analyze reports <id>` counts a report's imported
messages in a separate `messages` section of its `stats.json`; project
detection, the timeline and `analyze team` cover PRs and tickets only. The
manager skills cite messages as supplementary evidence, never as PRs or
tickets.

### Slack for a Report

Slack import is opt-in per report: a report without Slack settings
contributes no Slack records. Only channels that you (the manager) and the
report both belong to may be used. The CLI cannot see Slack, so the setup
skill (`/work-chronicler-setup-slack`) checks membership through your Slack
connector, and you confirm it for each channel with `--shared-with-manager`;
the CLI refuses a report channel without that confirmation, and `import`
refuses records from a channel that lacks it. `/work-chronicler-import-slack`
then imports the report's own messages from those channels. Run both skills
with the report ID, for example `/work-chronicler-setup-slack alice-smith`.

```bash
work-chronicler slack configure --report alice-smith \
  --workspace T0EXAMPLE --user U0EXAMPLE2
work-chronicler slack channels add C0EXAMPLE --report alice-smith \
  --name billing-launch --reason "Launch coordination" --shared-with-manager
work-chronicler slack show --report alice-smith --json
```

The same rules as for an IC apply: only the report's own messages, public
channels unless `--private` opts one in, never direct messages. See
[Slack](commands.md#slack).

---

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
an IC profile (see [Impact thresholds](configuration.md#impact-thresholds)).

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

See [Impact thresholds](configuration.md#impact-thresholds) for the full rule order.

**Project Detection:**

Projects are detected by grouping PRs that reference the same Jira tickets. PRs without ticket references remain unassigned.

**Timeline View:**

Shows work grouped by ISO week and month:
- Weekly/monthly PR counts
- Additions/deletions per period
- Busiest weeks/months
- Impact distribution over time

---

## Directory Structure

Manager mode uses a specialized directory structure:

```
~/.work-chronicler/
└── profiles/
    └── manager/                    # Manager profile
        ├── config.yaml              # Manager config (GitHub org, reports list)
        ├── .env                     # Tokens (GitHub, Jira)
        ├── reports/                 # Per-report workspaces
        │   ├── alice-smith/
        │   │   ├── work-log/
        │   │   │   ├── pull-requests/
        │   │   │   │   └── acme-corp/
        │   │   │   │       ├── frontend/
        │   │   │   │       │   ├── 2024-01-15_123.md
        │   │   │   │       │   └── 2024-02-20_456.md
        │   │   │   │       └── backend/...
        │   │   │   ├── jira/
        │   │   │   │   └── acme-corp/
        │   │   │   │       ├── PLAT/
        │   │   │   │       │   ├── PLAT-100.md
        │   │   │   │       │   └── PLAT-101.md
        │   │   │   │       └── AUTH/...
        │   │   │   └── messages/    # Records stored by `import --report alice-smith`
        │   │   ├── analysis/        # Per-report analysis
        │   │   │   ├── stats.json
        │   │   │   ├── projects.json
        │   │   │   └── timeline.json
        │   │   ├── performance-reviews/  # Optional: Past reviews
        │   │   │   └── 2025-q4-review.md
        │   │   ├── peer-reviews/         # Optional: Peer feedback
        │   │   │   └── 2025-q4-peer-feedback.md
        │   │   └── notes/                # Optional: Manager notes
        │   │       └── 2026-goals.md
        │   ├── bob-jones/
        │   │   ├── work-log/...
        │   │   ├── analysis/...
        │   │   ├── performance-reviews/
        │   │   └── notes/
        │   └── charlie-davis/...
        └── analysis/                # Team-level analysis
            ├── team-projects.json
            ├── contributor-matrix.json
            └── team-timeline.json
```

### Optional Directories

Each report can have optional user-added directories:

**`performance-reviews/`**
- Upload past performance reviews for each report
- AI skills read these for context and consistency
- Helps maintain consistent language and themes

**`peer-reviews/`**
- Upload peer feedback and reviews for each report
- Provides collaboration context and external perspectives
- Helps understand how report is perceived by colleagues
- Useful for identifying collaboration strengths and areas for growth

**`notes/`**
- Add manager notes about the report
- Document goals, focus areas, feedback themes
- Provide context for AI-generated review packets

**Example notes structure:**

```
reports/alice-smith/notes/
├── 2026-q1-goals.md       # Quarterly goals
├── 1-1-notes.md           # Ongoing 1:1 notes
└── focus-areas.md         # Development focus areas
```

---

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
/work-chronicler-manager-write-review-packet alice-smith --quarter Q1-2026
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

---

## Common Use Cases

### Preparing Quarterly Reviews

**Goal**: Generate evidence-based performance reviews for all reports.

**Workflow**:
1. Fetch data for the quarter: set `fetch.since` / `fetch.until` in the profile config, then `fetch all --all-reports`
2. Analyze per-report: `analyze reports <report-id>`
3. Upload past reviews to `performance-reviews/` directories
4. Add manager notes to `notes/` directories
5. Use AI skills: `/work-chronicler-manager-write-review-packet <report-id> --quarter Q1-2026`

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

---

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

---

## Troubleshooting

### "No reports configured"

**Error**: `Error: No reports configured in manager profile.`

**Solution**: Add reports with `reports add` or re-run `init --mode manager`

### Discovery finds no repos

**Issue**: Auto-discovery returns 0 repos for a report.

**Possible causes**:
- GitHub username is incorrect
- Person hasn't contributed to org repos recently
- Date range is too narrow (the auto-discovery lookback is fixed at 6 months)

**Solution**:
- Verify GitHub username: `reports list`
- Use manual repo specification: `reports update <id> --add-repo <repo>`
- Add repos manually with `reports update` if discovery misses them

### Fetch fails for one report

**Issue**: Fetch succeeds for some reports but fails for others.

**Behavior**: work-chronicler continues with other reports and logs errors. If every repository in the manager org fails to fetch for a report (or the org cannot be listed), it prints a warning naming the org and exits with status 1 after processing the remaining reports.

**Check**:
- Errors: printed to the terminal for each failing repo (no error log file is written)
- Verify report config: `reports list`

**Common causes**:
- Invalid repo names (typos)
- GitHub rate limiting (wait and retry)
- Jira project permissions

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

---

## Next Steps

- **Try it**: `work-chronicler init --mode manager`
- **Explore AI skills**: `skills install` and try `/work-chronicler-manager-write-review-packet`
- **Read more**: See the [command reference](commands.md) for every CLI flag and the [documentation index](index.md) for the other guides

---

**Questions or feedback?** Open an issue at [github.com/your-org/work-chronicler](https://github.com/your-org/work-chronicler)
