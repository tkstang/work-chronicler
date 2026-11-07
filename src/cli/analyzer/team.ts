import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  type PRImpact,
  type ProjectGrouping,
  ProjectGroupingSchema,
  type TimelineAnalysis,
  TimelineAnalysisSchema,
  type TimelinePR,
  type TimelineTicket,
} from '@core/index';
import { getReportAnalysisDir } from '@workspace/resolver';
import { z } from 'zod';

/**
 * Read one report's detected projects from `reports/<id>/analysis/projects.json`.
 * Returns an empty list when the report has not been analyzed yet or its file
 * is malformed, so one bad report never aborts the team rollup.
 */
async function readReportProjects(
  profileName: string,
  reportId: string,
): Promise<ProjectGrouping[]> {
  try {
    const projectsPath = join(
      getReportAnalysisDir(profileName, reportId),
      'projects.json',
    );
    const data = JSON.parse(await readFile(projectsPath, 'utf-8'));
    const parsed = z
      .array(ProjectGroupingSchema)
      .safeParse(data?.projects ?? []);
    return parsed.success ? parsed.data : [];
  } catch {
    // Skip reports without analysis (file not found, parse error, etc.)
    return [];
  }
}

/**
 * Aggregate projects across all reports in a manager profile.
 *
 * Projects with the same name (case-insensitive) are merged:
 * - Contributors are combined (deduplicated)
 * - PR URLs and ticket keys are merged
 * - Stats are summed
 *
 * @param profileName - Profile name (must be 'manager')
 * @param reportIds - List of report IDs to aggregate
 * @returns Array of aggregated ProjectGrouping objects
 */
export async function aggregateTeamProjects(
  profileName: string,
  reportIds: string[],
): Promise<ProjectGrouping[]> {
  const projectsByName = new Map<string, ProjectGrouping>();

  for (const reportId of reportIds) {
    const projects = await readReportProjects(profileName, reportId);

    // Merge projects by name (case-insensitive)
    for (const project of projects) {
      const nameKey = project.name.toLowerCase();
      const existing = projectsByName.get(nameKey);

      if (existing) {
        // Merge into existing project
        existing.prUrls = [...new Set([...existing.prUrls, ...project.prUrls])];
        existing.ticketKeys = [
          ...new Set([...existing.ticketKeys, ...project.ticketKeys]),
        ];

        // Merge signals
        existing.signals.sharedTickets = [
          ...new Set([
            ...existing.signals.sharedTickets,
            ...project.signals.sharedTickets,
          ]),
        ];
        if (project.signals.jiraProject) {
          existing.signals.jiraProject = project.signals.jiraProject;
        }
        existing.signals.sharedLabels = [
          ...new Set([
            ...existing.signals.sharedLabels,
            ...project.signals.sharedLabels,
          ]),
        ];
        existing.signals.commonKeywords = [
          ...new Set([
            ...existing.signals.commonKeywords,
            ...project.signals.commonKeywords,
          ]),
        ];

        // Merge stats
        existing.stats.prCount += project.stats.prCount;
        existing.stats.ticketCount += project.stats.ticketCount;
        existing.stats.totalAdditions += project.stats.totalAdditions;
        existing.stats.totalDeletions += project.stats.totalDeletions;
        existing.stats.repos = [
          ...new Set([...existing.stats.repos, ...project.stats.repos]),
        ];
      } else {
        // Add new project
        projectsByName.set(nameKey, { ...project });
      }
    }
  }

  // Convert map to array and sort by PR count (descending)
  const aggregated = Array.from(projectsByName.values());
  aggregated.sort((a, b) => b.stats.prCount - a.stats.prCount);

  return aggregated;
}

/**
 * Generate a contributor matrix mapping each report ID to the projects
 * detected in that report's own analysis.
 *
 * The matrix shows which projects each team member contributed to,
 * useful for understanding team collaboration patterns.
 *
 * @param profileName - Profile name (must be 'manager')
 * @param reportIds - List of report IDs to aggregate
 * @returns Record mapping contributor name to array of project names
 */
export async function generateContributorMatrix(
  profileName: string,
  reportIds: string[],
): Promise<Record<string, string[]>> {
  const matrix: Record<string, string[]> = {};

  // Each report is credited only with the projects detected in its own
  // work log, never with projects that exist elsewhere on the team.
  for (const reportId of reportIds) {
    const projects = await readReportProjects(profileName, reportId);
    matrix[reportId] = [...new Set(projects.map((project) => project.name))];
  }

  return matrix;
}

/** Activity totals for one period (a week or a month). */
export interface TeamPeriodStats {
  prCount: number;
  ticketCount: number;
  additions: number;
  deletions: number;
  byImpact: Record<PRImpact, number>;
}

