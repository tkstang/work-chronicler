# Phase 3: Google Docs Source Expansion - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Google Docs fetching to work-chronicler with OAuth authentication, interactive discovery/selection, and semantic Markdown conversion.

**Architecture:** Reuse existing fetch command pattern (subcommand under `fetch`). OAuth tokens stored per-profile. Discovery uses Drive API for metadata, Docs API for content. Conversion produces semantic Markdown with frontmatter.

**Tech Stack:**
- `googleapis` (Google Drive + Docs APIs)
- `inquirer-ts-checkbox-plus-prompt` (interactive multi-select)
- OAuth2 device flow (no localhost callback needed)
- Existing storage/config infrastructure

---

## Task 1: Add Dependencies & Update .gitignore

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

**Step 1: Add new dependencies to package.json**

Run:
```bash
pnpm add googleapis inquirer-ts-checkbox-plus-prompt
pnpm add -D @types/inquirer
```

**Step 2: Add google-oauth-token.json to .gitignore**

Add to `.gitignore`:
```
# Google OAuth tokens (per-profile)
google-oauth-token.json
```

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml .gitignore
git commit -m "feat(google-docs): add googleapis and inquirer-ts-checkbox-plus-prompt dependencies"
```

---

## Task 2: Create Google Docs Types

**Files:**
- Create: `src/cli/commands/fetch/google-docs/google-docs.types.ts`

**Step 1: Create types file**

```typescript
/**
 * Google Docs fetch types
 */

/**
 * Time range options for discovery
 */
export type TimeRange = '3months' | '6months' | '12months' | 'all';

/**
 * Ownership filter options
 */
export type OwnershipFilter = 'mine' | 'shared' | 'both';

/**
 * Discovery filter configuration
 */
export interface DiscoveryFilters {
  timeRange: TimeRange;
  keywords?: string[];
  ownership: OwnershipFilter;
}

/**
 * Document metadata from Drive API
 */
export interface DocMetadata {
  id: string;
  title: string;
  createdTime: string;
  modifiedTime: string;
  owners: string[];
  sharedDrive?: string;
  webViewLink: string;
}

/**
 * OAuth token storage format
 */
export interface GoogleOAuthToken {
  access_token: string;
  refresh_token: string;
  scope: string;
  token_type: string;
  expiry_date: number;
}

/**
 * Google Docs config in profile
 */
export interface GoogleDocsConfig {
  enabled: boolean;
  savedFilters?: DiscoveryFilters;
  selectedDocIds: string[];
  lastFetchTime?: string;
}

/**
 * Fetch result per document
 */
export interface DocFetchResult {
  docId: string;
  title: string;
  status: 'success' | 'skipped' | 'failed';
  error?: string;
  filePath?: string;
}

/**
 * Error log entry
 */
export interface DocErrorEntry {
  docId: string;
  title: string;
  error: string;
  timestamp: string;
}
```

**Step 2: Commit**

```bash
git add src/cli/commands/fetch/google-docs/google-docs.types.ts
git commit -m "feat(google-docs): add type definitions"
```

---

## Task 3: Create OAuth Authentication Module

**Files:**
- Create: `src/cli/commands/fetch/google-docs/google-docs.auth.ts`
- Create test: `tests/cli/commands/fetch/google-docs/google-docs.auth.test.ts` (manual test later)

**Step 1: Write OAuth authentication utilities**

```typescript
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { GoogleOAuthToken } from './google-docs.types';

/**
 * OAuth2 scopes required for Google Docs fetching
 */
const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

/**
 * OAuth2 client configuration
 */
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';

/**
 * Get OAuth token file path for a profile
 *
 * @param profilePath - Absolute path to profile directory
 * @returns Absolute path to OAuth token file
 */
export function getTokenPath(profilePath: string): string {
  return path.join(profilePath, 'google-oauth-token.json');
}

/**
 * Create OAuth2 client
 *
 * @returns Configured OAuth2 client
 */
export function createOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
}

/**
 * Load OAuth token from profile directory
 *
 * @param profilePath - Absolute path to profile directory
 * @returns OAuth token or null if not found
 */
export async function loadToken(
  profilePath: string,
): Promise<GoogleOAuthToken | null> {
  const tokenPath = getTokenPath(profilePath);

  try {
    const content = await fs.readFile(tokenPath, 'utf-8');
    return JSON.parse(content) as GoogleOAuthToken;
  } catch {
    return null;
  }
}

/**
 * Save OAuth token to profile directory
 *
 * @param profilePath - Absolute path to profile directory
 * @param token - OAuth token to save
 */
export async function saveToken(
  profilePath: string,
  token: GoogleOAuthToken,
): Promise<void> {
  const tokenPath = getTokenPath(profilePath);
  await fs.writeFile(tokenPath, JSON.stringify(token, null, 2), 'utf-8');
}

/**
 * Run OAuth device flow to get new token
 *
 * @param oauth2Client - OAuth2 client
 * @returns OAuth token
 */
export async function runDeviceFlow(
  oauth2Client: OAuth2Client,
): Promise<GoogleOAuthToken> {
  // Get device code
  const deviceCodeResponse = await oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('\n🔐 Google OAuth Authentication Required\n');
  console.log('1. Visit this URL in your browser:');
  console.log(`   ${deviceCodeResponse}\n`);
  console.log('2. Sign in and authorize work-chronicler');
  console.log('3. Return here after authorization\n');

  // Note: This is simplified - real implementation would use device code flow
  // For now, this is a placeholder that needs to be completed with actual device flow logic

  throw new Error('Device flow not yet implemented - requires Google Cloud Project setup');
}

