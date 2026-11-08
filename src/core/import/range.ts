import { z } from 'zod';

/**
 * Date bounds, read the same way everywhere they bound a range in UTC: a
 * date without a time (`2025-02-28`) is a whole UTC day, so a start is
 * 00:00:00Z on that day and an end is its last millisecond. A timestamp
 * keeps its precision.
 */

/** A date without a time: `2025-02-28` */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** An ISO 8601 timestamp with `Z` or an offset (never local time) */
const TimestampSchema = z.iso.datetime({ offset: true });

/** A bound that could not be read, with a fixed reason */
export interface DateBoundProblem {
  problem: 'not-a-calendar-date' | 'malformed';
}

/**
 * Read a date-only bound as the start or end of its UTC day.
 *
 * @param text - Bound as given (surrounding spaces ignored)
 * @param edge - Which end of the day a date alone means
 * @returns The moment, null when `text` is not date-only, or the problem
 *   when it is a date-only form that is not a calendar date
 */
export function parseUtcDay(
  text: string,
  edge: 'start' | 'end',
): Date | null | DateBoundProblem {
  const day = DATE_ONLY.exec(text.trim());
  if (!day) return null;
  const [year, month, date] = day.slice(1).map(Number) as [
    number,
    number,
    number,
  ];
  const start = new Date(Date.UTC(year, month - 1, date));
  if (
    start.getUTCFullYear() !== year ||
    start.getUTCMonth() !== month - 1 ||
    start.getUTCDate() !== date
  ) {
    return { problem: 'not-a-calendar-date' };
  }
  return edge === 'start'
    ? start
    : new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/**
 * Read an import range bound: a date (`YYYY-MM-DD`, the whole UTC day) or
 * an ISO 8601 timestamp with `Z` or an offset. Anything else, including a
 * timestamp without a zone (which would be read in local time), is refused.
 *
 * @param text - Bound as given
 * @param edge - `start` for a since, `end` for an until
 */
export function parseRangeBound(
  text: string,
  edge: 'start' | 'end',
): Date | DateBoundProblem {
  const day = parseUtcDay(text, edge);
  if (day !== null) return day;
  const trimmed = text.trim();
  if (!TimestampSchema.safeParse(trimmed).success) {
    return { problem: 'malformed' };
  }
  return new Date(trimmed);
}

/** The range an import checks documents against, as instants */
export interface ImportRange {
  since: Date;
  /** Null: no end (the configured range runs to now) */
  until: Date | null;
}

/**
 * The range as configured (the subject's `fetch` range) and as given on
 * the command line. A given bound replaces the configured one for that
 * batch.
 */
export interface ImportRangeInput {
  since: string;
  until: string | null;
  /** `--since` / `--until`, when given */
  override?: { since?: string; until?: string };
}

/** The range a run applied, echoed in its result */
export interface AppliedRange {
  since: string;
  until: string | null;
  /** Whether `--since` or `--until` replaced a configured bound */
  overridden: boolean;
}

/** A range that could not be read: which bound, from where, and why */
export interface RangeProblem {
  bound: 'since' | 'until';
  from: 'option' | 'config';
  message: string;
}

function describe(problem: DateBoundProblem): string {
  return problem.problem === 'not-a-calendar-date'
    ? 'is not a calendar date; use YYYY-MM-DD'
    : 'must be a date (YYYY-MM-DD, the whole UTC day) or an ISO 8601 timestamp with Z or an offset';
}

/**
 * Resolve the range an import applies.
 *
 * @param input - Configured range and any override
 * @returns The range, or every problem with it
 */
export function resolveImportRange(
  input: ImportRangeInput,
):
  | { range: ImportRange; applied: AppliedRange }
  | { problems: RangeProblem[] } {
  const problems: RangeProblem[] = [];
  const read = (
    bound: 'since' | 'until',
    given: string | undefined,
    configured: string | null,
  ): Date | null => {
    const from = given !== undefined ? 'option' : 'config';
    const text = given ?? configured;
    if (text === null) return null;
    const parsed = parseRangeBound(text, bound === 'since' ? 'start' : 'end');
    if (parsed instanceof Date) return parsed;
    problems.push({ bound, from, message: describe(parsed) });
    return null;
  };
  const since = read('since', input.override?.since, input.since);
  const until = read('until', input.override?.until, input.until);
  if (problems.length > 0 || since === null) return { problems };
  if (until !== null && until < since) {
    return {
      problems: [
        {
          bound: 'until',
          from: input.override?.until !== undefined ? 'option' : 'config',
          message: 'is earlier than since',
        },
      ],
    };
  }
  return {
    range: { since, until },
    applied: {
      since: since.toISOString(),
      until: until?.toISOString() ?? null,
      overridden:
        input.override?.since !== undefined ||
        input.override?.until !== undefined,
    },
  };
}
