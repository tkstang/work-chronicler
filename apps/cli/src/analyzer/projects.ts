import type {
  JiraTicketFile,
  ProjectConfidence,
  ProjectGrouping,
  ProjectSignal,
  ProjectsAnalysis,
  PullRequestFile,
} from '@work-chronicler/core';

/**
 * Configuration for project detection
 */
export interface ProjectDetectorConfig {
  /** Time window in days for temporal clustering (default: 14) */
  timeWindowDays?: number;
  /** Minimum PRs to form a temporal cluster (default: 2) */
  minClusterSize?: number;
  /** Whether to include unlinked PRs in temporal clusters (default: true) */
  includeUnlinkedPRs?: boolean;
}

const DEFAULT_CONFIG: Required<ProjectDetectorConfig> = {
  timeWindowDays: 14,
  minClusterSize: 2,
  includeUnlinkedPRs: true,
};

/**
 * Internal representation of a project during detection
 */
interface ProjectBuilder {
  prs: Set<string>; // PR URLs
  tickets: Set<string>; // Ticket keys
  sharedTickets: Set<string>;
  repos: Set<string>;
  jiraProject?: string;
  earliestDate?: Date;
  latestDate?: Date;
  sharedLabels: Set<string>;
  dominantSignal: ProjectSignal;
}

/**
 * Create a unique project ID based on primary signal
 */