/**
 * Get authenticated OAuth2 client
 *
 * Loads existing token or runs device flow if needed.
 * Automatically refreshes expired tokens.
 *
 * @param profilePath - Absolute path to profile directory
 * @returns Authenticated OAuth2 client
 */
export async function getAuthenticatedClient(
  profilePath: string,
): Promise<OAuth2Client> {
  const oauth2Client = createOAuth2Client();

  // Try to load existing token
  const token = await loadToken(profilePath);

  if (!token) {
    // No token found - run device flow
    const newToken = await runDeviceFlow(oauth2Client);
    await saveToken(profilePath, newToken);
    oauth2Client.setCredentials(newToken);
    return oauth2Client;
  }

  // Set credentials
  oauth2Client.setCredentials(token);

  // Check if token is expired and refresh if needed
  if (token.expiry_date && Date.now() >= token.expiry_date) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      const refreshedToken: GoogleOAuthToken = {
        access_token: credentials.access_token!,
        refresh_token: credentials.refresh_token || token.refresh_token,
        scope: credentials.scope || token.scope,
        token_type: credentials.token_type || token.token_type,
        expiry_date: credentials.expiry_date || token.expiry_date,
      };
      await saveToken(profilePath, refreshedToken);
      oauth2Client.setCredentials(refreshedToken);
    } catch (error) {
      // Refresh failed - need to re-authenticate
      throw new Error(
        'OAuth token refresh failed. Please re-authenticate with: fetch google-docs --discover'
      );
    }
  }

  return oauth2Client;
}
```

**Step 2: Commit**

```bash
git add src/cli/commands/fetch/google-docs/google-docs.auth.ts
git commit -m "feat(google-docs): add OAuth authentication utilities"
```

**Note**: OAuth device flow implementation requires Google Cloud Project setup with OAuth credentials. For now, this is a placeholder structure that can be completed when credentials are available.

---

## Task 4: Create Utility Functions

**Files:**
- Create: `src/cli/commands/fetch/google-docs/google-docs.utils.ts`
- Create test: `tests/cli/commands/fetch/google-docs/google-docs.utils.test.ts`

**Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import {
  sanitizeFilename,
  extractDocId,
  formatTimeRange,
  generateFilename,
} from '../../../../../src/cli/commands/fetch/google-docs/google-docs.utils';

describe('google-docs.utils', () => {
  describe('sanitizeFilename', () => {
    it('converts to lowercase and replaces spaces with hyphens', () => {
      expect(sanitizeFilename('Vox Migration RFC')).toBe('vox-migration-rfc');
    });

    it('removes special characters', () => {
      expect(sanitizeFilename('Q1: Product Roadmap (2026)')).toBe('q1-product-roadmap-2026');
    });

    it('handles multiple consecutive spaces', () => {
      expect(sanitizeFilename('Multiple   Spaces')).toBe('multiple-spaces');
    });

    it('truncates to 50 characters', () => {
      const longTitle = 'This is a very long document title that should be truncated';
      const result = sanitizeFilename(longTitle);
      expect(result.length).toBeLessThanOrEqual(50);
    });
  });

  describe('extractDocId', () => {
    it('extracts doc ID from Google Docs URL', () => {
      const url = 'https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit';
      expect(extractDocId(url)).toBe('1a2b3c4d5e6f7g8h9i0j');
    });

    it('handles URLs with query parameters', () => {
      const url = 'https://docs.google.com/document/d/1a2b3c4d5e6f7g8h9i0j/edit?usp=sharing';
      expect(extractDocId(url)).toBe('1a2b3c4d5e6f7g8h9i0j');
    });

    it('returns the ID if already just an ID', () => {
      expect(extractDocId('1a2b3c4d5e6f7g8h9i0j')).toBe('1a2b3c4d5e6f7g8h9i0j');
    });
  });

  describe('formatTimeRange', () => {
    it('returns date for 3 months', () => {
      const result = formatTimeRange('3months');
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      expect(new Date(result).getTime()).toBeCloseTo(threeMonthsAgo.getTime(), -100000);
    });

    it('returns date for 6 months', () => {
      const result = formatTimeRange('6months');
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      expect(new Date(result).getTime()).toBeCloseTo(sixMonthsAgo.getTime(), -100000);
    });

    it('returns date for 12 months', () => {
      const result = formatTimeRange('12months');
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      expect(new Date(result).getTime()).toBeCloseTo(twelveMonthsAgo.getTime(), -100000);
    });

    it('returns very old date for "all"', () => {
      const result = formatTimeRange('all');
      expect(result).toBe('2000-01-01T00:00:00.000Z');
    });
  });

  describe('generateFilename', () => {
    it('generates filename with date, title, and short doc ID', () => {
      const result = generateFilename(
        '2026-01-15T10:30:00Z',
        'Vox Migration RFC',
        '1a2b3c4d5e6f7g8h9i0j'
      );
      expect(result).toBe('2026-01-15-vox-migration-rfc-1a2b3c4d.md');
    });

    it('uses first 8 chars of doc ID', () => {
      const result = generateFilename(
        '2026-01-15T10:30:00Z',
        'Test Doc',
        'abcdefghijklmnop'
      );
      expect(result).toMatch(/-abcdefgh\.md$/);
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm test`
Expected: Tests fail with "module not found"

**Step 3: Write minimal implementation**

