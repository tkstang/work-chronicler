import { createHash } from 'node:crypto';

/**
 * Cursors for paged search tools (see the pagination contract in
 * `./search-messages`). A cursor is a position in a tool's result order,
 * bound to the tool that issued it and to the filters it was issued for:
 * one from another tool, or passed with other filters, is refused rather
 * than read as a position in a different result list.
 */

/** A position in a result order: a time and an identity */
export type Position = [time: number, key: string];

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