/** One report's activity in a week, with the PRs and tickets behind it. */
export interface TeamReportWeek {
  stats: TeamPeriodStats;
  prs: TimelinePR[];
  tickets: TimelineTicket[];
}

/**
 * A dictionary keyed by report ID. It has no prototype, so an ID such as
 * `constructor` or `__proto__` is an ordinary key.
 */
function reportDictionary<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

/** A week of team activity, keyed by report ID in `byReport`. */
export interface TeamTimelineWeek {
  weekStart: string;
  weekEnd: string;
  weekNumber: number;
  year: number;
  stats: TeamPeriodStats;
  byReport: Record<string, TeamReportWeek>;
}

/** A month of team activity; `byReport` holds each report's month totals. */
export interface TeamTimelineMonth {
  month: string;
  monthName: string;
  stats: TeamPeriodStats;
  byReport: Record<string, TeamPeriodStats>;
  weeks: TeamTimelineWeek[];
}

/** Team timeline written to `team-timeline.json`. */
export interface TeamTimeline {
  generatedAt: string;
  /** Reports whose `analysis/timeline.json` was merged */
  reports: string[];
  /** Reports skipped because their timeline is missing or malformed */
  skippedReports: string[];
  dateRange: { since: string; until: string } | null;
  months: TeamTimelineMonth[];
  summary: {
    totalWeeks: number;
    totalMonths: number;
    busiestWeek?: { weekStart: string; prCount: number };
    busiestMonth?: { month: string; prCount: number };
  };
}

function emptyStats(): TeamPeriodStats {
  return {
    prCount: 0,
    ticketCount: 0,
    additions: 0,
    deletions: 0,
    byImpact: { flagship: 0, major: 0, standard: 0, minor: 0 },
  };
}

function addStats(target: TeamPeriodStats, source: TeamPeriodStats): void {
  target.prCount += source.prCount;
  target.ticketCount += source.ticketCount;
  target.additions += source.additions;
  target.deletions += source.deletions;
  for (const impact of Object.keys(target.byImpact) as PRImpact[]) {
    target.byImpact[impact] += source.byImpact[impact];
  }
}

