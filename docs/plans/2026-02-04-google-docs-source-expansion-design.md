# Phase 3: Google Docs Source Expansion - Design Document

**Date**: 2026-02-04
**Status**: Approved
**Phase**: 3 of 6

---

## Overview & Goals

**Purpose**: Expand work-chronicler beyond code artifacts (PRs, tickets) to capture high-value narrative documents like RFCs, PRDs, postmortems, and roadmaps. This makes the tool valuable for non-engineers (PMs, managers) and provides richer context for AI analysis.

**Key Principles**:
- Maintain the Markdown + frontmatter contract (no new storage formats)
- OAuth-based authentication (no service accounts, no special IT setup)
- Semantic preservation over visual fidelity (readable Markdown, not pixel-perfect conversion)
- Deterministic, inspectable outputs (users can read/diff the markdown)

**Success Criteria**:
- Users can discover and fetch Google Docs with minimal friction
- Converted Markdown is readable and semantically accurate
- Update detection prevents redundant fetching
- Works for both IC and manager use cases (access-based, not ownership-based)

---

## Authentication & Authorization

### OAuth Device Flow

Users authenticate via OAuth device flow - the CLI displays a code and URL, user visits the URL in their browser, enters the code, and grants permission. This matches the existing GitHub token pattern and works on any machine (no localhost callback required).

### Google API Scope

Request `https://www.googleapis.com/auth/drive.readonly` - read-only access to all Drive files. This allows:
- Reading Google Docs content
- Listing files via Drive API
- Accessing docs the user owns OR has been shared with them
- No accidental modifications

### Token Storage

