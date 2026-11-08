import type {
  ImportedRecordFile,
  JiraTicketFile,
  PRImpact,
  PullRequestFile,
} from '@core/index';

import { classifyPRImpact } from './classifier';

export interface AnalysisStats {
  generatedAt: string;
  dateRange: {
    since: string;
    until: string;
  };
  prs: {
    total: number;
    byImpact: Record<PRImpact, number>;
    byRepo: Record<string, number>;
    byMonth: Record<string, number>;
    byState: Record<string, number>;
  };
  tickets: {
    total: number;
    byProject: Record<string, number>;
    byStatus: Record<string, number>;
    byIssueType: Record<string, number>;
  };
  links: {
    prsWithTickets: number;
    ticketsWithPRs: number;
  };
  /**
   * Imported messages: supplementary evidence, counted apart from PRs and
   * tickets and never added to them.
   */
  messages: {
    total: number;
    bySource: Record<string, number>;
    byMonth: Record<string, number>;
  };
  /**
   * Imported Google Docs the subject owns (owned, not necessarily written):
   * supplementary evidence, counted apart from PRs and tickets, by the month
   * they were last modified.
   */
  documents: {
    total: number;
    bySource: Record<string, number>;
    byMonth: Record<string, number>;
  };
}

/**
 * Extract YYYY-MM from a date string
 */
function getYearMonth(dateStr: string): string {
  const date = new Date(dateStr);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** Sort a month-keyed record chronologically */
function sortByMonth(byMonth: Record<string, number>): Record<string, number> {
  const sorted: Record<string, number> = {};
  for (const month of Object.keys(byMonth).sort()) {
    sorted[month] = byMonth[month] ?? 0;
  }
  return sorted;
}

/** Count imported records of one type by source and month of `occurredAt` */
function countImported(
  importedRecords: ImportedRecordFile[],
  type: ImportedRecordFile['frontmatter']['type'],
): AnalysisStats['messages'] {
  const counts: AnalysisStats['messages'] = {
    total: 0,
    bySource: {},
    byMonth: {},
  };
  for (const record of importedRecords) {
    const fm = record.frontmatter;
    if (fm.type !== type) continue;
    counts.total++;
    counts.bySource[fm.source] = (counts.bySource[fm.source] ?? 0) + 1;
    const month = getYearMonth(fm.occurredAt);
    counts.byMonth[month] = (counts.byMonth[month] ?? 0) + 1;
  }
  counts.byMonth = sortByMonth(counts.byMonth);
  return counts;
}

/**
 * Count imported messages by source and month (`stats.json`'s `messages`
 * section). Records of other types are not counted.
 *
 * @param importedRecords - Imported records from one work log
 */
export function countMessages(
  importedRecords: ImportedRecordFile[],
): AnalysisStats['messages'] {
  return countImported(importedRecords, 'message');
}

/**
 * Count imported documents by source and month last modified
 * (`stats.json`'s `documents` section). Records of other types are not
 * counted.
 *
 * @param importedRecords - Imported records from one work log
 */
export function countDocuments(
  importedRecords: ImportedRecordFile[],
): AnalysisStats['documents'] {
  return countImported(importedRecords, 'document');
}

/**
 * Generate statistics from PR and ticket data, plus counts of imported
 * messages and documents (which never enter the PR or ticket figures).
 */
export function generateStats(
  prs: PullRequestFile[],
  tickets: JiraTicketFile[],
  since: string,
  until: string,
  importedRecords: ImportedRecordFile[] = [],
): AnalysisStats {
  const stats: AnalysisStats = {
    generatedAt: new Date().toISOString(),
    dateRange: { since, until },
    prs: {
      total: prs.length,
      byImpact: { flagship: 0, major: 0, standard: 0, minor: 0 },
      byRepo: {},
      byMonth: {},
      byState: {},
    },
    tickets: {
      total: tickets.length,
      byProject: {},
      byStatus: {},
      byIssueType: {},
    },
    links: {
      prsWithTickets: 0,
      ticketsWithPRs: 0,
    },
    messages: countMessages(importedRecords),
    documents: countDocuments(importedRecords),
  };

  // Process PRs
  for (const pr of prs) {
    const fm = pr.frontmatter;

    // Impact (use existing or classify)
    const impact = fm.impact ?? classifyPRImpact(fm);
    stats.prs.byImpact[impact]++;

    // Repo
    const repoKey = `${fm.org}/${fm.repository}`;
    stats.prs.byRepo[repoKey] = (stats.prs.byRepo[repoKey] ?? 0) + 1;

    // Month
    const month = getYearMonth(fm.createdAt);
    stats.prs.byMonth[month] = (stats.prs.byMonth[month] ?? 0) + 1;

    // State
    stats.prs.byState[fm.state] = (stats.prs.byState[fm.state] ?? 0) + 1;

    // Links
    if (fm.jiraTickets.length > 0) {
      stats.links.prsWithTickets++;
    }
  }

  // Process tickets
  for (const ticket of tickets) {
    const fm = ticket.frontmatter;

    // Project
    stats.tickets.byProject[fm.project] =
      (stats.tickets.byProject[fm.project] ?? 0) + 1;

    // Status
    stats.tickets.byStatus[fm.status] =
      (stats.tickets.byStatus[fm.status] ?? 0) + 1;

    // Issue type
    stats.tickets.byIssueType[fm.issueType] =
      (stats.tickets.byIssueType[fm.issueType] ?? 0) + 1;

    // Links
    if (fm.linkedPRs.length > 0) {
      stats.links.ticketsWithPRs++;
    }
  }

  stats.prs.byMonth = sortByMonth(stats.prs.byMonth);

  return stats;
}