function generateProjectId(builder: ProjectBuilder, index: number): string {
  if (builder.sharedTickets.size > 0) {
    // Use first ticket key as base
    const firstTicket = [...builder.sharedTickets][0];
    return `project-${firstTicket?.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
  }
  if (builder.jiraProject) {
    return `project-${builder.jiraProject.toLowerCase()}-${index}`;
  }
  if (builder.repos.size > 0) {
    const firstRepo = [...builder.repos][0]?.split('/').pop() ?? 'unknown';
    return `project-${firstRepo}-${index}`;
  }
  return `project-${index}`;
}

/**
 * Generate a human-readable name for the project
 */
function generateProjectName(
  builder: ProjectBuilder,
  ticketMap: Map<string, JiraTicketFile>,
): string {
  // If we have tickets, use the first ticket's summary
  if (builder.sharedTickets.size > 0) {
    const firstTicketKey = [...builder.sharedTickets][0];
    if (firstTicketKey) {
      const ticket = ticketMap.get(firstTicketKey);
      if (ticket) {
        return ticket.frontmatter.summary;
      }
      return firstTicketKey;
    }
  }

  // If we have a JIRA project, use it
  if (builder.jiraProject) {
    return `${builder.jiraProject} Work`;
  }

  // Fall back to repo names
  if (builder.repos.size > 0) {
    const repoNames = [...builder.repos].map((r) => r.split('/').pop());
    return `Work on ${repoNames.join(', ')}`;
  }

  return 'Unnamed Project';
}

/**
 * Calculate confidence based on signals
 */
function calculateConfidence(builder: ProjectBuilder): ProjectConfidence {
  // High confidence: explicit ticket linking
  if (builder.sharedTickets.size > 0) {
    return 'high';
  }

  // Medium confidence: same JIRA project with multiple PRs
  if (builder.jiraProject && builder.prs.size >= 3) {
    return 'medium';
  }

  // Medium confidence: shared labels
  if (builder.sharedLabels.size > 0 && builder.prs.size >= 2) {
    return 'medium';
  }

  // Low confidence: time-based clustering only
  return 'low';
}

/**
 * Detect project groupings from PRs and tickets
 */
export function detectProjects(
  prs: PullRequestFile[],
  tickets: JiraTicketFile[],
  since: string,
  until: string,
  config: ProjectDetectorConfig = {},
): ProjectsAnalysis {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Build lookup maps
  const prByUrl = new Map<string, PullRequestFile>();
  const ticketByKey = new Map<string, JiraTicketFile>();

  for (const pr of prs) {
    prByUrl.set(pr.frontmatter.url, pr);
  }
  for (const ticket of tickets) {
    ticketByKey.set(ticket.frontmatter.key, ticket);
  }

  // Track which PRs have been assigned
  const assignedPRs = new Set<string>();
  const projects: ProjectBuilder[] = [];

  // ========================================
  // PHASE 1: Ticket-based grouping (highest confidence)
  // ========================================
  // Group PRs by shared ticket references using union-find
  const ticketToPRs = new Map<string, Set<string>>();

  for (const pr of prs) {
    for (const ticketKey of pr.frontmatter.jiraTickets) {
      if (!ticketToPRs.has(ticketKey)) {
        ticketToPRs.set(ticketKey, new Set());
      }
      ticketToPRs.get(ticketKey)?.add(pr.frontmatter.url);
    }
  }

  // Build transitive closure: PRs that share any ticket are in same project
  const prToProject = new Map<string, number>();
  const ticketToProject = new Map<string, number>();

  for (const [ticketKey, prUrls] of ticketToPRs) {
    if (prUrls.size === 0) continue;

    // Check if any of these PRs are already assigned
    let existingProjectIdx: number | undefined;
    for (const url of prUrls) {
      if (prToProject.has(url)) {
        existingProjectIdx = prToProject.get(url);
        break;
      }
    }

    if (existingProjectIdx !== undefined) {
      // Add to existing project
      for (const url of prUrls) {
        prToProject.set(url, existingProjectIdx);
        assignedPRs.add(url);
      }
      ticketToProject.set(ticketKey, existingProjectIdx);

      const project = projects[existingProjectIdx];
      if (project) {
        for (const url of prUrls) {
          project.prs.add(url);
          const pr = prByUrl.get(url);
          if (pr) {
            project.repos.add(
              `${pr.frontmatter.org}/${pr.frontmatter.repository}`,
            );
          }
        }
        project.tickets.add(ticketKey);
        project.sharedTickets.add(ticketKey);
      }
    } else {
      // Create new project
      const projectIdx = projects.length;
      const builder: ProjectBuilder = {
        prs: new Set(prUrls),
        tickets: new Set([ticketKey]),
        sharedTickets: new Set([ticketKey]),
        repos: new Set(),
        sharedLabels: new Set(),
        dominantSignal: 'tickets',
      };

      // Add PR metadata
      for (const url of prUrls) {
        prToProject.set(url, projectIdx);
        assignedPRs.add(url);
        const pr = prByUrl.get(url);
        if (pr) {
          builder.repos.add(
            `${pr.frontmatter.org}/${pr.frontmatter.repository}`,
          );
        }
      }
      ticketToProject.set(ticketKey, projectIdx);

      // Get JIRA project from ticket
      const ticket = ticketByKey.get(ticketKey);
      if (ticket) {
        builder.jiraProject = ticket.frontmatter.project;
      }

      projects.push(builder);
    }
  }

  // ========================================
  // PHASE 2: JIRA project grouping for remaining tickets
  // ========================================
  // Add tickets without linked PRs to existing projects by JIRA project
  for (const ticket of tickets) {
    if (ticketToProject.has(ticket.frontmatter.key)) continue;

    // Find project with same JIRA project
    const jiraProject = ticket.frontmatter.project;
    const matchingProjectIdx = projects.findIndex(
      (p) => p.jiraProject === jiraProject,
    );

    if (matchingProjectIdx >= 0) {
      projects[matchingProjectIdx]?.tickets.add(ticket.frontmatter.key);
      ticketToProject.set(ticket.frontmatter.key, matchingProjectIdx);
    }
  }

  // ========================================
  // PHASE 3: Time-based clustering for unassigned PRs
  // ========================================
  if (cfg.includeUnlinkedPRs) {
    const unassignedPRs = prs.filter(
      (pr) => !assignedPRs.has(pr.frontmatter.url),
    );

    // Group by repo first, then cluster by time
    const prsByRepo = new Map<string, PullRequestFile[]>();
    for (const pr of unassignedPRs) {
      const repoKey = `${pr.frontmatter.org}/${pr.frontmatter.repository}`;
      if (!prsByRepo.has(repoKey)) {
        prsByRepo.set(repoKey, []);
      }
      prsByRepo.get(repoKey)?.push(pr);
    }

    // Time-based clustering within each repo
    for (const [repoKey, repoPRs] of prsByRepo) {
      // Sort by created date
      const sorted = [...repoPRs].sort(
        (a, b) =>
          new Date(a.frontmatter.createdAt).getTime() -
          new Date(b.frontmatter.createdAt).getTime(),
      );

      let currentCluster: PullRequestFile[] = [];
      let clusterStart: Date | null = null;

      const flushCluster = () => {
        if (currentCluster.length >= cfg.minClusterSize) {
          const builder: ProjectBuilder = {
            prs: new Set(currentCluster.map((pr) => pr.frontmatter.url)),
            tickets: new Set(),
            sharedTickets: new Set(),
            repos: new Set([repoKey]),
            sharedLabels: new Set(),
            dominantSignal: 'time',
          };

          // Calculate time range
          const dates = currentCluster.map(
            (pr) => new Date(pr.frontmatter.createdAt),
          );
          builder.earliestDate = new Date(
            Math.min(...dates.map((d) => d.getTime())),
          );
          builder.latestDate = new Date(
            Math.max(...dates.map((d) => d.getTime())),
          );

          // Find common labels
          const labelCounts = new Map<string, number>();
          for (const pr of currentCluster) {
            for (const label of pr.frontmatter.labels) {
              labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
            }
          }
          for (const [label, count] of labelCounts) {
            if (count >= currentCluster.length * 0.5) {
              builder.sharedLabels.add(label);
            }
          }

          for (const pr of currentCluster) {
            assignedPRs.add(pr.frontmatter.url);
          }

          projects.push(builder);
        }
        currentCluster = [];
        clusterStart = null;
      };

      for (const pr of sorted) {
        const prDate = new Date(pr.frontmatter.createdAt);

        if (clusterStart === null) {
          currentCluster.push(pr);
          clusterStart = prDate;
        } else {
          const daysDiff =
            (prDate.getTime() - clusterStart.getTime()) / (1000 * 60 * 60 * 24);

          if (daysDiff <= cfg.timeWindowDays) {
            currentCluster.push(pr);
          } else {
            flushCluster();
            currentCluster.push(pr);
            clusterStart = prDate;
          }
        }
      }

      // Flush remaining cluster
      flushCluster();
    }
  }

  // ========================================
  // Convert builders to ProjectGrouping objects
  // ========================================
  const groupings: ProjectGrouping[] = projects.map((builder, idx) => {
    // Calculate stats
    let totalAdditions = 0;
    let totalDeletions = 0;
    for (const prUrl of builder.prs) {
      const pr = prByUrl.get(prUrl);
      if (pr) {
        totalAdditions += pr.frontmatter.additions;
        totalDeletions += pr.frontmatter.deletions;
      }
    }

    const projectId = generateProjectId(builder, idx);
    const name = generateProjectName(builder, ticketByKey);
    const confidence = calculateConfidence(builder);

    return {
      projectId,
      name,
      prUrls: [...builder.prs],
      ticketKeys: [...builder.tickets],
      signals: {
        sharedTickets: [...builder.sharedTickets],
        jiraProject: builder.jiraProject,
        timeRange:
          builder.earliestDate && builder.latestDate
            ? {
                earliest:
                  builder.earliestDate.toISOString().split('T')[0] ?? '',
                latest: builder.latestDate.toISOString().split('T')[0] ?? '',
              }
            : undefined,
        sharedLabels: [...builder.sharedLabels],
        commonKeywords: [],
      },
      confidence,
      dominantSignal: builder.dominantSignal,
      stats: {
        prCount: builder.prs.size,
        ticketCount: builder.tickets.size,
        totalAdditions,
        totalDeletions,
        repos: [...builder.repos],
      },
    };
  });

  // Sort by PR count (largest first)
  groupings.sort((a, b) => b.stats.prCount - a.stats.prCount);

  // Build summary
  const summary = {
    totalProjects: groupings.length,
    byConfidence: {
      high: groupings.filter((g) => g.confidence === 'high').length,
      medium: groupings.filter((g) => g.confidence === 'medium').length,
      low: groupings.filter((g) => g.confidence === 'low').length,
    },
    bySignal: {
      tickets: groupings.filter((g) => g.dominantSignal === 'tickets').length,
      jiraProject: groupings.filter((g) => g.dominantSignal === 'jiraProject')
        .length,
      time: groupings.filter((g) => g.dominantSignal === 'time').length,
      labels: groupings.filter((g) => g.dominantSignal === 'labels').length,
    },
    unassignedPRs: prs.length - assignedPRs.size,
  };

  return {
    generatedAt: new Date().toISOString(),
    dateRange: { since, until },
    projects: groupings,
    summary,
  };
}
