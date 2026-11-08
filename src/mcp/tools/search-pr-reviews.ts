import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  DIRECTORIES,
  isFilteredSubsetMissingReviews,
  readAllPRReviews,
} from '@core/index';
import { z } from 'zod';

import { defineTool, jsonResult, parseAndValidateDate } from './types';

function truncate(text: string, length: number): string {
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

export const searchPrReviewsTool = defineTool({
  name: 'search_pr_reviews',
  description:
    "Search the reviews and inline review comments the user gave on other people's pull requests. This is review work, not authored PRs; search_prs never includes it.",
  inputSchema: {
    query: z
      .string()
      .optional()
      .describe('Search term for PR title, review text and comment text'),
    org: z.string().optional().describe('Filter by organization name'),
    repo: z.string().optional().describe('Filter by repository name'),
    state: z
      .enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED'])
      .optional()
      .describe(
        'Only reviews with this state, and the inline comments submitted with them',
      ),
    since: z
      .string()
      .optional()
      .describe('Start date for review and comment times (ISO format)'),
    until: z
      .string()
      .optional()
      .describe('End date for review and comment times (ISO format)'),
    limit: z.number().optional().describe('Maximum number of reviewed PRs'),
  },
  handler: async (input, { outputDir, fullOutputDir }) => {
    // A filtered subset written before reviews were fetched has no
    // pr-reviews/. Read the full work log then, and say so, rather than
    // reporting no reviews. A subset that has pr-reviews/ is always used.
    let source = outputDir;
    let note: string | undefined;
    const fullDir = fullOutputDir ?? outputDir;
    if (fullDir !== outputDir && isFilteredSubsetMissingReviews(fullDir)) {
      source = fullDir;
      note =
        'The filtered subset was created before PR reviews were fetched, so these results come from the full work log. Re-run `work-chronicler filter` to apply your filters to reviews.';
    } else if (!existsSync(join(fullDir, DIRECTORIES.PR_REVIEWS))) {
      note =
        'No PR reviews have been fetched. Run `work-chronicler fetch github --reviews` (IC profiles only).';
    }

    const since = input.since
      ? parseAndValidateDate(input.since, 'since')
      : null;
    const until = input.until
      ? parseAndValidateDate(input.until, 'until')
      : null;
    const inRange = (timestamp: string) => {
      const date = new Date(timestamp);
      return (!since || date >= since) && (!until || date <= until);
    };
    const queryLower = input.query?.toLowerCase();

    let results = (await readAllPRReviews(source))
      .map(({ frontmatter: record }) => {
        // With a state, keep the comments submitted with a review in that
        // state: they carry the review's substance (e.g. requested changes)
        const reviewIdsInState = new Set(
          record.reviews
            .filter((r) => r.state === input.state)
            .map((r) => r.reviewId),
        );
        return {
          record,
          reviews: record.reviews.filter(
            (r) =>
              inRange(r.submittedAt) &&
              (!input.state || r.state === input.state),
          ),
          comments: record.comments.filter(
            (c) =>
              inRange(c.createdAt) &&
              (!input.state ||
                (c.reviewId !== null && reviewIdsInState.has(c.reviewId))),
          ),
        };
      })
      .filter(({ record, reviews, comments }) => {
        if (reviews.length === 0 && comments.length === 0) return false;
        if (input.org && record.pr.org !== input.org) return false;
        if (input.repo && !record.pr.repository.includes(input.repo)) {
          return false;
        }
        if (queryLower) {
          const text = [
            record.pr.title,
            ...reviews.map((r) => r.body),
            ...comments.map((c) => c.body),
          ]
            .join('\n')
            .toLowerCase();
          if (!text.includes(queryLower)) return false;
        }
        return true;
      })
      .map(({ record, reviews, comments }) => {
        const activity = [
          ...reviews.map((r) => r.submittedAt),
          ...comments.map((c) => c.createdAt),
        ].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        return {
          prUrl: record.pr.url,
          org: record.pr.org,
          repository: record.pr.repository,
          prNumber: record.pr.prNumber,
          title: record.pr.title,
          prAuthor: record.pr.author,
          prState: record.pr.state,
          firstActivityAt: activity[0] ?? null,
          lastActivityAt: activity[activity.length - 1] ?? null,
          reviews: reviews.map((r) => ({
            reviewId: r.reviewId,
            state: r.state,
            submittedAt: r.submittedAt,
            url: r.url,
            body: truncate(r.body, 500),
          })),
          comments: comments.map((c) => ({
            commentId: c.commentId,
            reviewId: c.reviewId,
            path: c.path,
            line: c.line,
            createdAt: c.createdAt,
            url: c.url,
            body: truncate(c.body, 300),
          })),
        };
      });

    // Most recent review activity first
    results.sort(
      (a, b) =>
        new Date(b.lastActivityAt ?? 0).getTime() -
        new Date(a.lastActivityAt ?? 0).getTime(),
    );

    const total = results.length;
    const totals = {
      reviews: results.reduce((sum, r) => sum + r.reviews.length, 0),
      comments: results.reduce((sum, r) => sum + r.comments.length, 0),
    };
    if (input.limit && input.limit > 0) {
      results = results.slice(0, input.limit);
    }

    return jsonResult({
      results,
      total,
      returned: results.length,
      totals,
      ...(note ? { note } : {}),
    });
  },
});
