# Phase 4: Manager Mode & Report Discovery - Design Document

**Date**: 2026-02-04
**Status**: Approved
**Phase**: 4 of 6

---

## Overview & Goals

**Purpose**: Make work-chronicler valuable for people managers by enabling per-report data collection, analysis, and review packet generation. Supports performance review preparation as the primary use case, with team visibility as a secondary benefit.

**Key Principles**:
- Reuse existing IC logic wherever possible (same data structure per report)
- Convention-based (profile named `manager` triggers special behavior)
- Interactive by default, scriptable with flags
- Performance review prep first, team dashboards second

**Success Criteria**:
- Manager can set up multiple reports with minimal friction
- Per-report data collection mirrors IC experience
- Review packet generation provides evidence-based narratives
- Team-level visibility available as aggregate view

---

## Workspace Structure & Profile Organization

**Convention**: Profile named `manager` is treated as a special manager profile with different behavior.

### Directory Structure

```
profiles/
  manager/                    # Special manager profile
    reports/
      alice-smith/            # Report subdirectory (ID from name)
        work-log/
          github/...
          jira/...
          google-docs/...
        analysis/             # Per-report analysis (IC-style)
        outputs/              # Per-report outputs (review packets)
        performance-reviews/  # Optional: Alice's past reviews
        notes/                # Optional: Manager's notes about Alice
      bob-jones/
        work-log/...
        analysis/...
        outputs/...
        performance-reviews/
        notes/
    analysis/                 # Team-level aggregations
      team-projects.json
      contributor-matrix.json
      team-timeline.json
    outputs/                  # Team-level summaries (optional)
    config.json               # Manager config with reports list
```

### Key Design Decision

Each report subdirectory (`reports/alice-smith/`) has identical structure to an IC profile. This enables **code reuse** - all fetching, storage, and analysis logic works the same, just with different root paths:

- **IC**: `profiles/alice/work-log/`
- **Manager (for Alice)**: `profiles/manager/reports/alice-smith/work-log/`

### Optional Directories

Just like IC profiles, each report can have optional user-added directories:
- `performance-reviews/` - Past performance reviews (manager uploads)
- `notes/` - Manager's notes about the report (goals, feedback, areas of focus)

AI skills read from these directories when generating review packets, providing context and consistency with past reviews.

---

## Report Configuration Schema

### Profile Config

`profiles/manager/config.json`:

```json
{
  "mode": "manager",
  "github": {
    "token": "ghp_...",
    "org": "myorg"              // Single org (Phase 4 constraint)
  },
  "jira": {
    "host": "mycompany.atlassian.net",
    "email": "manager@company.com",
    "token": "..."
  },
  "reports": [
    {
      "name": "Alice Smith",
      "github": "alice",
      "email": "alice@company.com",
      "repos": ["repo1", "repo2"],      // No org prefix, uses manager's org
      "jiraProjects": ["PROJ1", "PROJ2"]
    },
    {
      "name": "Bob Jones",
      "github": "bjones",
      "email": "bob.jones@company.com",
      "repos": ["repo3"],
      "jiraProjects": ["PROJ1"]
    }
  ]
}
```

### Report ID Generation

- `name: "Alice Smith"` → directory: `reports/alice-smith/`
- Kebab-case conversion for directory names
- Collision handling: append `-2` if duplicate names exist

### Field Definitions

- `name`: Display name (human-readable)
- `github`: GitHub username (for discovery and PR filtering)
- `email`: Email for commit/Jira attribution
- `repos`: List of repos to fetch (discovered or manual, no org prefix)
- `jiraProjects`: List of Jira projects to fetch (manual only in Phase 4)

### Phase 4 Constraint

Single org support - all reports work within one GitHub org. Multi-org support can be added in future phases.

---

## Command Structure & UX

### New Top-Level Command: `reports`

Manager-specific operations live under `reports` namespace:

```bash
reports add <name> --github <username> --email <email> [--repos repo1,repo2] [--jira-projects PROJ1,PROJ2]
reports list
reports remove <id>
reports update <id> [--add-repo repo] [--remove-repo repo] [--add-jira-project PROJ]
```

### Command Behavior in Manager Mode

All existing commands (`fetch`, `analyze`, `link`) auto-detect manager mode and prompt for report selection:

```bash
$ fetch github
? Which report(s)?
  ◯ Alice Smith (alice-smith)
  ◯ Bob Jones (bob-jones)
  ◉ All reports

# Skip prompt with flags
$ fetch github --all-reports
$ fetch github --report alice-smith
```

### Manager Profile Detection

