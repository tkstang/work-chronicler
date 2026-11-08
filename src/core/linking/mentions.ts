import type { ImportedRecord } from '@wc-types/imported-record';
import type { PullRequestFile } from '@wc-types/pr';
import type { JiraTicketFile } from '@wc-types/ticket';

/**
 * Mentions and links.
 *
 * A link is a cross-reference `link` stores in the work log (a PR's
 * `jiraTickets`, a ticket's `linkedPRs`). A mention is what an imported
 * record says it refers to, as written at the source. Mentions are resolved
 * against the PRs and tickets in a work log when they are read, and are never
 * stored as links: a mention that matches nothing stays unresolved.
 */

/** Web form: https://<host>/<owner>/<repo>/pull/<number>[/<tab>][?query][#fragment] */
const WEB_PR_URL =
  /^https?:\/\/([^/\s?#@]+)\/([^/\s?#]+)\/([^/\s?#]+)\/pull\/(\d+)(?:\/[^?#\s]*)?(?:[?#]\S*)?$/i;
/** API form: https://api.<host>/repos/<owner>/<repo>/pulls/<number> */
const API_PR_URL =
  /^https?:\/\/api\.([^/\s?#@]+)\/repos\/([^/\s?#]+)\/([^/\s?#]+)\/pulls\/(\d+)\/?(?:[?#]\S*)?$/i;

/**
 * Normalize a pull request URL to one canonical form, so the same PR written
 * different ways compares equal: `https://<host>/<owner>/<repo>/pull/<n>`,
 * with the host, owner and repository in lower case (GitHub treats them
 * case-insensitively), `www.` dropped, and any tab (`/files`, `/commits`),
 * trailing slash, query or fragment removed. GitHub API URLs
 * (`api.github.com/repos/<owner>/<repo>/pulls/<n>`) map to the same form.
 *
 * @param url - A URL as written anywhere (PR frontmatter, a ticket, a mention)
 * @returns The canonical URL, or null when it is not a pull request URL
 */
export function normalizePullRequestUrl(url: string): string | null {
  const text = url.trim();
  const match = API_PR_URL.exec(text) ?? WEB_PR_URL.exec(text);
  if (!match) return null;
  const [, rawHost = '', owner = '', repo = '', rawNumber = ''] = match;
  const prNumber = Number(rawNumber);
  if (!Number.isSafeInteger(prNumber) || prNumber <= 0) return null;
  const host = rawHost.toLowerCase().replace(/^www\./, '');
  return `https://${host}/${owner.toLowerCase()}/${repo.toLowerCase()}/pull/${prNumber}`;
}

/**
 * The org (owner) and repository named in a pull request URL, lower-cased.
 *
 * @param url - A pull request URL in any accepted form
 * @returns The owner and repository, or null when it is not a PR URL
 */
export function getPullRequestUrlRepository(
  url: string,
): { org: string; repository: string } | null {
  const normalized = normalizePullRequestUrl(url);
  if (!normalized) return null;
  const [org = '', repository = ''] = new URL(normalized).pathname
    .split('/')
    .filter(Boolean);
  return { org, repository };
}

/** PRs and tickets in one work log, keyed for mention resolution */
export interface MentionIndex {
  pullRequests: Map<string, PullRequestFile>;
  tickets: Map<string, JiraTicketFile>;
}

/**
 * Index a work log's PRs by canonical URL and tickets by upper-case key.
 * A key held by tickets from two JIRA instances (`org`) names neither for
 * certain, so it is left out: its mentions stay unresolved rather than
 * pointing at whichever ticket was read first.
 *
 * @param prs - Authored PRs in the work log
 * @param tickets - Tickets in the work log
 */
export function buildMentionIndex(
  prs: PullRequestFile[],
  tickets: JiraTicketFile[],
): MentionIndex {
  const pullRequests = new Map<string, PullRequestFile>();
  for (const pr of prs) {
    const key = normalizePullRequestUrl(pr.frontmatter.url);
    if (key && !pullRequests.has(key)) pullRequests.set(key, pr);
  }
  const ticketMap = new Map<string, JiraTicketFile>();
  const ambiguous = new Set<string>();
  for (const ticket of tickets) {
    const key = ticket.frontmatter.key.toUpperCase();
    const first = ticketMap.get(key);
    if (!first) ticketMap.set(key, ticket);
    else if (first.frontmatter.org !== ticket.frontmatter.org) {
      ambiguous.add(key);
    }
  }
  for (const key of ambiguous) ticketMap.delete(key);
  return { pullRequests, tickets: ticketMap };
}

/** One PR mention, with the PR it resolves to when the work log has it */
export interface PullRequestMention {
  /** The URL as the record wrote it */
  url: string;
  /** Canonical form, or null when the URL is not a pull request URL */
  normalizedUrl: string | null;
  resolved: PullRequestFile | null;
}

/** One ticket mention, with the ticket it resolves to when the work log has it */
export interface TicketMention {
  key: string;
  resolved: JiraTicketFile | null;
}

export interface ResolvedMentions {
  pullRequests: PullRequestMention[];
  tickets: TicketMention[];
}

/**
 * Resolve a record's mentions against a work log. Every mention is returned;
 * those that match no PR or ticket in the index have `resolved: null`.
 * Mentions of the same PR or ticket written different ways are listed once.
 *
 * @param record - An imported record
 * @param index - The work log's PRs and tickets
 */
export function resolveMentions(
  record: Pick<ImportedRecord, 'mentions'>,
  index: MentionIndex,
): ResolvedMentions {
  const seenPRs = new Set<string>();
  const pullRequests: PullRequestMention[] = [];
  for (const url of record.mentions.pullRequests) {
    const normalizedUrl = normalizePullRequestUrl(url);
    const key = normalizedUrl ?? url;
    if (seenPRs.has(key)) continue;
    seenPRs.add(key);
    pullRequests.push({
      url,
      normalizedUrl,
      resolved: normalizedUrl
        ? (index.pullRequests.get(normalizedUrl) ?? null)
        : null,
    });
  }

  const seenTickets = new Set<string>();
  const tickets: TicketMention[] = [];
  for (const raw of record.mentions.tickets) {
    const key = raw.toUpperCase();
    if (seenTickets.has(key)) continue;
    seenTickets.add(key);
    tickets.push({ key, resolved: index.tickets.get(key) ?? null });
  }

  return { pullRequests, tickets };
}

/**
 * Whether a record mentions a PR or ticket that resolves in the index.
 */
export function hasResolvedMention(
  record: Pick<ImportedRecord, 'mentions'>,
  index: MentionIndex,
): boolean {
  const { pullRequests, tickets } = resolveMentions(record, index);
  return (
    pullRequests.some((m) => m.resolved !== null) ||
    tickets.some((m) => m.resolved !== null)
  );
}
