import {
  type Config,
  type JiraTicketFile,
  readAllPRs,
  readAllTickets,
  writeMarkdownFile,
} from '@work-chronicler/core';
import chalk from 'chalk';
import ora from 'ora';

interface LinkOptions {
  config: Config;
  outputDir: string;
  verbose?: boolean;
}

interface LinkResult {
  prsUpdated: number;
  ticketsUpdated: number;
  linksFound: number;
}

/**
 * Extract JIRA ticket keys from text
 * Matches patterns like: PROJ-123, ABC-1, XYZ-9999
 */
function extractTicketKeys(text: string, projects?: string[]): string[] {
  // Match common JIRA ticket patterns: PROJECT-NUMBER
  const pattern = /\b([A-Z][A-Z0-9_]+-\d+)\b/g;
  const matches = text.match(pattern) || [];
  const keys = [...new Set(matches)];

  // If projects are specified, filter to only those projects
  if (projects && projects.length > 0) {
    const projectPrefixes = projects.map((p) => p.toUpperCase());
    return keys.filter((key) => {
      const parts = key.split('-');
      const prefix = parts[0];
      return prefix !== undefined && projectPrefixes.includes(prefix);
    });
  }

  return keys;
}

/**
 * Get all known JIRA projects from config
 */
function getKnownProjects(config: Config): string[] {
  if (!config.jira?.instances) return [];

  const projects: string[] = [];
  for (const instance of config.jira.instances) {
    projects.push(...instance.projects);
  }
  return projects;
}

/**
 * Link PRs to JIRA tickets by analyzing PR content
 */
export async function linkPRsToTickets(
  options: LinkOptions,
): Promise<LinkResult> {
  const { config, outputDir, verbose } = options;

  console.log(
    `${chalk.cyan('Linking')} - Cross-referencing PRs and JIRA tickets\n`,
  );

  const spinner = ora();

  spinner.start('Reading PR files...');
  const prs = await readAllPRs(outputDir);
  spinner.text = `Found ${chalk.cyan(prs.length)} PRs`;

  spinner.text = 'Reading JIRA ticket files...';
  const tickets = await readAllTickets(outputDir);
  spinner.succeed(
    `Found ${chalk.cyan(prs.length)} PRs and ${chalk.cyan(tickets.length)} tickets`,
  );

  if (prs.length === 0) {
    console.log(chalk.gray('No PRs found to link'));
    return { prsUpdated: 0, ticketsUpdated: 0, linksFound: 0 };
  }

  const knownProjects = getKnownProjects(config);
  const ticketMap = new Map<string, JiraTicketFile>();
  for (const ticket of tickets) {
    ticketMap.set(ticket.frontmatter.key, ticket);
  }

  let prsUpdated = 0;
  let ticketsUpdated = 0;
  let linksFound = 0;

  // Track which tickets are linked to which PRs
  const ticketToPRs = new Map<string, Set<string>>();

  spinner.start('Scanning PRs for ticket references...');

  // First pass: find ticket references in PRs
  for (let i = 0; i < prs.length; i++) {
    const pr = prs[i]!;
    spinner.text = `Scanning PRs for ticket references... (${i + 1}/${prs.length})`;

    const searchText = `${pr.frontmatter.title} ${pr.body}`;
    const foundKeys = extractTicketKeys(
      searchText,
      knownProjects.length > 0 ? knownProjects : undefined,
    );

    if (foundKeys.length === 0) continue;

    // Check if PR already has these tickets linked
    const existingKeys = new Set(pr.frontmatter.jiraTickets);
    const newKeys = foundKeys.filter((k) => !existingKeys.has(k));

    if (newKeys.length > 0) {
      // Update PR with new ticket links
      const updatedFrontmatter = {
        ...pr.frontmatter,
        jiraTickets: [...pr.frontmatter.jiraTickets, ...newKeys],
      };

      writeMarkdownFile(
        pr.filePath,
        updatedFrontmatter as unknown as Record<string, unknown>,
        pr.body,
      );
      prsUpdated++;
      linksFound += newKeys.length;

      if (verbose) {
        spinner.stop();
        console.log(
          `  ${chalk.green('✓')} PR #${pr.frontmatter.prNumber}: linked to ${chalk.cyan(newKeys.join(', '))}`,
        );
        spinner.start();
      }
    }

    // Track for reverse linking
    for (const key of [...existingKeys, ...newKeys]) {
      if (!ticketToPRs.has(key)) {
        ticketToPRs.set(key, new Set());
      }
      ticketToPRs.get(key)!.add(pr.frontmatter.url);
    }
  }

  spinner.succeed(
    `Scanned ${chalk.cyan(prs.length)} PRs, found ${chalk.green(linksFound)} ticket references`,
  );

  // Second pass: update tickets with linked PRs
  if (ticketToPRs.size > 0) {
    spinner.start('Updating tickets with PR links...');

    const ticketEntries = [...ticketToPRs.entries()];
    for (let i = 0; i < ticketEntries.length; i++) {
      const entry = ticketEntries[i]!;
      const [ticketKey, prUrls] = entry;
      spinner.text = `Updating tickets with PR links... (${i + 1}/${ticketEntries.length})`;

      const ticket = ticketMap.get(ticketKey);
      if (!ticket) continue;

      const existingUrls = new Set(ticket.frontmatter.linkedPRs);
      const newUrls = [...prUrls].filter((url) => !existingUrls.has(url));

      if (newUrls.length > 0) {
        const updatedFrontmatter = {
          ...ticket.frontmatter,
          linkedPRs: [...ticket.frontmatter.linkedPRs, ...newUrls],
        };

        writeMarkdownFile(
          ticket.filePath,
          updatedFrontmatter as unknown as Record<string, unknown>,
          ticket.body,
        );
        ticketsUpdated++;

        if (verbose) {
          spinner.stop();
          console.log(
            `  ${chalk.green('✓')} ${ticketKey}: linked to ${chalk.cyan(newUrls.length)} PR(s)`,
          );
          spinner.start();
        }
      }
    }

    spinner.succeed(
      `Updated ${chalk.green(ticketsUpdated)} tickets with PR links`,
    );
  }

  return { prsUpdated, ticketsUpdated, linksFound };
}