- Profile named exactly `manager` triggers manager mode behavior
- Commands check profile name and adapt automatically
- IC commands run against individual report subdirectories

### Initial Setup Flow

```bash
$ init --mode manager

Creating manager profile...
✓ Profile 'manager' created

? Would you like to add reports now? [Yes] [No, I'll add them later]

# If Yes: guided flow to add reports (repeatable)
Report 1:
  Name: Alice Smith
  GitHub username: alice
  Email: alice@company.com

  Repos: [Auto-discover] [Specify manually] [Skip for now]
  → If auto-discover: runs discovery
  → If manual: prompts for repos
  → If skip: can add later

  Jira projects (comma-separated): PROJ1, PROJ2

✓ Alice Smith (alice-smith) added

? Add another report? [Yes] [No]

# If No initially:
✓ Manager profile ready. Use 'reports add' to add reports later.
```

---

## Repo Discovery & Data Collection

### GitHub Repo Discovery

Reuse existing discovery logic from `src/cli/commands/init/init.utils.ts`:

```typescript
// For each report
const result = await discoverRepos(
  token,
  managerConfig.github.org,
  report.github,  // username
  prCount,
  since,
  until
);
```

**Discovery Process**:
1. List repos in org updated since date (efficient filtering)
2. For each repo, check if username has PRs in time range
3. Return repos where user contributed

### Jira Project Assignment

- **Phase 4**: Manual specification only (`--jira-projects PROJ1,PROJ2`)
- No auto-discovery (too noisy, projects usually well-known)
- **Future**: Could add email-based discovery if needed

### Fetching Behavior

When manager runs `fetch --all-reports`:

**Series execution** (one report at a time):

```
Fetching data for Alice Smith (1/3)...
  ✓ Found 12 repos via discovery
  Fetching PRs... 45/120 (37%)
  Fetching Jira tickets... 12/30 (40%)
✓ Alice Smith complete (2m 15s)

Fetching data for Bob Jones (2/3)...
  ✓ Found 8 repos via discovery
  Fetching PRs... 23/80 (28%)
  ...
```

**Why series?**
- Clear feedback (see progress per person)
- Simpler implementation
- Easier debugging
- One-time/quarterly operation (speed less critical)
- Can add parallel fetching in future if needed

---

## Analysis: Per-Report & Team-Level

### Dual-Layer Analysis

1. **Per-Report Analysis** (reuse IC logic)
2. **Team-Level Aggregations** (manager-specific)

### Per-Report Analysis

```bash
$ analyze reports alice-smith
# Runs IC-style analysis on alice-smith's work-log
# Outputs to: profiles/manager/reports/alice-smith/analysis/
```

**Generated files** (per report):
- `projects.json` - Detected projects
- `impact.json` - Impact scores per PR
- `timeline.json` - Chronological activity

### Team-Level Aggregations

```bash
$ analyze team
# Or: analyze reports --all (runs per-report + team aggregations)
# Outputs to: profiles/manager/analysis/
```

**Generated files** (team-level):
- `team-projects.json` - All projects across all reports
- `contributor-matrix.json` - Who worked on which projects
- `team-timeline.json` - Team activity rollup

### Analysis Strategy

- **CLI**: Structured data (JSON) for both per-report and team
- **AI Skills**: Generate narrative outputs (review packets, summaries) from structured data
- **Separation of concerns**: CLI = data, AI = narrative

### Outputs Directory Usage

- `profiles/manager/reports/alice-smith/outputs/` - Review packets for Alice (AI-generated)
- `profiles/manager/outputs/` - Team summaries (AI-generated, optional)

---

## Reports Management Commands

### `reports add`

**Guided interactive**:

```bash
$ reports add
Name: Alice Smith
GitHub username: alice
Email: alice@company.com

Repos: [Auto-discover] [Specify manually] [Skip for now]
→ Auto-discover: runs discovery for alice in manager's org
→ Manual: prompts for comma-separated list
→ Skip: can add later with 'reports update'

Jira projects (comma-separated): PROJ1, PROJ2

✓ Alice Smith (alice-smith) added to config
```

**Non-interactive with flags**:

```bash
$ reports add alice-smith --github alice --email alice@company.com --repos repo1,repo2 --jira-projects PROJ1
```

### `reports list`

```bash
$ reports list

Manager profile: manager
Org: myorg

Reports (2):
  1. Alice Smith (alice-smith)
     GitHub: alice | Email: alice@company.com
     Repos: 12 | Jira Projects: 2
     Last fetch: 2026-02-01 10:30 AM

  2. Bob Jones (bob-jones)
     GitHub: bjones | Email: bob.jones@company.com
     Repos: 8 | Jira Projects: 1
     Last fetch: 2026-02-03 2:15 PM
```

