import {
  type ImportedRecordFile,
  isDocumentFile,
  type JiraTicketFile,
  type PRImpact,
  type PullRequestFile,
  type TimelineAnalysis,
  type TimelineDocument,
  type TimelineMonth,
  type TimelinePR,
  type TimelineTicket,
  type TimelineWeek,
} from '@core/index';

import { classifyPRImpact } from './classifier';

// Every period key is computed in UTC: PR and ticket dates are formatted as
// UTC days, so week and month boundaries must be UTC too, or a week could be
// filed under the wrong month depending on where `analyze` ran.

/**
 * Get ISO week number for a date (UTC)
 * Week 1 is the week containing January 4th
 */
function getISOWeek(date: Date): number {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
}

/**
 * Get the Monday (UTC midnight) of the UTC week containing a date
 */
function getWeekStart(date: Date): Date {
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() + diff,
    ),
  );
}

/**
 * Get the Sunday (UTC midnight) of the UTC week containing a date
 */
function getWeekEnd(date: Date): Date {
  const end = getWeekStart(date);
  end.setUTCDate(end.getUTCDate() + 6);
  return end;
}

/**
 * Format date as a UTC YYYY-MM-DD
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

/**
 * Format month as a UTC YYYY-MM
 */
function formatMonth(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get human-readable month name for a UTC month
 */
function getMonthName(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Create empty impact stats
 */
function createEmptyImpactStats(): Record<PRImpact, number> {
  return { flagship: 0, major: 0, standard: 0, minor: 0 };
}

/** An empty week for the UTC week containing a date */
function emptyWeek(date: Date): TimelineWeek {
  const weekStart = getWeekStart(date);
  return {
    weekStart: formatDate(weekStart),
    weekEnd: formatDate(getWeekEnd(date)),
    weekNumber: getISOWeek(date),
    year: weekStart.getUTCFullYear(),
    prs: [],
    tickets: [],
    documents: [],
    stats: {
      prCount: 0,
      ticketCount: 0,
      documentCount: 0,
      additions: 0,
      deletions: 0,
      byImpact: createEmptyImpactStats(),
    },
  };
}

/**
 * Generate a chronological timeline of work: authored PRs and tickets, plus
 * imported Google Docs (by modified time, listed apart: the subject owns
 * them, which is not authoring them). Imported messages are not included.
 *
 * @param importedRecords - Imported records; only documents are used
 */
export function generateTimeline(
  prs: PullRequestFile[],
  tickets: JiraTicketFile[],
  since: string,
  until: string,
  importedRecords: ImportedRecordFile[] = [],
): TimelineAnalysis {
  // Convert PRs to timeline entries
  const timelinePRs: Array<TimelinePR & { dateObj: Date }> = prs.map((pr) => {
    const dateStr = pr.frontmatter.mergedAt ?? pr.frontmatter.createdAt;
    const dateObj = new Date(dateStr);
    return {
      url: pr.frontmatter.url,
      title: pr.frontmatter.title,
      repository: pr.frontmatter.repository,
      org: pr.frontmatter.org,
      prNumber: pr.frontmatter.prNumber,
      state: pr.frontmatter.state,
      impact: pr.frontmatter.impact ?? classifyPRImpact(pr.frontmatter),
      additions: pr.frontmatter.additions,
      deletions: pr.frontmatter.deletions,
      jiraTickets: pr.frontmatter.jiraTickets,
      date: formatDate(dateObj),
      dateObj,
    };
  });

  // Convert tickets to timeline entries
  const timelineTickets: Array<TimelineTicket & { dateObj: Date }> =
    tickets.map((ticket) => {
      const dateStr =
        ticket.frontmatter.resolvedAt ?? ticket.frontmatter.createdAt;
      const dateObj = new Date(dateStr);
      return {
        key: ticket.frontmatter.key,
        summary: ticket.frontmatter.summary,
        project: ticket.frontmatter.project,
        issueType: ticket.frontmatter.issueType,
        status: ticket.frontmatter.status,
        linkedPRs: ticket.frontmatter.linkedPRs,
        date: formatDate(dateObj),
        dateObj,
      };
    });

  // Group by week
  const weekMap = new Map<string, TimelineWeek>();

  for (const pr of timelinePRs) {
    const weekStart = getWeekStart(pr.dateObj);
    const weekKey = formatDate(weekStart);

    if (!weekMap.has(weekKey)) weekMap.set(weekKey, emptyWeek(pr.dateObj));

    const week = weekMap.get(weekKey);
    if (week) {
      // Remove dateObj before adding to week
      const { dateObj: _, ...prWithoutDateObj } = pr;
      week.prs.push(prWithoutDateObj);
      week.stats.prCount++;
      week.stats.additions += pr.additions;
      week.stats.deletions += pr.deletions;
      if (pr.impact) {
        week.stats.byImpact[pr.impact]++;
      }
    }
  }

  for (const ticket of timelineTickets) {
    const weekStart = getWeekStart(ticket.dateObj);
    const weekKey = formatDate(weekStart);

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, emptyWeek(ticket.dateObj));
    }

    const week = weekMap.get(weekKey);
    if (week) {
      // Remove dateObj before adding to week
      const { dateObj: _, ...ticketWithoutDateObj } = ticket;
      week.tickets.push(ticketWithoutDateObj);
      week.stats.ticketCount++;
    }
  }

  for (const record of importedRecords.filter(isDocumentFile)) {
    const fm = record.frontmatter;
    const dateObj = new Date(fm.occurredAt);
    const weekKey = formatDate(getWeekStart(dateObj));
    if (!weekMap.has(weekKey)) weekMap.set(weekKey, emptyWeek(dateObj));
    const week = weekMap.get(weekKey);
    if (week) {
      const entry: TimelineDocument = {
        source: fm.source,
        title: fm.document.title,
        url: fm.url,
        createdAt: fm.document.createdAt,
        modifiedAt: fm.occurredAt,
        date: formatDate(dateObj),
      };
      week.documents.push(entry);
      week.stats.documentCount++;
    }
  }

  // Sort weeks chronologically
  const sortedWeeks = [...weekMap.values()].sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart),
  );

  // Sort PRs and tickets within each week by date
  for (const week of sortedWeeks) {
    week.prs.sort((a, b) => a.date.localeCompare(b.date));
    week.tickets.sort((a, b) => a.date.localeCompare(b.date));
    week.documents.sort((a, b) => a.modifiedAt.localeCompare(b.modifiedAt));
  }

  // Group weeks into months
  const monthMap = new Map<string, TimelineMonth>();

  for (const week of sortedWeeks) {
    // Use week start date for month grouping ("YYYY-MM-DD" parses as UTC)
    const weekStartDate = new Date(week.weekStart);
    const monthKey = formatMonth(weekStartDate);

    if (!monthMap.has(monthKey)) {
      monthMap.set(monthKey, {
        month: monthKey,
        monthName: getMonthName(weekStartDate),
        weeks: [],
        stats: {
          prCount: 0,
          ticketCount: 0,
          documentCount: 0,
          additions: 0,
          deletions: 0,
          byImpact: createEmptyImpactStats(),
        },
      });
    }

    const month = monthMap.get(monthKey);
    if (month) {
      month.weeks.push(week);
      month.stats.prCount += week.stats.prCount;
      month.stats.ticketCount += week.stats.ticketCount;
      month.stats.documentCount += week.stats.documentCount;
      month.stats.additions += week.stats.additions;
      month.stats.deletions += week.stats.deletions;
      month.stats.byImpact.flagship += week.stats.byImpact.flagship;
      month.stats.byImpact.major += week.stats.byImpact.major;
      month.stats.byImpact.standard += week.stats.byImpact.standard;
      month.stats.byImpact.minor += week.stats.byImpact.minor;
    }
  }

  // Sort months chronologically
  const sortedMonths = [...monthMap.values()].sort((a, b) =>
    a.month.localeCompare(b.month),
  );

  // Find busiest week and month
  let busiestWeek: { weekStart: string; prCount: number } | undefined;
  let busiestMonth: { month: string; prCount: number } | undefined;

  for (const week of sortedWeeks) {
    if (!busiestWeek || week.stats.prCount > busiestWeek.prCount) {
      busiestWeek = { weekStart: week.weekStart, prCount: week.stats.prCount };
    }
  }

  for (const month of sortedMonths) {
    if (!busiestMonth || month.stats.prCount > busiestMonth.prCount) {
      busiestMonth = { month: month.month, prCount: month.stats.prCount };
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    dateRange: { since, until },
    months: sortedMonths,
    summary: {
      totalWeeks: sortedWeeks.length,
      totalMonths: sortedMonths.length,
      busiestWeek,
      busiestMonth,
    },
  };
}