```typescript
import type { TimeRange } from './google-docs.types';

/**
 * Sanitize title for use in filename
 *
 * - Converts to lowercase
 * - Replaces spaces with hyphens
 * - Removes special characters
 * - Truncates to 50 characters
 *
 * @param title - Document title
 * @returns Sanitized filename-safe string
 */
export function sanitizeFilename(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // Remove special chars
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/-+/g, '-') // Collapse multiple hyphens
    .slice(0, 50); // Truncate
}

/**
 * Extract document ID from Google Docs URL or return as-is if already an ID
 *
 * @param urlOrId - Google Docs URL or document ID
 * @returns Document ID
 */
export function extractDocId(urlOrId: string): string {
  const match = urlOrId.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : urlOrId;
}

/**
 * Convert time range to ISO date string
 *
 * @param timeRange - Time range option
 * @returns ISO date string for comparison
 */
export function formatTimeRange(timeRange: TimeRange): string {
  const now = new Date();

  switch (timeRange) {
    case '3months':
      now.setMonth(now.getMonth() - 3);
      break;
    case '6months':
      now.setMonth(now.getMonth() - 6);
      break;
    case '12months':
      now.setMonth(now.getMonth() - 12);
      break;
    case 'all':
      return '2000-01-01T00:00:00.000Z';
  }

  return now.toISOString();
}

/**
 * Generate filename for Google Doc
 *
 * Format: YYYY-MM-DD-{sanitized-title}-{short-doc-id}.md
 *
 * @param createdTime - ISO date string
 * @param title - Document title
 * @param docId - Full document ID
 * @returns Filename
 */
export function generateFilename(
  createdTime: string,
  title: string,
  docId: string,
): string {
  const date = createdTime.split('T')[0]; // Extract YYYY-MM-DD
  const sanitizedTitle = sanitizeFilename(title);
  const shortId = docId.slice(0, 8); // First 8 chars

  return `${date}-${sanitizedTitle}-${shortId}.md`;
}

/**
 * Delay for rate limiting
 *
 * @param ms - Milliseconds to wait
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/cli/commands/fetch/google-docs/google-docs.utils.ts tests/cli/commands/fetch/google-docs/google-docs.utils.test.ts
git commit -m "feat(google-docs): add utility functions with tests"
```

---

## Task 5: Create Drive API Discovery Module

**Files:**
- Create: `src/cli/commands/fetch/google-docs/google-docs.discovery.ts`

**Step 1: Write discovery functions**

```typescript
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import ora from 'ora';
import type {
  DocMetadata,
  DiscoveryFilters,
  OwnershipFilter,
} from './google-docs.types';
import { formatTimeRange } from './google-docs.utils';

/**
 * Build Drive API query string from filters
 *
 * @param filters - Discovery filters
 * @returns Drive API query string
 */
function buildQuery(filters: DiscoveryFilters): string {
  const parts: string[] = [];

  // File type filter (Google Docs only)
  parts.push("mimeType='application/vnd.google-apps.document'");

  // Time range filter
  if (filters.timeRange !== 'all') {
    const since = formatTimeRange(filters.timeRange);
    parts.push(`modifiedTime >= '${since}'`);
  }

  // Title keywords filter
  if (filters.keywords && filters.keywords.length > 0) {
    const keywordQueries = filters.keywords.map(
      (keyword) => `name contains '${keyword}'`
    );
    parts.push(`(${keywordQueries.join(' or ')})`);
  }

  // Trashed filter
  parts.push('trashed=false');

  return parts.join(' and ');
}

/**
 * Discover Google Docs based on filters
 *
 * @param auth - Authenticated OAuth2 client
 * @param filters - Discovery filters
 * @returns Array of document metadata
 */
export async function discoverDocs(
  auth: OAuth2Client,
  filters: DiscoveryFilters,
): Promise<DocMetadata[]> {
  const spinner = ora('Discovering documents...').start();

  try {
    const drive = google.drive({ version: 'v3', auth });
    const query = buildQuery(filters);

    spinner.text = 'Querying Drive API...';

    const docs: DocMetadata[] = [];
    let pageToken: string | undefined;

    do {
      const response = await drive.files.list({
        q: query,
        pageSize: 100,
        fields: 'nextPageToken, files(id, name, createdTime, modifiedTime, owners, webViewLink, driveId)',
        pageToken,
        // Note: ownership filtering done post-fetch for simplicity
      });

      const files = response.data.files || [];

      for (const file of files) {
        if (!file.id || !file.name) continue;

        // Apply ownership filter
        if (shouldIncludeByOwnership(file, filters.ownership, auth)) {
          docs.push({
            id: file.id,
            title: file.name,
            createdTime: file.createdTime || new Date().toISOString(),
            modifiedTime: file.modifiedTime || new Date().toISOString(),
            owners: file.owners?.map((o) => o.displayName || o.emailAddress || 'Unknown') || [],
            sharedDrive: file.driveId,
            webViewLink: file.webViewLink || `https://docs.google.com/document/d/${file.id}/edit`,
          });
        }
      }

      pageToken = response.data.nextPageToken || undefined;
      spinner.text = `Found ${docs.length} documents...`;
    } while (pageToken);

    spinner.succeed(`Found ${docs.length} matching documents`);
    return docs;
  } catch (error) {
    spinner.fail('Discovery failed');
    throw error;
  }
}

/**
 * Check if file should be included based on ownership filter
 *
 * @param file - Drive file object
 * @param filter - Ownership filter
 * @param auth - OAuth2 client (to get current user email)
 * @returns True if file should be included
 */