### `reports remove`

```bash
$ reports remove alice-smith

? What should we do with alice-smith's data?
  ◯ Keep data (remove from config only)
  ◉ Delete data (remove config + delete all work-log/analysis/outputs)

⚠️  Deleting data is permanent and cannot be undone.

# Non-interactive
$ reports remove alice-smith --keep-data
$ reports remove alice-smith --delete-data
```

### `reports update`

```bash
$ reports update alice-smith --add-repo repo3
$ reports update alice-smith --remove-repo repo1
$ reports update alice-smith --add-jira-project PROJ3
$ reports update alice-smith --remove-jira-project PROJ2
```

---

## Error Handling & Edge Cases

### Profile Mode Validation

Commands validate profile mode and provide helpful errors:

```bash
$ reports add alice
Error: 'reports' commands only available in manager mode.
Current profile 'alice' is in IC mode.

Hint: Create a manager profile with 'init --mode manager'
```

### Duplicate Report Names

```bash
$ reports add
Name: Alice Smith

⚠️  A report named "Alice Smith" (alice-smith) already exists.
Please use a different name or update the existing report.
```

### Missing Configuration

```bash
$ fetch github --all-reports
Error: Manager profile missing GitHub org configuration.
Run 'config edit' to add github.org
```

### Empty Reports List

```bash
$ fetch github --all-reports
Error: No reports configured in manager profile.
Add reports with 'reports add' or 'init --mode manager'
```

### Discovery Failures

Per-report discovery can fail independently:

```bash
Discovering repos for Alice Smith...
✓ Alice Smith: Found 12 repos

Discovering repos for Bob Jones...
✗ Bob Jones: GitHub API rate limit exceeded

Summary: 1/2 reports completed. Retry failed reports later.
```

### Partial Fetch Failures

Similar to Phase 3 error handling - continue on failures, log errors:

```bash
Fetching data for Alice Smith (1/2)...
  ✓ GitHub: 45 PRs fetched
  ✗ Jira: API authentication failed

✓ Alice Smith partially complete (see errors)

Errors logged to: profiles/manager/reports/alice-smith/.fetch-errors.json
```

---

## AI Skills

### New Manager-Specific AI Skills

**`/write-review-packet`** - Generate performance review packet for a report
- Reads: `profiles/manager/reports/alice-smith/analysis/`, `work-log/`, `performance-reviews/`, `notes/`
- Outputs: `profiles/manager/reports/alice-smith/outputs/review-packet-q1-2026.md`
- Context-aware: uses past reviews and manager notes

**`/summarize-report`** - Summarize a report's contributions over time period
- Quick summary of PRs, projects, impact
- Useful for quick check-ins

**`/quarterly-highlights`** - Extract key highlights per report for quarterly reviews
- Focus on most impactful work
- Evidence-linked (cites PRs, docs, tickets)

**`/team-summary`** (optional, secondary goal) - Team-level summary
- Reads: `profiles/manager/analysis/team-*.json`
- Outputs: `profiles/manager/outputs/team-summary-q1-2026.md`
- Useful for manager updates to leadership

### AI Skill Pattern

- Skills receive profile path + report ID
- Read from structured analysis data (JSON)
- Read from optional directories (performance-reviews/, notes/)
- Generate narrative markdown in outputs/

### Context Sources

