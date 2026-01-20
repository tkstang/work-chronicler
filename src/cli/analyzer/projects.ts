import type {
  JiraTicketFile,
  ProjectConfidence,
  ProjectGrouping,
  ProjectsAnalysis,
  PullRequestFile,
} from '@core/index';

/**
 * Internal representation of a project during detection
 */
interface ProjectBuilder {
  prs: Set<string>; // PR URLs
  tickets: Set<string>; // Ticket keys
  sharedTickets: Set<string>;
  repos: Set<string>;
  jiraProject?: string;
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
 *
 * Only ticket-linked groupings get high confidence.
 * Everything else is unassigned.
 */
function calculateConfidence(builder: ProjectBuilder): ProjectConfidence {
  // High confidence: explicit ticket linking
  if (builder.sharedTickets.size > 0) {
    return 'high';
  }

  // No other signals produce confident groupings
  return 'low';
}

/**
 * Detect project groupings from PRs and tickets
 *
 * Projects are detected based on shared JIRA ticket references.
 * PRs that reference the same ticket are grouped together.
 * PRs without ticket references are not grouped into projects.
 */
export function detectProjects(
  prs: PullRequestFile[],
  tickets: JiraTicketFile[],
  since: string,
  until: string,
): ProjectsAnalysis {
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
  // Ticket-based grouping (only reliable signal)
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
        sharedLabels: [],
        commonKeywords: [],
      },
      confidence,
      dominantSignal: 'tickets' as const,
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
      tickets: groupings.length,
      jiraProject: 0,
      time: 0,
      labels: 0,
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
