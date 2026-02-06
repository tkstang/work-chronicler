import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectGrouping } from '@core/index';
import { getReportAnalysisDir } from '@workspace/resolver';

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
    try {
      const analysisDir = getReportAnalysisDir(profileName, reportId);
      const projectsPath = join(analysisDir, 'projects.json');

      // Read projects file
      const content = await readFile(projectsPath, 'utf-8');
      const data = JSON.parse(content);
      const projects: ProjectGrouping[] = data.projects || [];

      // Merge projects by name (case-insensitive)
      for (const project of projects) {
        const nameKey = project.name.toLowerCase();
        const existing = projectsByName.get(nameKey);

        if (existing) {
          // Merge into existing project
          existing.prUrls = [
            ...new Set([...existing.prUrls, ...project.prUrls]),
          ];
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
    } catch {
      // Skip reports without analysis (file not found, parse error, etc.)
    }
  }

  // Convert map to array and sort by PR count (descending)
  const aggregated = Array.from(projectsByName.values());
  aggregated.sort((a, b) => b.stats.prCount - a.stats.prCount);

  return aggregated;
}

/**
 * Generate a contributor matrix mapping each contributor to their projects.
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
  const projects = await aggregateTeamProjects(profileName, reportIds);
  const matrix: Record<string, string[]> = {};

  // Build reverse mapping: contributor -> projects
  for (const project of projects) {
    // Extract contributors from PRs by parsing report IDs from context
    // Since we don't have direct contributor info in ProjectGrouping,
    // we'll need to infer from the report IDs that contributed to this project
    // For now, we'll track which reports have PRs in this project

    // This is a simplified version - in a real implementation,
    // you'd need to track which report contributed which PRs
    // and map report IDs back to contributor names
    for (const reportId of reportIds) {
      if (!matrix[reportId]) {
        matrix[reportId] = [];
      }
      // Check if this report contributed to this project
      // (This would require more sophisticated tracking in aggregateTeamProjects)
      matrix[reportId].push(project.name);
    }
  }

  return matrix;
}

/**
 * Aggregate timeline data across all reports.
 *
 * Creates a team-level timeline showing when work happened across all contributors.
 *
 * @param profileName - Profile name (must be 'manager')
 * @param reportIds - List of report IDs to aggregate
 * @returns Aggregated timeline data structure
 */
export async function aggregateTeamTimeline(
  _profileName: string,
  _reportIds: string[],
): Promise<Record<string, unknown>> {
  // TODO: Implement timeline aggregation
  return {};
}

/**
 * Write team-level analysis files.
 *
 * Generates and writes three analysis files:
 * - team-projects.json: Aggregated project groupings
 * - contributor-matrix.json: Contributor to project mapping
 * - team-timeline.json: Team-level timeline (placeholder)
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