Tokens stored per-profile at `~/.work-chronicler/profiles/<profile>/google-oauth-token.json`. This enables:
- Different Google accounts per profile (work vs OSS vs management)
- Profile isolation (tokens don't leak across contexts)
- Separate from config.json (security, easier to gitignore)

### Token Lifecycle

- Access tokens expire after ~1 hour
- Refresh tokens allow automatic renewal without re-authentication
- If refresh fails (token revoked), re-prompt for OAuth flow
- Token refresh happens automatically before API calls

---

## Command Structure & UX Flow

### Command

`fetch google-docs`

### Behavior depends on context

**First-time users** (no saved selection):
1. Run discovery flow (filters → metadata fetch → selection)
2. Fetch selected docs
3. Save selection to profile

**Returning users** (have saved selection):
- Prompt: "You have 12 docs selected. [Update existing] [Add more docs] [Cancel]"
  - **Update existing**: Skip discovery, fetch only modified docs (compare `modifiedTime`)
  - **Add more docs**: Run discovery with existing selection pre-checked, fetch new + modified
  - **Cancel**: Exit

### Power-user flags

- `--cache`: Skip prompt, update modified docs only (fast updates)
- `--refresh`: Skip prompt, re-fetch ALL docs even if unmodified (for testing/debugging)
- `--discover`: Skip prompt, force discovery flow (for scripting)

### Why this design?

- Interactive by default (good for learning/exploration)
- Smart prompts reduce repetitive work
- Flags enable automation and power-user workflows
- Consistent with existing `fetch` commands

---

## Discovery Flow

### Step 1: Guided Filters

Interactive prompts to narrow discovery scope:

1. **Time Range**: "How far back should we look?"
   - Options: Last 3 months / 6 months / 12 months / All time
   - Filters by `modifiedTime` (when doc was last edited)

2. **Title Keywords** (optional): "Filter by title keywords (comma-separated):"
   - User input: e.g., "RFC, PRD, Postmortem, Roadmap"
   - Case-insensitive substring match
   - Empty = no keyword filter

3. **Ownership**: "Which docs should we include?"
   - Options: My docs only / Shared with me / Both
   - Reduces noise from unrelated shared docs

### Step 2: Metadata Fetch

Use Drive API `files.list` with query filters:
- Apply time range, keyword, ownership filters
- Fetch metadata only: `docId`, `title`, `createdTime`, `modifiedTime`, `owners`, `sharedDrive`
- Show count: "Found 156 matching documents"
- No doc content downloaded yet (fast)

### Step 3: Save Filters (optional)

After selection: "Save these filters for future runs? [Yes] [No]"
- If yes, store in profile config for next `fetch google-docs --discover` run
- Filters become new defaults (can be changed)

---

## Interactive Selection

### Multi-Select Checkbox UI

After metadata fetch, present an interactive list using `inquirer-ts-checkbox-plus-prompt`:

```
? Select docs to fetch: (↑↓ to move, Space to select, Type to filter)

❯ ◯ [2026-01-15] Vox Migration RFC
     By: Alice Smith | Drive: Engineering Docs | Modified: 2026-02-01

  ◯ [2026-01-20] Q1 Product Roadmap
     By: Bob Jones | Drive: Product | Modified: 2026-02-03

  ◉ [2026-01-22] Auth System Postmortem
     By: Carol Lee | Drive: Engineering Docs | Modified: 2026-01-22

  ... (153 more)

Search: _
```

### Key Features

- **Real-time search**: Type to filter by title, owner, or drive name
- **Persistent selection**: Selections stay checked as you filter in/out
- **Pre-checked existing**: If adding more docs, previously selected docs are pre-checked
- **Detailed display**: Multi-line format with date, owner, drive, last modified

### Workflow

Filter → select → clear filter → select more → confirm

### Selection Storage

Save selected doc IDs to profile config as `googleDocs.selectedDocIds: string[]`

---

## Fetching & Conversion Pipeline

### Fetch Process

For each selected doc:
1. Check if already exists locally (compare doc ID in frontmatter)
2. If exists, compare `modifiedTime` from API vs stored frontmatter
3. Skip if unmodified (unless `--refresh` flag used)
4. If new or modified, fetch via Google Docs API `documents.get`

### Rate Limiting

- Throttle requests to stay under Google API quota (1,000 requests/100sec)
- Show progress: "Fetching docs... 45/200 (22%)"
- Automatic retry with exponential backoff on 429 errors
- Transparent to user - just works

### Conversion: Structured JSON → Markdown

Google Docs API returns structured JSON. Convert to semantic Markdown:

**Supported elements**:
- Headings (`#` - `######`)
- Paragraphs with inline formatting (bold, italic, links)
- Bullet and numbered lists (nested)
- Tables (basic pipe syntax, may lose merged cells)
- Horizontal rules

**Explicitly ignored** (v1):
- Images (dropped silently)
- Comments/suggestions (dropped)
- Smart chips, drawings (dropped)
- Visual formatting: colors, fonts, spacing

**Output**: Clean, readable Markdown focused on content structure

---

## Storage & Frontmatter

### File Path

```
work-log/google-docs/2026-01-15-vox-migration-rfc-1a2b3c4d.md
                     └─date──┘ └──────title───────┘ └doc-id┘
```

- **Date**: `createdTime` for chronological sorting
- **Title**: Sanitized (lowercase, hyphens, alphanumeric only)
- **Doc ID**: First 8 chars of Google doc ID (collision prevention)

### Frontmatter

Conforms to canonical contract:

```yaml
---
schemaVersion: 1
source: google-docs
id: 1a2b3c4d5e6f7g8h9i0j
title: Vox Migration RFC
url: https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit
createdTime: 2026-01-15T10:30:00Z
modifiedTime: 2026-02-01T14:22:00Z
profile: work

# Google Docs specific (optional)
owners:
  - Alice Smith
sharedDrive: Engineering Docs
---
```

**Stable IDs**: The `id` field (full doc ID) remains stable even if doc is renamed or moved

---

## Error Handling

### Philosophy

Partial success over all-or-nothing. One bad doc shouldn't block 50 good ones.

### Conversion Failures

When a doc fails to convert (API error, unexpected JSON structure, parsing failure):

1. Log error details to `work-log/google-docs/.errors.json`:
   ```json
   {
     "failedDocs": [
       {
         "docId": "abc123",
         "title": "Problematic Doc",
         "error": "Unsupported table structure",
         "timestamp": "2026-02-04T10:30:00Z"
       }
     ]
   }
   ```

2. Continue processing remaining docs

3. Show summary: "Fetched 15/18 docs (3 failed). See work-log/google-docs/.errors.json"

### User Actions

- Investigate failed docs (open in Google Docs, check for weird formatting)
- Retry specific docs: `fetch google-docs --refresh` after fixing
- Or ignore if doc isn't critical

### Other Errors

- **OAuth failures**: Clear instructions to re-authenticate
- **Network errors**: Automatic retry with backoff (up to 3 attempts)
- **API quota exceeded**: Clear message with wait time

---

## Profile Config Schema

### New fields added to profile `config.json`

```json
{
  "googleDocs": {
    "enabled": true,
    "savedFilters": {
      "timeRange": "6months",
      "keywords": ["RFC", "PRD", "Postmortem"],
      "ownership": "both"
    },
    "selectedDocIds": [
      "1a2b3c4d5e6f7g8h9i0j",
      "2b3c4d5e6f7g8h9i0jk1"
    ],
    "lastFetchTime": "2026-02-04T10:30:00Z"
  }
}
```

### Fields

- `enabled`: Feature flag (future: could disable google-docs for a profile)
- `savedFilters`: User's preferred discovery filters (optional, only if they chose to save)
- `selectedDocIds`: Array of doc IDs to fetch/update (the "cache" of what to fetch)
- `lastFetchTime`: When `fetch google-docs` last ran (for analytics/debugging)

### Behavior

- Empty `selectedDocIds` → first-time flow (run discovery)
- Populated `selectedDocIds` → returning user flow (prompt for update vs add more)
- Missing `savedFilters` → use defaults when running discovery

---

## Testing Strategy

### Unit Tests (vitest)

1. **Conversion Logic** (critical):
   - Test Google Docs JSON → Markdown conversion
   - Use fixture files with real API responses
   - Verify output for: headings, lists, tables, formatting, nested structures
   - Test edge cases: empty docs, unsupported elements, malformed JSON

2. **Filter Logic**:
   - Test time range calculations
   - Test keyword matching (case-insensitive, partial matches)
   - Test ownership filtering

3. **Utilities**:
   - Filename sanitization (special chars, length limits)
   - Doc ID extraction from URLs
   - Frontmatter generation

### Integration Tests

- Mock Google APIs (Drive, Docs)
- Test full flow: discovery → selection → fetch → storage
- Verify file creation and frontmatter correctness

### Manual Testing

- OAuth flow (requires real Google account)
- Interactive selection UI (hard to automate)
- Real doc conversion (test with various doc types)

### Test Coverage Target

>80% for conversion logic, utilities, and core flow

---

## Implementation Phases

### Phase 3.1: Authentication & Setup (~2-3 days)
- OAuth device flow implementation
- Token storage and refresh logic
- Profile config schema updates
- Manual testing with real Google account

### Phase 3.2: Discovery & Selection (~3-4 days)
- Guided filter prompts (time range, keywords, ownership)
- Drive API metadata fetching
- Interactive multi-select UI with search
- Save filters and selection to profile
- Unit tests for filter logic

### Phase 3.3: Conversion Engine (~4-5 days)
- Google Docs API integration
- JSON → Markdown converter (headings, paragraphs, lists, tables, formatting)
- Extensive vitest unit tests with fixtures
- Handle unsupported elements gracefully

### Phase 3.4: Fetch Command & Update Logic (~2-3 days)
- Command structure with prompt-based flow
- Flags: `--cache`, `--refresh`, `--discover`
- Update detection (compare `modifiedTime`)
- Rate limiting and progress display

### Phase 3.5: Error Handling & Polish (~2 days)
- Partial success logic
- Error logging to `.errors.json`
- User-friendly error messages
- Integration tests

**Total Estimate**: ~13-17 days of focused development

---

## Dependencies & Considerations

### New Dependencies

- `googleapis` - Official Google API client for Node.js (Drive + Docs APIs)
- `inquirer-ts-checkbox-plus-prompt` - TypeScript multi-select with search functionality
- Potentially `turndown` or custom converter for HTML-like content to Markdown

### API Constraints

- **Rate Limits**: 1,000 requests per 100 seconds per user (handled with throttling)
- **Quota**: 10,000 requests per day for free tier (should be sufficient for typical usage)
- **Token Expiry**: Access tokens expire after ~1 hour (handled with refresh tokens)

### Security Considerations

- Store tokens in profile-specific files (not in config.json)
- Add `google-oauth-token.json` to `.gitignore` patterns
- Use read-only scope (`drive.readonly`) - no write access
- Users control what's fetched via explicit selection

### Compatibility

- Works with personal Google accounts and Google Workspace accounts
- No admin/IT setup required (unlike service accounts)
- Cross-platform (OAuth device flow works on any OS)

### Future Extensions (out of scope for Phase 3)

- Support Google Sheets, Slides
- Comment/suggestion preservation
- Image download and embedding

---

## Summary & Key Decisions

### What we're building

A Google Docs fetching system that discovers, selects, and converts Google Docs to Markdown while maintaining the canonical Markdown + frontmatter contract.

### Key Design Decisions

1. **OAuth device flow** - no service accounts, works for everyone
2. **Profile-scoped tokens** - different Google accounts per profile
3. **Smart command UX** - interactive by default, flags for power users
4. **Update detection** - only fetch modified docs (efficient)
5. **Semantic Markdown** - readable content over visual fidelity
6. **Partial success** - one failure doesn't block everything
7. **Rate-limited fetching** - automatic throttling with progress
8. **Comprehensive testing** - vitest for conversion logic

### Success Metrics

- First-time user can fetch docs without reading docs
- Returning users can update with single command (`--cache`)
- Conversion preserves 95%+ of content structure
- Failed conversions are logged and retryable

### Next Steps

- Review and validate this design
- Create detailed implementation plan
- Begin Phase 3.1 (Authentication & Setup)
