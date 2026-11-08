import { createHash } from 'node:crypto';

import type { ResolvedMentions } from '@core/index';

/**
 * Cursors for paged search tools (see the pagination contract in
 * `./search-messages`). A cursor is a position in a tool's result order,
 * bound to the tool that issued it and to the filters it was issued for:
 * one from another tool, or passed with other filters, is refused rather
 * than read as a position in a different result list.
 */

/** A position in a result order: a time and an identity */
export type Position = [time: number, key: string];

/** Most serialized results one page holds (always at least one result) */
export const MAX_PAGE_BYTES = 64 * 1024;
/** Most one result holds once its mentions are listed */
export const MAX_RESULT_BYTES = 16 * 1024;

/** Whether position `a` comes before `b`: newest first, then by identity */
export function comesBefore(a: Position, b: Position): boolean {
  if (a[0] !== b[0]) return a[0] > b[0];
  return a[1] < b[1];
}

/** Bytes of a value serialized as JSON */
export function jsonBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf-8');
}

/**
 * One page of matches in the shared result order: sorted newest first then
 * by identity, starting after `after`, holding at most `limit` results and
 * {@link MAX_PAGE_BYTES} of them (but always one while any remain).
 *
 * @returns The page's results, `total` matches and the cursor position
 *   after the page (null on the last page)
 */
export function pageOf<Match extends { position: Position }>(
  matches: Match[],
  options: {
    after: Position | null;
    limit: number | undefined;
    toResult: (match: Match) => unknown;
  },
): { results: unknown[]; total: number; next: Position | null } {
  const sorted = [...matches].sort((a, b) =>
    comesBefore(a.position, b.position)
      ? -1
      : comesBefore(b.position, a.position)
        ? 1
        : 0,
  );
  const { after } = options;
  const remaining = after
    ? sorted.filter(({ position }) => comesBefore(after, position))
    : sorted;
  const maxResults =
    options.limit && options.limit > 0 ? Math.floor(options.limit) : Infinity;
  const results: unknown[] = [];
  let bytes = 0;
  let last: Position | null = null;
  for (const match of remaining) {
    if (results.length >= Math.max(1, maxResults)) break;
    const result = options.toResult(match);
    const size = jsonBytes(result) + 1;
    if (results.length > 0 && bytes + size > MAX_PAGE_BYTES) break;
    results.push(result);
    bytes += size;
    last = match.position;
  }
  const more = last !== null && results.length < remaining.length;
  return { results, total: sorted.length, next: more ? last : null };
}

/**
 * A result with a record's resolved mentions listed while it stays within
 * {@link MAX_RESULT_BYTES}; `omittedMentions` counts any left out.
 *
 * @param result - The result's other fields
 * @param mentions - The record's mentions, resolved against the work log
 */
export function withMentions(
  result: Record<string, unknown>,
  mentions: ResolvedMentions,
): Record<string, unknown> {
  const pullRequests = mentions.pullRequests.map((m) => ({
    url: m.url,
    normalizedUrl: m.normalizedUrl,
    resolved: m.resolved
      ? {
          url: m.resolved.frontmatter.url,
          title: m.resolved.frontmatter.title,
          state: m.resolved.frontmatter.state,
        }
      : null,
  }));
  const tickets = mentions.tickets.map((m) => ({
    key: m.key,
    resolved: m.resolved
      ? {
          key: m.resolved.frontmatter.key,
          summary: m.resolved.frontmatter.summary,
          status: m.resolved.frontmatter.status,
        }
      : null,
  }));
  const full = { ...result, mentions: { pullRequests, tickets } };
  if (jsonBytes(full) <= MAX_RESULT_BYTES) return full;

  // List mentions in order (PRs, then tickets) while they fit, leaving room
  // for the omitted counts
  const kept: { pullRequests: unknown[]; tickets: unknown[] } = {
    pullRequests: [],
    tickets: [],
  };
  const omitted = { pullRequests: 0, tickets: 0 };
  let bytes =
    jsonBytes({ ...result, mentions: kept, omittedMentions: omitted }) + 16;
  for (const [kind, list] of [
    ['pullRequests', pullRequests],
    ['tickets', tickets],
  ] as const) {
    for (const mention of list) {
      const size = jsonBytes(mention) + 1;
      if (bytes + size > MAX_RESULT_BYTES) {
        omitted[kind]++;
        continue;
      }
      kept[kind].push(mention);
      bytes += size;
    }
  }
  return { ...result, mentions: kept, omittedMentions: omitted };
}

/** A short fingerprint of a call's filters (not its page size or cursor) */
function filtersHash(filters: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(filters))
    .digest('base64url')
    .slice(0, 16);
}

/**
 * Make the cursor for the position after a page's last result.
 *
 * @param tool - The tool issuing it
 * @param filters - The call's normalized filters (`undefined` for any not given)
 * @param position - The last result's position
 */
export function encodeCursor(
  tool: string,
  filters: unknown,
  position: Position,
): string {
  return Buffer.from(
    JSON.stringify([tool, filtersHash(filters), ...position]),
    'utf-8',
  ).toString('base64url');
}

/**
 * Read a cursor this tool issued for these filters.
 *
 * @param tool - The tool reading it
 * @param filters - The call's normalized filters, as given to {@link encodeCursor}
 * @param cursor - The `cursor` input
 * @throws When the cursor is malformed, came from another tool, or was
 *   issued for other filters
 */
export function decodeCursor(
  tool: string,
  filters: unknown,
  cursor: string,
): Position {
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
  } catch {
    value = null;
  }
  if (
    !Array.isArray(value) ||
    value.length !== 4 ||
    typeof value[0] !== 'string' ||
    typeof value[1] !== 'string' ||
    typeof value[2] !== 'number' ||
    !Number.isFinite(value[2]) ||
    typeof value[3] !== 'string'
  ) {
    throw new Error(
      `Invalid cursor: pass the nextCursor of an earlier ${tool} result, or no cursor for the first page.`,
    );
  }
  if (value[0] !== tool) {
    throw new Error(
      `Invalid cursor: it came from another tool, not ${tool}. Pass a nextCursor that ${tool} returned, or no cursor for the first page.`,
    );
  }
  if (value[1] !== filtersHash(filters)) {
    throw new Error(
      `Invalid cursor: it was issued for other filters. Pass the same filters as the call that returned it, or no cursor to start again.`,
    );
  }
  return [value[2], value[3]];
}