AI skills pull from multiple sources:
1. **work-log/** - Current period's contributions
2. **analysis/** - Structured project/impact data
3. **performance-reviews/** - Past reviews for context
4. **notes/** - Manager's notes on goals/focus areas

This provides rich context for generating evidence-based, personalized review packets.

---

## Testing Strategy

### Unit Tests (vitest)

1. **Report ID Generation**:
   - Test name → kebab-case conversion
   - Test collision handling (duplicate names)
   - Test special character handling

2. **Config Validation**:
   - Test manager profile schema validation
   - Test report config validation
   - Test required fields enforcement

3. **Path Resolution**:
   - Test workspace root resolution for IC vs manager mode
   - Test report-specific path resolution
   - `profiles/alice/work-log/` vs `profiles/manager/reports/alice-smith/work-log/`

4. **Command Mode Detection**:
   - Test profile name detection (`manager` → manager mode)
   - Test command behavior adaptation

### Integration Tests

1. **Reports Management**:
   - Mock config file operations
   - Test add/list/remove/update flows
   - Test data preservation on remove

2. **Discovery Reuse**:
   - Test existing `discoverRepos()` with manager config
   - Verify per-report discovery isolation

3. **Fetching**:
   - Test series execution (one report at a time)
   - Test progress reporting per report
   - Test partial failure handling

4. **Analysis**:
   - Test per-report analysis execution
   - Test team-level aggregation generation
   - Verify analysis output paths

### Manual Testing

- Complete manager profile setup flow
- Add multiple reports via CLI
- Run discovery for reports
- Fetch data for all reports (verify series execution and progress)
- Generate per-report and team analysis
- Test AI skill integration with manager data
- Upload performance reviews and notes, verify AI skills use them

### Test Coverage Target

>80% for manager-specific logic

---

## Implementation Phases

### Phase 4.1: Manager Profile & Config (~2-3 days)
- Manager profile detection (`mode: "manager"`)
- Report config schema and validation
- Path resolution for manager/report structure
- Unit tests for config and path resolution

### Phase 4.2: Reports Management Commands (~3-4 days)
- `reports add` with guided and flag-based modes
- `reports list` with status display
- `reports remove` with data deletion prompt
- `reports update` for repo/project management
- Integration tests

### Phase 4.3: Discovery Integration (~2 days)
- Integrate existing `discoverRepos()` for per-report discovery
- Handle single-org constraint
- Discovery progress display per report

### Phase 4.4: Command Auto-Detection & Prompting (~2-3 days)
- Auto-detect manager mode in `fetch`, `analyze`, `link` commands
- Interactive report selection prompts
- Flag support (`--all-reports`, `--report <id>`)
- Series execution for multi-report operations

### Phase 4.5: Analysis Layer (~3-4 days)
- Per-report analysis (reuse IC logic with different root)
- Team-level aggregations (projects, contributor matrix, timeline)
- `analyze team` command
- Unit tests for aggregation logic

### Phase 4.6: Manager Init Flow (~2 days)
- `init --mode manager` command
- Guided report addition during init
- Optional setup flow

### Phase 4.7: AI Skills (~3-4 days, parallel work)
- `/write-review-packet`
- `/summarize-report`
- `/quarterly-highlights`
- Optional: `/team-summary`
- Context integration (performance-reviews/, notes/)

**Total Estimate**: ~17-22 days of focused development (CLI + AI skills)

---

## Dependencies & Considerations

### Code Reuse

- **Discovery**: Existing `discoverRepos()` from `init.utils.ts`
- **Fetching**: Existing GitHub/Jira fetchers work with different root paths
- **Analysis**: Existing IC analysis logic with path parameter
- **Storage**: Same markdown + frontmatter format per report

### New Dependencies

None! Phase 4 reuses existing infrastructure.

### Constraints

- **Single org** in Phase 4 (multi-org in future)
- **Series fetching** (parallel can be added later if needed)
- **Manual Jira projects** (auto-discovery in future if needed)

### Migration Considerations

- No migration needed for IC profiles (unchanged)
- Manager profile is new, no backward compatibility concerns

### Security

- Manager's GitHub/Jira tokens access all report data
- Reports don't need individual auth (manager provides access)
- Per-report data isolated in subdirectories

### Future Enhancements (out of scope for Phase 4)

- Multi-org support per report
- Jira auto-discovery by email
- Parallel fetching for speed
- Manager dashboard UI (Phase 6)
- Report-to-report comparison tools

---

## Summary & Key Decisions

### What we're building

A manager mode for work-chronicler that enables performance review preparation by collecting, analyzing, and generating review packets for multiple reports using a single manager profile.

### Key Design Decisions

1. **Convention-based**: Profile named `manager` triggers special behavior
2. **Code reuse**: Each report mirrors IC profile structure for maximum reuse
3. **Single org**: Phase 4 supports one org, expandable later
4. **Interactive by default**: Commands prompt for report selection, flags for scripting
5. **Series execution**: Fetch reports one at a time with clear progress
6. **Dual-layer analysis**: Per-report (IC-style) + team-level aggregations
7. **Hybrid output model**: CLI = structured data, AI skills = narratives
8. **Manual Jira**: No auto-discovery in Phase 4 (projects well-known)
9. **Context-rich AI**: Skills read from performance-reviews/ and notes/ directories

### Success Metrics

- Manager can set up 5+ reports in <10 minutes
- Per-report data collection identical to IC experience
- Review packet generation uses past reviews + notes context
- Team-level visibility available via aggregations
- Zero code duplication between IC and manager modes

### Workspace Structure

```
profiles/manager/
  reports/
    alice-smith/
      work-log/, analysis/, outputs/
      performance-reviews/, notes/  # Optional, user-added
```

### Next Steps

- Review and validate this design
- Create detailed implementation plan
- Begin Phase 4.1 (Manager Profile & Config)
