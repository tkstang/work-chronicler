import { relative } from 'node:path';

import {
  type AnalysisStats,
  classifyPRImpact,
  detectProjects,
  generateStats,
  generateTimeline,
  IMPACT_HIERARCHY,
} from '@analyzer/index';
import { serializeImportedRecord } from '@core/import/record-file';
import {
  buildMentionIndex,
  type Config,
  DIRECTORIES,
  getGitHubNameProblem,
  hasResolvedMention,
  normalizeGitHubName,
  normalizePullRequestUrl,
  type PRImpact,
  type ReaderFs,
  readAllPRReviews,
  readAllPRs,
  readAllTickets,
  replaceFilteredSubset,
  scanImportedRecords,
  serializeMarkdownFile,
  splitReviewRecordsByReviewer,
  type SubsetFile,
  type SubsetFs,
  type SubsetPlan,
  type SubsetRecordCounts,
} from '@core/index';

/**
 * Filter criteria, as `filter` options.
 *
 * Most filters describe authored PRs or tickets. For other evidence:
 * - review records (`pr-reviews/`) keep only the org and repo selectors,
 *   applied to the reviewed PR;
 * - imported records (`messages/`) keep only `linkedOnly`, which keeps a
 *   message when one of its mentions resolves to a PR or ticket in the
 *   subset. The other filters do not apply to them.
 */
export interface FilterCriteria {
  excludeImpact?: PRImpact[];
  minImpact?: PRImpact;
  minLoc?: number;
  linkedOnly?: boolean;
  mergedOnly?: boolean;
  excludeStatus?: string[];
  org?: string[];
  excludeOrg?: string[];
  repo?: string[];
  excludeRepo?: string[];
}

/**
 * Describe the active filters, one line each. Empty when none are set.
 */
export function describeFilters(criteria: FilterCriteria): string[] {
  const filters: string[] = [];
  if (criteria.org?.length) {
    filters.push(`Include orgs: ${criteria.org.join(', ')}`);
  }
  if (criteria.excludeOrg?.length) {
    filters.push(`Exclude orgs: ${criteria.excludeOrg.join(', ')}`);
  }
  if (criteria.repo?.length) {
    filters.push(`Include repos: ${criteria.repo.join(', ')}`);
  }
  if (criteria.excludeRepo?.length) {
    filters.push(`Exclude repos: ${criteria.excludeRepo.join(', ')}`);
  }
  if (criteria.excludeImpact?.length) {
    filters.push(`Excluding impact: ${criteria.excludeImpact.join(', ')}`);
  }
  if (criteria.minImpact) {
    filters.push(`Minimum impact: ${criteria.minImpact}`);
  }
  if (criteria.minLoc) {
    filters.push(`Minimum LOC: ${criteria.minLoc}`);
  }
  if (criteria.linkedOnly) {
    filters.push('Linked only');
  }
  if (criteria.mergedOnly) {
    filters.push('Merged PRs only');
  }
  if (criteria.excludeStatus?.length) {
    filters.push(
      `Excluding ticket status: ${criteria.excludeStatus.join(', ')}`,
    );
  }
  return filters;
}

/**
 * Build the org and repo selector shared by PRs and review records.
 * Selectors normalize like the config schema, so `--org @acme` matches
 * `acme` and `--repo @acme/web` matches `acme/web`.
 *
 * @throws For a selector that can never match a stored org
 */
function buildScope(
  criteria: FilterCriteria,
): (org: string, repository: string) => boolean {
  const toFilterKey = (o: string) => normalizeGitHubName(o).toLowerCase();
  const toOrgSelector = (o: string) => {
    const problem = getGitHubNameProblem(normalizeGitHubName(o));
    if (problem) throw new Error(`Invalid org selector "${o}": ${problem}`);
    return toFilterKey(o);
  };
  const toRepoSelector = (r: string) => {
    const [org, repo, ...rest] = r.split('/');
    if (!org || !repo?.trim() || rest.length > 0) {
      throw new Error(`Invalid repo selector "${r}": use org/repo`);
    }
    return `${toOrgSelector(org)}/${repo.trim().toLowerCase()}`;
  };
  const includeOrgs = criteria.org
    ? new Set(criteria.org.map(toOrgSelector))
    : null;
  const excludeOrgs = new Set((criteria.excludeOrg ?? []).map(toOrgSelector));
  const includeRepos = criteria.repo
    ? new Set(criteria.repo.map(toRepoSelector))
    : null;
  const excludeRepos = new Set(
    (criteria.excludeRepo ?? []).map(toRepoSelector),
  );

  return (org, repository) => {
    const orgKey = toFilterKey(org);
    const repoKey = `${orgKey}/${repository.toLowerCase()}`;
    if (includeOrgs && !includeOrgs.has(orgKey)) return false;
    if (excludeOrgs.has(orgKey)) return false;
    if (includeRepos && !includeRepos.has(repoKey)) return false;
    return !excludeRepos.has(repoKey);
  };
}

