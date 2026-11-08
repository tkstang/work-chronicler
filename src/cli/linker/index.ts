import {
  buildMentionIndex,
  type Config,
  ImportInProgressError,
  type JiraTicketFile,
  normalizePullRequestUrl,
  readAllImportedRecords,
  readAllPRs,
  readAllTickets,
  resolveMentions,
  writeMarkdownFile,
} from '@core/index';
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
  /**
   * Mentions in imported records (such as messages), resolved against the
   * PRs and tickets in the work log. They are reported, never stored as links.
   */
  mentions: {
    records: number;
    resolved: number;
    unresolved: number;
  };
}

/**
 * Resolve every imported record's mentions against the work log. Records are
 * only read: a mention is not a link, and imported records are changed only
 * by `import`.
 */
async function resolveImportedMentions(
  outputDir: string,
  index: ReturnType<typeof buildMentionIndex>,
): Promise<LinkResult['mentions']> {
  let records: Awaited<ReturnType<typeof readAllImportedRecords>>;
  try {
    records = await readAllImportedRecords(outputDir);
  } catch (error) {
    // Mentions are only reported: say why they were not, and link the rest
    if (!(error instanceof ImportInProgressError)) throw error;
    console.warn(
      `Warning: Mentions in imported records were not checked. ${error.message}`,
    );
    return { records: 0, resolved: 0, unresolved: 0 };
  }
  let resolved = 0;
  let unresolved = 0;
  for (const record of records) {
    const mentions = resolveMentions(record.frontmatter, index);
    for (const mention of [...mentions.pullRequests, ...mentions.tickets]) {
      if (mention.resolved) resolved++;
      else unresolved++;
    }
  }
  return { records: records.length, resolved, unresolved };
}

/**
 * Prefixes of standards, algorithms and versioned names that share the
 * `ABC-123` shape of a JIRA key (UTF-8, ISO-8601, SHA-256, GPT-4, ...).
 *
 * Used only when no JIRA projects are configured. With configured projects,
 * matches are restricted to those project keys instead, so a real project
 * named like one of these (e.g. `SHA`) still links.
 */
const NON_TICKET_PREFIXES = new Set([
  'AES',
  'ARM',
  'CVE',
  'CWE',
  'ECMA',
  'ES',
  'GPT',
  'HTTP',
  'IEC',
  'IEEE',
  'IPV',
  'ISO',
  'MD',
  'PEP',
  'RFC',
  'RSA',
  'SHA',
  'SSL',
  'TLS',
  'UTF',
  'WCAG',
]);

/**
 * Extract JIRA ticket keys from text
 * Matches patterns like: PROJ-123, ABC-1, XYZ-9999
 *
 * With `projects`, only keys from those projects are returned. Without them,
 * keys whose prefix is a known standard or version name (optionally followed
 * by digits, as in `SHA3`) are dropped, unless the exact key is a fetched
 * ticket in `knownKeys`.
 */
function extractTicketKeys(
  text: string,
  projects: string[] | undefined,
  knownKeys: ReadonlySet<string>,
): string[] {
  // Match common JIRA ticket patterns: PROJECT-NUMBER
  const pattern = /\b([A-Z][A-Z0-9_]+-\d+)\b/g;
  const matches = text.match(pattern) || [];
  const keys = [...new Set(matches)];
  const prefixOf = (key: string) => key.slice(0, key.lastIndexOf('-'));

  // If projects are specified, filter to only those projects
  if (projects && projects.length > 0) {
    // Keys in text are matched in upper case, so normalize the configured
    // keys the same way (a stray space in config must not drop a project).
    const projectPrefixes = new Set(
      projects.map((p) => p.trim().toUpperCase()),
    );
    return keys.filter((key) => projectPrefixes.has(prefixOf(key)));
  }

  // A versioned standard keeps its base name before the digits (SHA3-256,
  // MD5-1, IPV6-2), so compare that base against the deny-list.
  const basePrefixOf = (key: string) => prefixOf(key).replace(/\d+$/, '');
  return keys.filter(
    (key) => knownKeys.has(key) || !NON_TICKET_PREFIXES.has(basePrefixOf(key)),
  );
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

  const reportMentions = async (): Promise<LinkResult['mentions']> => {
    const mentions = await resolveImportedMentions(
      outputDir,
      buildMentionIndex(prs, tickets),
    );
    if (mentions.records > 0) {
      console.log(
        `${chalk.green('✓')} Resolved ${chalk.cyan(mentions.resolved)} of ${mentions.resolved + mentions.unresolved} mentions in ${mentions.records} imported records to PRs and tickets in the work log (mentions are not stored as links)`,
      );
    }
    return mentions;
  };

  if (prs.length === 0) {
    console.log(chalk.gray('No PRs found to link'));
    return {
      prsUpdated: 0,
      ticketsUpdated: 0,
      linksFound: 0,
      mentions: await reportMentions(),
    };
  }

  const knownProjects = getKnownProjects(config);
  const ticketMap = new Map<string, JiraTicketFile>();
  for (const ticket of tickets) {
    ticketMap.set(ticket.frontmatter.key, ticket);
  }
  const knownTicketKeys = new Set(ticketMap.keys());

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
      knownTicketKeys,
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

      writeMarkdownFile(pr.filePath, updatedFrontmatter, pr.body);
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

      // Compare in canonical form, so a URL stored with other capitalization
      // or a trailing tab is not linked twice
      const canonical = (url: string) => normalizePullRequestUrl(url) ?? url;
      const existingUrls = new Set(ticket.frontmatter.linkedPRs.map(canonical));
      const newUrls = [...prUrls].filter(
        (url) => !existingUrls.has(canonical(url)),
      );

      if (newUrls.length > 0) {
        const updatedFrontmatter = {
          ...ticket.frontmatter,
          linkedPRs: [...ticket.frontmatter.linkedPRs, ...newUrls],
        };

        writeMarkdownFile(ticket.filePath, updatedFrontmatter, ticket.body);
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

  return {
    prsUpdated,
    ticketsUpdated,
    linksFound,
    mentions: await reportMentions(),
  };
}