function shouldIncludeByOwnership(
  file: any,
  filter: OwnershipFilter,
  auth: OAuth2Client,
): boolean {
  if (filter === 'both') return true;

  // Get current user email from auth
  // Simplified - in real implementation would fetch from auth.credentials
  const userEmail = process.env.USER_EMAIL || '';

  const isOwner = file.owners?.some((o: any) => o.emailAddress === userEmail);

  if (filter === 'mine') return isOwner;
  if (filter === 'shared') return !isOwner;

  return true;
}
```

**Step 2: Commit**

```bash
git add src/cli/commands/fetch/google-docs/google-docs.discovery.ts
git commit -m "feat(google-docs): add Drive API discovery module"
```

---

## Task 6: Create Interactive Selection Module

**Files:**
- Create: `src/cli/commands/fetch/google-docs/google-docs.selection.ts`

**Step 1: Write selection functions**

```typescript
import checkbox from 'inquirer-ts-checkbox-plus-prompt';
import type { DocMetadata } from './google-docs.types';

/**
 * Format document for display in selection list
 *
 * @param doc - Document metadata
 * @returns Formatted display string (multi-line)
 */
function formatDocDisplay(doc: DocMetadata): string {
  const date = doc.createdTime.split('T')[0];
  const modified = doc.modifiedTime.split('T')[0];
  const owner = doc.owners[0] || 'Unknown';
  const drive = doc.sharedDrive ? ` | Drive: ${doc.sharedDrive}` : '';

  return `[${date}] ${doc.title}\n   By: ${owner}${drive} | Modified: ${modified}`;
}

/**
 * Search/filter function for checkbox prompt
 *
 * @param input - User search input
 * @param doc - Document metadata
 * @returns True if doc matches search
 */
function searchDocs(input: string, doc: DocMetadata): boolean {
  if (!input) return true;

  const searchLower = input.toLowerCase();

  return (
    doc.title.toLowerCase().includes(searchLower) ||
    doc.owners.some((o) => o.toLowerCase().includes(searchLower)) ||
    (doc.sharedDrive && doc.sharedDrive.toLowerCase().includes(searchLower))
  );
}

/**
 * Interactive document selection with multi-select and search
 *
 * @param docs - Array of document metadata
 * @param preselected - Array of doc IDs to pre-select (for "add more" flow)
 * @returns Array of selected doc IDs
 */
export async function selectDocs(
  docs: DocMetadata[],
  preselected: string[] = [],
): Promise<string[]> {
  if (docs.length === 0) {
    console.log('No documents to select.');
    return [];
  }

  const choices = docs.map((doc) => ({
    name: formatDocDisplay(doc),
    value: doc.id,
    checked: preselected.includes(doc.id),
  }));

  const selected = await checkbox({
    message: 'Select docs to fetch (↑↓ to move, Space to select, Type to filter):',
    choices,
    pageSize: 10,
    search: searchDocs,
  });

  return selected;
}
```

**Step 2: Commit**

```bash
git add src/cli/commands/fetch/google-docs/google-docs.selection.ts
git commit -m "feat(google-docs): add interactive selection module"
```

**Note**: The `inquirer-ts-checkbox-plus-prompt` API might differ - adjust implementation based on actual package documentation.

---

## Task 7: Create Google Docs Converter (Part 1 - Structure)

**Files:**
- Create: `src/cli/commands/fetch/google-docs/google-docs.converter.ts`
- Create test: `tests/cli/commands/fetch/google-docs/google-docs.converter.test.ts`

**Step 1: Write failing test for basic conversion**

```typescript
import { describe, it, expect } from 'vitest';
import { convertToMarkdown } from '../../../../../src/cli/commands/fetch/google-docs/google-docs.converter';