export interface FilterResult {
  /** The subset directory */
  dir: string;
  /**
   * Records in the new subset. `prReviews` counts only review records
   * attributed to the configured GitHub user; others are copied but not
   * counted.
   */
  counts: SubsetRecordCounts;
  /** Records in the full work log, counted the same way */
  totals: SubsetRecordCounts;
  /** Statistics for the subset (also written to its `.analysis/`) */
  stats: AnalysisStats;
  /** Problems after the subset was in place (leftovers not removed) */
  warnings: string[];
}

/**
 * Select a subset of the work log and write it to `filtered/`, replacing any
 * earlier subset only once the new one is complete and has been read back.
 * On failure the earlier subset is kept and the error is thrown.
 *
 * @param params.outputDir - The full work log
 * @param params.config - Loaded config (analysis thresholds, date range)
 * @param params.criteria - Filters
 * @param params.fs - Filesystem operations (tests inject failures)
 */
export async function writeFilteredSubset(params: {
  outputDir: string;
  config: Config;
  criteria: FilterCriteria;
  fs?: SubsetFs;
  /** Filesystem reads (tests inject failures) */
  readFs?: ReaderFs;
  now?: Date;
}): Promise<FilterResult> {
  const { outputDir, config, criteria } = params;
  const inScope = buildScope(criteria);
  let built: Pick<FilterResult, 'counts' | 'totals' | 'stats'> | undefined;

  // Records are read only under the work-log lock, after any interrupted
  // import is finished, so the subset never holds part of an import's batch
  const { dir, warnings } = await replaceFilteredSubset(
    outputDir,
    async (): Promise<SubsetPlan> => {
      // Strict reads: a directory or file that cannot be read fails the filter
      // (keeping the previous subset) instead of looking like no records
      const read = {
        strict: true,
        ...(params.readFs ? { fs: params.readFs } : {}),
      };
      const allPRs = await readAllPRs(outputDir, read);
      const allTickets = await readAllTickets(outputDir, read);
      const allReviews = await readAllPRReviews(outputDir, read);
      const imported = scanImportedRecords(outputDir, read);
      const unreadable = imported.skipped.filter((s) => s.unreadable);
      if (unreadable.length > 0) {
        throw new Error(
          `Could not read ${unreadable.map((s) => s.filePath).join(', ')}; the filtered subset was not changed`,
        );
      }
      for (const { filePath, reason } of imported.skipped) {
        console.warn(`Warning: Skipped ${filePath}: ${reason}`);
      }
      const allMessages = imported.records.filter(
        (record) => record.frontmatter.type === 'message',
      );

      const excludeImpacts = new Set<PRImpact>(criteria.excludeImpact ?? []);
      const minImpactLevel = criteria.minImpact
        ? IMPACT_HIERARCHY[criteria.minImpact]
        : 0;

      const prs = allPRs.filter((pr) => {
        const fm = pr.frontmatter;
        if (!inScope(fm.org, fm.repository)) return false;
        const impact = fm.impact ?? classifyPRImpact(fm, config.analysis);
        if (excludeImpacts.has(impact)) return false;
        if (IMPACT_HIERARCHY[impact] < minImpactLevel) return false;
        if (criteria.minLoc && fm.additions + fm.deletions < criteria.minLoc) {
          return false;
        }
        if (criteria.linkedOnly && fm.jiraTickets.length === 0) return false;
        if (criteria.mergedOnly && fm.state !== 'merged') return false;
        return true;
      });

      // Tickets: status filter; with linked-only, only tickets linked to a PR in
      // the subset (URLs compared in canonical form)
      const prUrls = new Set(
        prs.map(
          (pr) =>
            normalizePullRequestUrl(pr.frontmatter.url) ?? pr.frontmatter.url,
        ),
      );
      const excludeStatuses = new Set<string>(criteria.excludeStatus ?? []);
      const tickets = allTickets.filter((ticket) => {
        if (excludeStatuses.has(ticket.frontmatter.status)) return false;
        if (criteria.linkedOnly) {
          return ticket.frontmatter.linkedPRs.some((url) =>
            prUrls.has(normalizePullRequestUrl(url) ?? url),
          );
        }
        return true;
      });

      // Review records describe review work: only the org and repo selectors
      // apply, and they never enter the analysis
      const reviews = allReviews.filter((record) =>
        inScope(record.frontmatter.pr.org, record.frontmatter.pr.repository),
      );

      // Messages are supplementary evidence: only linked-only applies, through
      // mentions that resolve to a PR or ticket in the subset
      const index = buildMentionIndex(prs, tickets);
      const messages = criteria.linkedOnly
        ? allMessages.filter((record) =>
            hasResolvedMention(record.frontmatter, index),
          )
        : allMessages;

      const since = config.fetch.since;
      const until =
        config.fetch.until ?? new Date().toISOString().split('T')[0] ?? '';
      const stats = generateStats(prs, tickets, since, until, messages);
      const projects = detectProjects(prs, tickets, since, until);
      const timeline = generateTimeline(prs, tickets, since, until);

      const relativeTo = (filePath: string) => relative(outputDir, filePath);
      const files: SubsetFile[] = [
        ...prs.map((pr) => ({
          path: relativeTo(pr.filePath),
          contents: serializeMarkdownFile(pr.frontmatter, pr.body),
        })),
        ...tickets.map((ticket) => ({
          path: relativeTo(ticket.filePath),
          contents: serializeMarkdownFile(ticket.frontmatter, ticket.body),
        })),
        ...reviews.map((record) => ({
          path: relativeTo(record.filePath),
          contents: serializeMarkdownFile(record.frontmatter, record.body),
        })),
        ...messages.map((record) => ({
          path: relativeTo(record.filePath),
          contents: serializeImportedRecord(record.frontmatter, record.body),
        })),
        ...(
          [
            ['stats', stats],
            ['projects', projects],
            ['timeline', timeline],
          ] as const
        ).map(([name, value]) => ({
          path: `${DIRECTORIES.ANALYSIS}/${name}.json`,
          contents: JSON.stringify(value, null, 2),
        })),
      ];

      // Every review record is copied (readers leave out other people's), but
      // only the user's own count as their reviewed PRs, as in `status`. Without
      // a configured username none can be attributed.
      const username = config.github.username;
      const ownReviews = (records: typeof allReviews) =>
        username
          ? splitReviewRecordsByReviewer(records, username).own.length
          : 0;
      const counts: SubsetRecordCounts = {
        pullRequests: prs.length,
        tickets: tickets.length,
        prReviews: ownReviews(reviews),
        messages: messages.length,
      };
      const totals: SubsetRecordCounts = {
        pullRequests: allPRs.length,
        tickets: allTickets.length,
        prReviews: ownReviews(allReviews),
        messages: allMessages.length,
      };
      // What is written, for the read-back check
      const written: SubsetRecordCounts = {
        ...counts,
        prReviews: reviews.length,
      };

      built = { counts, totals, stats };
      return {
        files,
        // Every record directory, even empty, so the subset is never mistaken
        // for one made before a record type existed
        directories: [
          DIRECTORIES.PULL_REQUESTS,
          DIRECTORIES.JIRA,
          DIRECTORIES.PR_REVIEWS,
          DIRECTORIES.MESSAGES,
          DIRECTORIES.ANALYSIS,
        ],
        selection: {
          version: 1,
          createdAt: (params.now ?? new Date()).toISOString(),
          filters: describeFilters(criteria),
          counts,
          totals,
        },
        // Every record must read back as the record it was
        validate: async (staging) => {
          const imported = scanImportedRecords(staging);
          const readBack: SubsetRecordCounts = {
            pullRequests: (await readAllPRs(staging)).length,
            tickets: (await readAllTickets(staging)).length,
            prReviews: (await readAllPRReviews(staging)).length,
            messages: imported.records.length,
          };
          if (
            imported.skipped.length > 0 ||
            JSON.stringify(readBack) !== JSON.stringify(written)
          ) {
            throw new Error(
              'The new filtered subset did not read back with the records it was written with; the previous subset is unchanged',
            );
          }
        },
      };
    },
    params.fs ? { fs: params.fs } : {},
  );
  if (!built) throw new Error('The filtered subset was built without a plan');

  return { dir, ...built, warnings };
}