const MONTH_KEY = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whether `value` is a real `YYYY-MM-DD` calendar date. */
function isCalendarDate(value: string): boolean {
  const match = DAY_KEY.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

/**
 * Whether a parsed timeline can be merged: its date range is non-empty and
 * parseable, its months are `YYYY-MM` and its week starts are `YYYY-MM-DD`.
 * The merge keys and sorts periods by these strings, so a non-canonical key
 * would create a duplicate period or sort out of order.
 */
function isMergeableTimeline(timeline: TimelineAnalysis): boolean {
  const { since, until } = timeline.dateRange;
  if (!since || !until) return false;
  if (Number.isNaN(Date.parse(since)) || Number.isNaN(Date.parse(until))) {
    return false;
  }
  return timeline.months.every(
    (month) =>
      MONTH_KEY.test(month.month) &&
      month.weeks.every((week) => isCalendarDate(week.weekStart)),
  );
}

/**
 * Read one report's timeline from `reports/<id>/analysis/timeline.json`.
 * Returns null when the report has no timeline, or its file is unreadable,
 * malformed or has non-canonical dates, so one bad report never aborts the
 * team rollup.
 */
async function readReportTimeline(
  profileName: string,
  reportId: string,
): Promise<TimelineAnalysis | null> {
  try {
    const timelinePath = join(
      getReportAnalysisDir(profileName, reportId),
      'timeline.json',
    );
    const data = JSON.parse(await readFile(timelinePath, 'utf-8'));
    const parsed = TimelineAnalysisSchema.safeParse(data);
    return parsed.success && isMergeableTimeline(parsed.data)
      ? parsed.data
      : null;
  } catch {
    return null;
  }
}

/**
 * Aggregate timeline data across all reports.
 *
 * Reads each report's `analysis/timeline.json` (written by
 * `analyze reports <id> --timeline`) and merges the months and weeks by
 * period. Team totals are summed, and `byReport` keeps each report's own
 * numbers and items so no work is credited to the wrong person. Reports
 * without a usable timeline are listed in `skippedReports`.
 *
 * @param profileName - Profile name (must be 'manager')
 * @param reportIds - List of report IDs to aggregate
 * @returns Team timeline, months and weeks in chronological order
 */
export async function aggregateTeamTimeline(
  profileName: string,
  reportIds: string[],
): Promise<TeamTimeline> {
  const months = new Map<string, TeamTimelineMonth>();
  const reports: string[] = [];
  const skippedReports: string[] = [];
  const sinces: string[] = [];
  const untils: string[] = [];

  for (const reportId of reportIds) {
    const timeline = await readReportTimeline(profileName, reportId);
    if (!timeline) {
      skippedReports.push(reportId);
      continue;
    }
    reports.push(reportId);

    sinces.push(timeline.dateRange.since);
    untils.push(timeline.dateRange.until);

    for (const reportMonth of timeline.months) {
      let month = months.get(reportMonth.month);
      if (!month) {
        month = {
          month: reportMonth.month,
          monthName: reportMonth.monthName,
          stats: emptyStats(),
          byReport: reportDictionary<TeamPeriodStats>(),
          weeks: [],
        };
        months.set(reportMonth.month, month);
      }

      const reportMonthStats = month.byReport[reportId] ?? emptyStats();
      addStats(reportMonthStats, reportMonth.stats);
      month.byReport[reportId] = reportMonthStats;
      addStats(month.stats, reportMonth.stats);

      for (const reportWeek of reportMonth.weeks) {
        let week = month.weeks.find(
          (w) => w.weekStart === reportWeek.weekStart,
        );
        if (!week) {
          week = {
            weekStart: reportWeek.weekStart,
            weekEnd: reportWeek.weekEnd,
            weekNumber: reportWeek.weekNumber,
            year: reportWeek.year,
            stats: emptyStats(),
            byReport: reportDictionary<TeamReportWeek>(),
          };
          month.weeks.push(week);
        }

        const entry = week.byReport[reportId] ?? {
          stats: emptyStats(),
          prs: [],
          tickets: [],
        };
        addStats(entry.stats, reportWeek.stats);
        entry.prs.push(...reportWeek.prs);
        entry.tickets.push(...reportWeek.tickets);
        week.byReport[reportId] = entry;
        addStats(week.stats, reportWeek.stats);
      }
    }
  }

  // Keys are validated as canonical YYYY-MM / YYYY-MM-DD, so string order is
  // chronological order.
  const sortedMonths = [...months.values()].sort((a, b) =>
    a.month.localeCompare(b.month),
  );
  for (const month of sortedMonths) {
    month.weeks.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  }

  let busiestWeek: TeamTimeline['summary']['busiestWeek'];
  let busiestMonth: TeamTimeline['summary']['busiestMonth'];
  let totalWeeks = 0;
  for (const month of sortedMonths) {
    if (!busiestMonth || month.stats.prCount > busiestMonth.prCount) {
      busiestMonth = { month: month.month, prCount: month.stats.prCount };
    }
    for (const week of month.weeks) {
      totalWeeks++;
      if (!busiestWeek || week.stats.prCount > busiestWeek.prCount) {
        busiestWeek = {
          weekStart: week.weekStart,
          prCount: week.stats.prCount,
        };
      }
    }
  }

  const byTime = (a: string, b: string) => Date.parse(a) - Date.parse(b);
  const since = sinces.sort(byTime)[0];
  const until = untils.sort(byTime).at(-1);

  return {
    generatedAt: new Date().toISOString(),
    reports,
    skippedReports,
    dateRange: since && until ? { since, until } : null,
    months: sortedMonths,
    summary: {
      totalWeeks,
      totalMonths: sortedMonths.length,
      busiestWeek,
      busiestMonth,
    },
  };
}

/**
 * Write team-level analysis files.
 *
 * Generates and writes three analysis files:
 * - team-projects.json: Aggregated project groupings
 * - contributor-matrix.json: Contributor to project mapping
 * - team-timeline.json: Team timeline merged from each report's timeline.json
 *
 * @param profileName - Profile name (must be 'manager')
 * @param reportIds - List of report IDs to aggregate
 */
export async function writeTeamAnalysis(
  profileName: string,
  reportIds: string[],
): Promise<void> {
  // Get team-level analysis directory (empty reportId for team-level)
  const analysisDir = getReportAnalysisDir(profileName, '');

  // Ensure directory exists
  await mkdir(analysisDir, { recursive: true });

  // Generate all aggregations
  const [teamProjects, contributorMatrix, teamTimeline] = await Promise.all([
    aggregateTeamProjects(profileName, reportIds),
    generateContributorMatrix(profileName, reportIds),
    aggregateTeamTimeline(profileName, reportIds),
  ]);

  // Write all analysis files
  await Promise.all([
    writeFile(
      join(analysisDir, 'team-projects.json'),
      JSON.stringify(teamProjects, null, 2),
    ),
    writeFile(
      join(analysisDir, 'contributor-matrix.json'),
      JSON.stringify(contributorMatrix, null, 2),
    ),
    writeFile(
      join(analysisDir, 'team-timeline.json'),
      JSON.stringify(teamTimeline, null, 2),
    ),
  ]);
}
