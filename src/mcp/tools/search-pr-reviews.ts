import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  DIRECTORIES,
  readAllPRReviews,
  splitReviewRecordsByReviewer,
} from '@core/index';
import { z } from 'zod';

import {
  defineTool,
  jsonResult,
  parseAndValidateDate,
  subsetGapNote,
  truncate,
} from './types';

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
  handler: async (input, { outputDir, fullOutputDir, githubUsername }) => {
    // A selected subset is always used. One written before reviews were
    // fetched has no pr-reviews/: say so, with no results, rather than
    // reading the full work log behind the user's selection.
    const notes: string[] = [];
    const fullDir = fullOutputDir ?? outputDir;
    const gap = subsetGapNote(outputDir, fullDir, DIRECTORIES.PR_REVIEWS);
    if (gap) {
      return jsonResult({
        results: [],
        total: 0,
        returned: 0,
        totals: { reviews: 0, comments: 0 },
        note: gap,
      });
    }
    if (!existsSync(join(fullDir, DIRECTORIES.PR_REVIEWS))) {
      notes.push(
        'No PR reviews have been fetched. Run `work-chronicler fetch github --reviews` (IC profiles only).',
      );
    }

    const records = await readAllPRReviews(outputDir);
    // Without a configured username no record can be shown to be the user's:
    // return none, and say whose records there are, rather than present
    // someone else's reviews as the user's
    if (!githubUsername) {
      const reviewers = [
        ...new Set(records.map((r) => r.frontmatter.reviewer)),
      ];
      if (records.length > 0) {
        notes.push(
          `github.username is not set in the profile config, so ${records.length} review record(s) (reviewer: ${reviewers.join(', ')}) cannot be attributed to the user and are not returned. Do not present them as the user's work: ask the user, or set github.username and restart the MCP server.`,
        );
      }
      return jsonResult({
        results: [],
        total: 0,
        returned: 0,
        totals: { reviews: 0, comments: 0 },
        unattributed: { records: records.length, reviewers },
        ...(notes.length > 0 ? { note: notes.join(' ') } : {}),
      });
    }

    // Records written for another GitHub user are not this user's work
    const { own, foreign, foreignReviewers } = splitReviewRecordsByReviewer(
      records,
      githubUsername,
    );
    if (foreign.length > 0) {
      notes.push(
        `Left out ${foreign.length} review record(s) written for another GitHub user (${foreignReviewers.join(', ')}), not ${githubUsername}. Use a separate profile or output directory for each person.`,
      );
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

    let results = own
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
          reviewer: record.reviewer,
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
      ...(notes.length > 0 ? { note: notes.join(' ') } : {}),
    });
  },
});