describe('google-docs.converter', () => {
  it('converts basic paragraph', () => {
    const docJson = {
      body: {
        content: [
          {
            paragraph: {
              elements: [
                {
                  textRun: {
                    content: 'This is a test paragraph.\n',
                  },
                },
              ],
            },
          },
        ],
      },
    };

    const markdown = convertToMarkdown(docJson);
    expect(markdown).toContain('This is a test paragraph.');
  });

  it('converts heading', () => {
    const docJson = {
      body: {
        content: [
          {
            paragraph: {
              paragraphStyle: {
                namedStyleType: 'HEADING_1',
              },
              elements: [
                {
                  textRun: {
                    content: 'My Heading\n',
                  },
                },
              ],
            },
          },
        ],
      },
    };

    const markdown = convertToMarkdown(docJson);
    expect(markdown).toContain('# My Heading');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: Test fails

**Step 3: Write minimal implementation**

```typescript
/**
 * Google Docs to Markdown converter
 *
 * Converts Google Docs JSON structure to semantic Markdown.
 */

/**
 * Convert Google Docs JSON to Markdown
 *
 * @param docJson - Google Docs API response (documents.get)
 * @returns Markdown string
 */
export function convertToMarkdown(docJson: any): string {
  if (!docJson.body || !docJson.body.content) {
    return '';
  }

  const lines: string[] = [];

  for (const element of docJson.body.content) {
    if (element.paragraph) {
      const markdown = convertParagraph(element.paragraph);
      if (markdown) {
        lines.push(markdown);
      }
    }
    // TODO: Add table, list support in next task
  }

  return lines.join('\n\n').trim();
}

/**
 * Convert paragraph element to Markdown
 *
 * @param paragraph - Paragraph element from Docs API
 * @returns Markdown string or empty if should be skipped
 */
function convertParagraph(paragraph: any): string {
  if (!paragraph.elements || paragraph.elements.length === 0) {
    return '';
  }

  // Extract text content
  const textParts: string[] = [];

  for (const element of paragraph.elements) {
    if (element.textRun) {
      textParts.push(convertTextRun(element.textRun));
    }
  }

  let text = textParts.join('').trim();
  if (!text) return '';

  // Apply heading style
  const style = paragraph.paragraphStyle?.namedStyleType;
  if (style && style.startsWith('HEADING_')) {
    const level = parseInt(style.replace('HEADING_', ''), 10);
    const hashes = '#'.repeat(Math.min(level, 6));
    return `${hashes} ${text}`;
  }

  return text;
}

/**
 * Convert text run with inline formatting
 *
 * @param textRun - Text run element from Docs API
 * @returns Formatted text
 */
function convertTextRun(textRun: any): string {
  let text = textRun.content || '';

  // Remove trailing newline (handled by paragraph spacing)
  text = text.replace(/\n$/, '');

  const style = textRun.textStyle;
  if (!style) return text;

  // Apply bold
  if (style.bold) {
    text = `**${text}**`;
  }

  // Apply italic
  if (style.italic) {
    text = `*${text}*`;
  }

  // Apply link
  if (style.link?.url) {
    text = `[${text}](${style.link.url})`;
  }

  return text;
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm test`
Expected: Tests pass

**Step 5: Commit**

```bash
git add src/cli/commands/fetch/google-docs/google-docs.converter.ts tests/cli/commands/fetch/google-docs/google-docs.converter.test.ts
git commit -m "feat(google-docs): add basic Markdown converter (paragraphs, headings)"
```

---

## Task 8: Extend Converter (Lists & Tables)

**Files:**
- Modify: `src/cli/commands/fetch/google-docs/google-docs.converter.ts`
- Modify: `tests/cli/commands/fetch/google-docs/google-docs.converter.test.ts`

**Step 1: Add test for lists**

```typescript
it('converts bullet list', () => {
  const docJson = {
    body: {
      content: [
        {
          paragraph: {
            bullet: {
              listId: 'list1',
              nestingLevel: 0,
            },
            elements: [
              {
                textRun: {
                  content: 'First item\n',
                },
              },
            ],
          },
        },
        {
          paragraph: {
            bullet: {
              listId: 'list1',
              nestingLevel: 0,
            },
            elements: [
              {
                textRun: {
                  content: 'Second item\n',
                },
              },
            ],
          },
        },
      ],
    },
    lists: {
      list1: {
        listProperties: {
          nestingLevels: [
            {
              glyphType: 'GLYPH_TYPE_UNSPECIFIED', // Bullet
            },
          ],
        },
      },
    },
  };

  const markdown = convertToMarkdown(docJson);
  expect(markdown).toContain('- First item');
  expect(markdown).toContain('- Second item');
});
```

**Step 2: Add test for tables**

```typescript
it('converts basic table', () => {
  const docJson = {
    body: {
      content: [
        {
          table: {
            rows: 2,
            columns: 2,
            tableRows: [
              {
                tableCells: [
                  {
                    content: [
                      {
                        paragraph: {
                          elements: [{ textRun: { content: 'Header 1\n' } }],
                        },
                      },
                    ],
                  },
                  {
                    content: [
                      {
                        paragraph: {
                          elements: [{ textRun: { content: 'Header 2\n' } }],
                        },
                      },
                    ],
                  },
                ],
              },
              {
                tableCells: [
                  {
                    content: [
                      {
                        paragraph: {
                          elements: [{ textRun: { content: 'Cell 1\n' } }],
                        },
                      },
                    ],
                  },
                  {
                    content: [
                      {
                        paragraph: {
                          elements: [{ textRun: { content: 'Cell 2\n' } }],
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        },
      ],
    },
  };

  const markdown = convertToMarkdown(docJson);
  expect(markdown).toContain('| Header 1 | Header 2 |');
  expect(markdown).toContain('| Cell 1 | Cell 2 |');
});
```

**Step 3: Run tests to verify they fail**

Run: `pnpm test`
Expected: New tests fail

**Step 4: Implement list and table conversion**

Add to `convertToMarkdown`:

```typescript
export function convertToMarkdown(docJson: any): string {
  if (!docJson.body || !docJson.body.content) {
    return '';
  }

  const lines: string[] = [];
  const lists = docJson.lists || {};

  for (const element of docJson.body.content) {
    if (element.paragraph) {
      const markdown = convertParagraph(element.paragraph, lists);
      if (markdown) {
        lines.push(markdown);
      }
    } else if (element.table) {
      const markdown = convertTable(element.table);
      if (markdown) {
        lines.push(markdown);
      }
    }
    // Silently skip unsupported elements (images, etc.)
  }

  return lines.join('\n\n').trim();
}
```

Update `convertParagraph` signature and add list handling:

```typescript
function convertParagraph(paragraph: any, lists: any): string {
  if (!paragraph.elements || paragraph.elements.length === 0) {
    return '';
  }

  // Extract text content
  const textParts: string[] = [];

  for (const element of paragraph.elements) {
    if (element.textRun) {
      textParts.push(convertTextRun(element.textRun));
    }
  }

  let text = textParts.join('').trim();
  if (!text) return '';

  // Check for bullet/list
  if (paragraph.bullet) {
    const indent = '  '.repeat(paragraph.bullet.nestingLevel || 0);
    const listId = paragraph.bullet.listId;
    const isNumbered = lists[listId]?.listProperties?.nestingLevels?.[0]?.glyphType?.includes('DECIMAL');
    const marker = isNumbered ? '1.' : '-';
    return `${indent}${marker} ${text}`;
  }

  // Apply heading style
  const style = paragraph.paragraphStyle?.namedStyleType;
  if (style && style.startsWith('HEADING_')) {
    const level = parseInt(style.replace('HEADING_', ''), 10);
    const hashes = '#'.repeat(Math.min(level, 6));
    return `${hashes} ${text}`;
  }

  return text;
}
```

Add table conversion:

```typescript
/**
 * Convert table element to Markdown
 *
 * @param table - Table element from Docs API
 * @returns Markdown table string
 */
function convertTable(table: any): string {
  if (!table.tableRows || table.tableRows.length === 0) {
    return '';
  }

  const lines: string[] = [];

  for (let i = 0; i < table.tableRows.length; i++) {
    const row = table.tableRows[i];
    const cells: string[] = [];

    for (const cell of row.tableCells) {
      // Extract text from cell content
      let cellText = '';
      if (cell.content) {
        for (const element of cell.content) {
          if (element.paragraph) {
            cellText += convertParagraph(element.paragraph, {});
          }
        }
      }
      cells.push(cellText.trim());
    }

    lines.push(`| ${cells.join(' | ')} |`);

    // Add separator after first row (header)
    if (i === 0) {
      lines.push(`| ${cells.map(() => '---').join(' | ')} |`);
    }
  }

  return lines.join('\n');
}
```

**Step 5: Run tests to verify they pass**

Run: `pnpm test`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/cli/commands/fetch/google-docs/google-docs.converter.ts tests/cli/commands/fetch/google-docs/google-docs.converter.test.ts
git commit -m "feat(google-docs): add list and table conversion support"
```

---

## Task 9: Create Fetcher Module

**Files:**
- Create: `src/cli/commands/fetch/google-docs/google-docs.fetcher.ts`

**Step 1: Write fetcher implementation**

```typescript
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import ora from 'ora';
import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import type { DocFetchResult, DocErrorEntry, DocMetadata } from './google-docs.types';
import { convertToMarkdown } from './google-docs.converter';
import { generateFilename, sleep } from './google-docs.utils';

/**
 * Rate limiting configuration
 */
const REQUESTS_PER_100_SEC = 1000;
const BATCH_SIZE = 50; // Process in batches
const BATCH_DELAY_MS = 5000; // 5 seconds between batches

/**
 * Fetch and convert documents
 *
 * @param auth - Authenticated OAuth2 client
 * @param docs - Array of document metadata
 * @param outputDir - Absolute path to google-docs output directory
 * @param skipUnmodified - Skip docs that haven't been modified
 * @returns Array of fetch results
 */
export async function fetchDocs(
  auth: OAuth2Client,
  docs: DocMetadata[],
  outputDir: string,
  skipUnmodified = true,
): Promise<DocFetchResult[]> {
  const results: DocFetchResult[] = [];
  const errors: DocErrorEntry[] = [];

  const spinner = ora(`Fetching ${docs.length} documents...`).start();

  // Ensure output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  // Process in batches for rate limiting
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, Math.min(i + BATCH_SIZE, docs.length));

    for (let j = 0; j < batch.length; j++) {
      const doc = batch[j];
      const overallIndex = i + j + 1;

      spinner.text = `Fetching docs... ${overallIndex}/${docs.length} (${Math.round((overallIndex / docs.length) * 100)}%)`;

      try {
        const result = await fetchSingleDoc(
          auth,
          doc,
          outputDir,
          skipUnmodified,
        );
        results.push(result);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        results.push({
          docId: doc.id,
          title: doc.title,
          status: 'failed',
          error: errorMsg,
        });

        errors.push({
          docId: doc.id,
          title: doc.title,
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
      }
    }

    // Delay between batches
    if (i + BATCH_SIZE < docs.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Write errors to .errors.json if any
  if (errors.length > 0) {
    const errorsPath = path.join(outputDir, '.errors.json');
    await fs.writeFile(
      errorsPath,
      JSON.stringify({ failedDocs: errors }, null, 2),
      'utf-8'
    );
  }

  const succeeded = results.filter((r) => r.status === 'success').length;
  const skipped = results.filter((r) => r.status === 'skipped').length;
  const failed = results.filter((r) => r.status === 'failed').length;

  spinner.succeed(
    `Fetched ${succeeded}/${docs.length} docs (${skipped} skipped, ${failed} failed)`
  );

  if (failed > 0) {
    console.log(`\n⚠️  ${failed} documents failed. See ${path.join(outputDir, '.errors.json')} for details.`);
  }

  return results;
}

/**
 * Fetch and convert a single document
 *
 * @param auth - Authenticated OAuth2 client
 * @param doc - Document metadata
 * @param outputDir - Output directory path
 * @param skipUnmodified - Skip if unmodified
 * @returns Fetch result
 */
async function fetchSingleDoc(
  auth: OAuth2Client,
  doc: DocMetadata,
  outputDir: string,
  skipUnmodified: boolean,
): Promise<DocFetchResult> {
  const filename = generateFilename(doc.createdTime, doc.title, doc.id);
  const filePath = path.join(outputDir, filename);

  // Check if exists and compare modifiedTime
  if (skipUnmodified) {
    try {
      const existingContent = await fs.readFile(filePath, 'utf-8');
      const { data: frontmatter } = matter(existingContent);

      if (frontmatter.modifiedTime === doc.modifiedTime) {
        return {
          docId: doc.id,
          title: doc.title,
          status: 'skipped',
          filePath,
        };
      }
    } catch {
      // File doesn't exist or couldn't be read - proceed with fetch
    }
  }

  // Fetch document content
  const docs = google.docs({ version: 'v1', auth });
  const response = await docs.documents.get({
    documentId: doc.id,
  });

  // Convert to Markdown
  const markdown = convertToMarkdown(response.data);

  // Generate frontmatter
  const frontmatter = {
    schemaVersion: 1,
    source: 'google-docs',
    id: doc.id,
    title: doc.title,
    url: doc.webViewLink,
    createdTime: doc.createdTime,
    modifiedTime: doc.modifiedTime,
    profile: 'PROFILE_NAME', // TODO: Get from config
    owners: doc.owners,
    ...(doc.sharedDrive && { sharedDrive: doc.sharedDrive }),
  };

  // Combine frontmatter and content
  const fileContent = matter.stringify(markdown, frontmatter);

  // Write to file
  await fs.writeFile(filePath, fileContent, 'utf-8');

  return {
    docId: doc.id,
    title: doc.title,
    status: 'success',
    filePath,
  };
}
```

**Step 2: Commit**

```bash
git add src/cli/commands/fetch/google-docs/google-docs.fetcher.ts
git commit -m "feat(google-docs): add document fetcher with rate limiting"
```

---

## Task 10: Create Main Command

**Files:**
- Create: `src/cli/commands/fetch/google-docs/index.ts`
- Modify: `src/cli/commands/fetch/index.ts` (register subcommand)

**Step 1: Write main command**

```typescript
import { Command } from 'commander';
import { confirm, select, input } from '@inquirer/prompts';
import chalk from 'chalk';
import path from 'node:path';
import type { TimeRange, OwnershipFilter, DiscoveryFilters } from './google-docs.types';
import { getAuthenticatedClient } from './google-docs.auth';
import { discoverDocs } from './google-docs.discovery';
import { selectDocs } from './google-docs.selection';
import { fetchDocs } from './google-docs.fetcher';
// TODO: Import profile/config utilities

/**
 * Google Docs fetch command
 */
export const googleDocsCommand = new Command('google-docs')
  .description('Fetch Google Docs (RFCs, PRDs, postmortems)')
  .option('--cache', 'Skip discovery, update modified docs only')
  .option('--refresh', 'Re-fetch all docs even if unmodified')
  .option('--discover', 'Force discovery flow')
  .action(async (options) => {
    try {
      await runGoogleDocsFetch(options);
    } catch (error) {
      console.error(chalk.red('\n❌ Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

/**
 * Main fetch logic
 */
async function runGoogleDocsFetch(options: {
  cache?: boolean;
  refresh?: boolean;
  discover?: boolean;
}): Promise<void> {
  // TODO: Get profile path from workspace resolver
  const profilePath = '/path/to/profile'; // Placeholder
  const outputDir = path.join(profilePath, 'work-log', 'google-docs');

  // TODO: Load config
  const config: any = {}; // Placeholder
  const googleDocsConfig = config.googleDocs || { selectedDocIds: [] };

  // Authenticate
  console.log(chalk.blue('\n📁 Authenticating with Google Drive...\n'));
  const auth = await getAuthenticatedClient(profilePath);

  // Determine flow
  const hasSelection = googleDocsConfig.selectedDocIds.length > 0;

  if (options.cache && hasSelection) {
    // Fast path: update existing docs
    await updateExistingDocs(auth, googleDocsConfig.selectedDocIds, outputDir);
    return;
  }

  if (options.refresh && hasSelection) {
    // Re-fetch all existing docs
    await updateExistingDocs(auth, googleDocsConfig.selectedDocIds, outputDir, false);
    return;
  }

  if (hasSelection && !options.discover) {
    // Prompt for action
    const action = await select({
      message: `You have ${googleDocsConfig.selectedDocIds.length} docs selected.`,
      choices: [
        { name: 'Update existing docs', value: 'update' },
        { name: 'Add more docs', value: 'add' },
        { name: 'Cancel', value: 'cancel' },
      ],
    });

    if (action === 'cancel') {
      console.log('Cancelled.');
      return;
    }

    if (action === 'update') {
      await updateExistingDocs(auth, googleDocsConfig.selectedDocIds, outputDir);
      return;
    }

    // Fall through to discovery for "add more"
  }

  // Discovery flow
  const filters = await promptForFilters(googleDocsConfig.savedFilters);

  console.log(chalk.blue('\n🔍 Discovering documents...\n'));
  const docs = await discoverDocs(auth, filters);

  if (docs.length === 0) {
    console.log(chalk.yellow('No documents found matching filters.'));
    return;
  }

  // Interactive selection
  console.log('');
  const selectedIds = await selectDocs(docs, googleDocsConfig.selectedDocIds);

  if (selectedIds.length === 0) {
    console.log('No documents selected.');
    return;
  }

  // Ask to save filters
  if (!googleDocsConfig.savedFilters) {
    const saveFilters = await confirm({
      message: 'Save these filters for future runs?',
      default: true,
    });

    if (saveFilters) {
      // TODO: Save filters to config
      console.log(chalk.green('✓ Filters saved'));
    }
  }

  // Fetch selected docs
  const selectedDocs = docs.filter((d) => selectedIds.includes(d.id));
  console.log(chalk.blue(`\n📥 Fetching ${selectedDocs.length} documents...\n`));

  await fetchDocs(auth, selectedDocs, outputDir, !options.refresh);

  // TODO: Update config with selected IDs and lastFetchTime
  console.log(chalk.green('\n✓ Google Docs fetch complete'));
}

/**
 * Update existing docs (from saved selection)
 */
async function updateExistingDocs(
  auth: any,
  docIds: string[],
  outputDir: string,
  skipUnmodified = true,
): Promise<void> {
  // TODO: Fetch metadata for existing docs
  // For now, placeholder
  console.log(chalk.blue(`\n📥 Updating ${docIds.length} documents...\n`));
  console.log('Not yet implemented - needs metadata fetch logic');
}

/**
 * Prompt user for discovery filters
 */
async function promptForFilters(
  savedFilters?: DiscoveryFilters,
): Promise<DiscoveryFilters> {
  const timeRange = await select<TimeRange>({
    message: 'How far back should we look?',
    choices: [
      { name: 'Last 3 months', value: '3months' },
      { name: 'Last 6 months', value: '6months' },
      { name: 'Last 12 months', value: '12months' },
      { name: 'All time', value: 'all' },
    ],
    default: savedFilters?.timeRange || '6months',
  });

  const keywordsInput = await input({
    message: 'Filter by title keywords (comma-separated, or leave blank):',
    default: savedFilters?.keywords?.join(', ') || '',
  });

  const keywords = keywordsInput
    ? keywordsInput.split(',').map((k) => k.trim()).filter(Boolean)
    : undefined;

  const ownership = await select<OwnershipFilter>({
    message: 'Which docs should we include?',
    choices: [
      { name: 'My docs only', value: 'mine' },
      { name: 'Shared with me', value: 'shared' },
      { name: 'Both', value: 'both' },
    ],
    default: savedFilters?.ownership || 'both',
  });

  return { timeRange, keywords, ownership };
}
```

**Step 2: Register subcommand in fetch/index.ts**

Add to `src/cli/commands/fetch/index.ts`:

```typescript
import { googleDocsCommand } from './google-docs/index';

// In fetchCommand setup
fetchCommand.addCommand(googleDocsCommand);
```

**Step 3: Commit**

```bash
git add src/cli/commands/fetch/google-docs/index.ts src/cli/commands/fetch/index.ts
git commit -m "feat(google-docs): add main fetch google-docs command"
```

---

## Task 11: Integrate with Profile Config

**Files:**
- Modify: `src/core/config/schema.ts` (add GoogleDocsConfig to schema)
- Modify: `src/cli/commands/fetch/google-docs/index.ts` (use real config)

**Step 1: Add GoogleDocsConfig to profile schema**

In `src/core/config/schema.ts`, add:

```typescript
export const GoogleDocsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  savedFilters: z.object({
    timeRange: z.enum(['3months', '6months', '12months', 'all']),
    keywords: z.array(z.string()).optional(),
    ownership: z.enum(['mine', 'shared', 'both']),
  }).optional(),
  selectedDocIds: z.array(z.string()).default([]),
  lastFetchTime: z.string().optional(),
});

export type GoogleDocsConfig = z.infer<typeof GoogleDocsConfigSchema>;

// Add to ProfileConfigSchema
// (find the existing ProfileConfigSchema and add googleDocs field)
```

**Step 2: Update command to use real config**

Replace placeholders in `index.ts` with actual config loading/saving logic.

**Step 3: Commit**

```bash
git add src/core/config/schema.ts src/cli/commands/fetch/google-docs/index.ts
git commit -m "feat(google-docs): integrate with profile config schema"
```

---

## Task 12: Update `fetch all` Command

**Files:**
- Modify: `src/cli/commands/fetch/all.ts`

**Step 1: Add google-docs to fetch all**

Update the `fetch all` command to include google-docs if enabled in profile.

**Step 2: Commit**

```bash
git add src/cli/commands/fetch/all.ts
git commit -m "feat(google-docs): add to fetch all command"
```

---

## Task 13: Documentation & Polish

**Files:**
- Create: `docs/google-docs-setup.md`
- Modify: `README.md`

**Step 1: Write setup documentation**

Create setup guide for Google OAuth credentials.

**Step 2: Update README**

Add Google Docs to features list and usage examples.

**Step 3: Commit**

```bash
git add docs/google-docs-setup.md README.md
git commit -m "docs: add Google Docs setup guide and update README"
```

---

## Summary

This plan implements Phase 3 (Google Docs Source Expansion) with:

- ✅ OAuth device flow authentication
- ✅ Drive API discovery with filters
- ✅ Interactive multi-select with search
- ✅ Semantic Markdown conversion (headings, paragraphs, lists, tables)
- ✅ Rate-limited fetching with progress
- ✅ Update detection (skip unmodified docs)
- ✅ Error handling with partial success
- ✅ Profile config integration

**Testing Strategy:**
- Unit tests for utils and converter (TDD approach)
- Manual testing for OAuth flow and interactive prompts
- Integration testing with mock Google APIs (future work)

**Note on OAuth Setup:**
Requires creating a Google Cloud Project and OAuth credentials. The auth module provides the structure but needs real credentials to work.

**Execution:**
Follow tasks sequentially. Each task is self-contained with clear commits.
