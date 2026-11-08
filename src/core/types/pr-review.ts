import { z } from 'zod';

import { IsoDateTimeSchema } from './pr';

/**
 * The pull request a review was given on. Kept even when the PR is not in
 * the work log, so a review record stands on its own. This is someone
 * else's PR: it is never counted as authored work.
 */
export const ReviewedPullRequestSchema = z.object({
  /** Canonical `https://github.com/<org>/<repo>/pull/<number>` URL */
  url: z.url(),
  org: z.string(),
  repository: z.string(),
  prNumber: z.number(),
  title: z.string(),
  /** Login of the PR's author (not the reviewer) */
  author: z.string(),
  state: z.enum(['open', 'closed', 'merged']),
});

/**
 * One submitted review. Pending (unsubmitted) reviews are never stored.
 */
export const GivenReviewSchema = z.object({
  reviewId: z.number(),
  state: z.enum(['APPROVED', 'CHANGES_REQUESTED', 'COMMENTED', 'DISMISSED']),
  submittedAt: IsoDateTimeSchema,
  url: z.url(),
  body: z.string().default(''),
});

/**
 * One inline review comment (a comment on a line of the diff). Ordinary PR
 * conversation comments are not review comments and are never stored.
 */
export const GivenReviewCommentSchema = z.object({
  commentId: z.number(),
  /** The review this comment was submitted with */
  reviewId: z.number().nullable(),
  /** Set when the comment replies to another comment in a thread */
  inReplyToId: z.number().nullable(),
  path: z.string(),
  line: z.number().nullable(),
  createdAt: IsoDateTimeSchema,
  /** Later than `createdAt` when the comment was edited */
  updatedAt: IsoDateTimeSchema,
  url: z.url(),
  body: z.string(),
});

/**
 * Review work the user did on one pull request: the reviews they submitted
 * and the inline comments they wrote inside the fetch range. One record per
 * reviewed PR, identified by its canonical URL.
 */
export const PRReviewRecordSchema = z.object({
  type: z.literal('pr-review'),
  /** Login of the user who gave the reviews */
  reviewer: z.string(),
  pr: ReviewedPullRequestSchema,
  /**
   * The PR's `updated_at` when last fetched. With `--cache`, a PR whose
   * `updated_at` is unchanged and whose range is already covered is skipped.
   */
  prUpdatedAt: IsoDateTimeSchema,
  /** The fetch range this record was last written for */
  fetchedRange: z
    .object({ since: IsoDateTimeSchema, until: IsoDateTimeSchema })
    .optional(),
  reviews: z.array(GivenReviewSchema).default([]),
  comments: z.array(GivenReviewCommentSchema).default([]),
});

export type ReviewedPullRequest = z.infer<typeof ReviewedPullRequestSchema>;
export type GivenReview = z.infer<typeof GivenReviewSchema>;
export type GivenReviewComment = z.infer<typeof GivenReviewCommentSchema>;
export type PRReviewRecord = z.infer<typeof PRReviewRecordSchema>;

/**
 * Review record file with frontmatter and body content
 */
export interface PRReviewRecordFile {
  frontmatter: PRReviewRecord;
  body: string;
  filePath: string;
}

/**
 * Timestamps of every review and comment in a record, oldest first.
 */
export function getReviewActivityDates(record: PRReviewRecord): string[] {
  return [
    ...record.reviews.map((r) => r.submittedAt),
    ...record.comments.map((c) => c.createdAt),
  ].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
}

/**
 * Split review record files into those written for `username` and those
 * written for someone else. Logins compare case-insensitively, as on GitHub.
 * Without a username every record counts as the user's.
 */
export function splitReviewRecordsByReviewer<
  T extends { frontmatter: PRReviewRecord },
>(
  files: T[],
  username: string | undefined,
): { own: T[]; foreign: T[]; foreignReviewers: string[] } {
  const own: T[] = [];
  const foreign: T[] = [];
  const foreignReviewers: string[] = [];
  for (const file of files) {
    const reviewer = file.frontmatter.reviewer;
    if (!username || reviewer.toLowerCase() === username.toLowerCase()) {
      own.push(file);
      continue;
    }
    foreign.push(file);
    if (!foreignReviewers.includes(reviewer)) foreignReviewers.push(reviewer);
  }
  return { own, foreign, foreignReviewers };
}
