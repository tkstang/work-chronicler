import { z } from 'zod';

import { IsoDateTimeSchema } from './pr';

/**
 * Imported records: evidence a skill reads from another service (such as
 * Slack) and hands to `work-chronicler import` as a staged batch. Every
 * record type shares one thin envelope; type-specific details live under a
 * key named after the type (`message:` for messages), so later types (such
 * as `documents`) add a member without changing the envelope.
 */

/** Envelope version written by this release */
export const IMPORT_SCHEMA_VERSION = 1;

/**
 * Sources the CLI accepts. Each has rules in `@core/import/sources`; a
 * record from any other source is rejected.
 */
export const IMPORT_SOURCES = ['slack'] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

/** Record types, as written in the `type` field */
export const IMPORTED_RECORD_TYPES = ['message'] as const;
export type ImportedRecordType = (typeof IMPORTED_RECORD_TYPES)[number];

/**
 * An identifier from the source: one line of printable text. Never used as a
 * path; destination paths are derived from a hash of the identity.
 */
const IdentifierSchema = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[^\p{Cc}]+$/u, 'must not contain control characters');

const HttpUrlSchema = z.url({ protocol: /^https?$/ });

/** A report ID as generated from a report name (`alice-smith`) */
export const ReportIdSchema = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'must be a report ID (lowercase letters, digits and single hyphens)',
  );

/**
 * Who the record is about: the IC who owns the profile, or one report in a
 * manager profile. Import refuses a record whose subject is not the target.
 */
export const ImportSubjectSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('ic') }),
  z.strictObject({ kind: z.literal('report'), reportId: ReportIdSchema }),
]);
export type ImportSubject = z.infer<typeof ImportSubjectSchema>;

/**
 * Who wrote the record at the source. `verified` means the skill confirmed
 * the author is the subject; `unverified` is the honest state when it could
 * not. Sources may require `verified`.
 */
export const AttributionSchema = z
  .strictObject({
    status: z.enum(['verified', 'unverified']),
    /** The source's ID for the author, such as a Slack user ID */
    authorId: IdentifierSchema.nullable().default(null),
  })
  .superRefine((attribution, ctx) => {
    if (attribution.status === 'verified' && attribution.authorId === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['authorId'],
        message: 'is required when attribution is verified',
      });
    }
  });

/** A JIRA-style ticket key such as `PROJ-123`, uppercased */
const TicketKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9_]*-[1-9]\d*$/, 'must be a ticket key like PROJ-123');

/**
 * What the record mentions, as written at the source. Mentions are not links:
 * they are resolved to PRs and tickets in the work log separately.
 */
export const MentionsSchema = z
  .strictObject({
    tickets: z.array(TicketKeySchema).max(500).default([]),
    pullRequests: z.array(HttpUrlSchema).max(500).default([]),
  })
  .default({ tickets: [], pullRequests: [] });

/**
 * Fields every imported record has, after `schemaVersion` and `type` (which
 * each record schema puts first so stored files read top-down).
 */
const envelopeShape = {
  source: z.enum(IMPORT_SOURCES),
  /** The workspace or account the source ID is unique within */
  sourceAccount: IdentifierSchema,
  /** The item's stable ID within `sourceAccount` */
  sourceId: IdentifierSchema,
  /** Link to the item at the source, when there is one */
  url: HttpUrlSchema.nullable().default(null),
  /** When the event happened (a message was posted) */
  occurredAt: IsoDateTimeSchema,
  /** When the item was last changed at the source (an edit), if ever */
  updatedAt: IsoDateTimeSchema.nullable().default(null),
  /** When the skill captured the item */
  capturedAt: IsoDateTimeSchema,
  subject: ImportSubjectSchema,
  attribution: AttributionSchema,
  mentions: MentionsSchema,
};

/**
 * Message details. Only the subject's own words are stored (in the record
 * body); replies by others are counts, never text or identities.
 */
export const MessageDetailsSchema = z.strictObject({
  /** The channel or conversation the message was posted in */
  container: z.strictObject({
    id: IdentifierSchema,
    name: z.string().max(200).nullable().default(null),
  }),
  /** Set when the message is a reply in a thread: the parent, by reference */
  thread: z
    .strictObject({
      parentId: IdentifierSchema,
      parentUrl: HttpUrlSchema.nullable().default(null),
    })
    .nullable()
    .default(null),
  /** Replies to this message (when it starts a thread) */
  replyCount: z.int().min(0).default(0),
  /** People who replied, as a count */
  replyParticipantCount: z.int().min(0).default(0),
});

/**
 * A message the subject wrote. The message text is the record body.
 */
export const MessageRecordSchema = z.strictObject({
  schemaVersion: z.literal(IMPORT_SCHEMA_VERSION),
  type: z.literal('message'),
  ...envelopeShape,
  message: MessageDetailsSchema,
});
export type MessageRecord = z.infer<typeof MessageRecordSchema>;

const time = (value: string) => new Date(value).getTime();

/**
 * Any imported record. Timestamps must be in order: an edit or a capture
 * cannot precede the event.
 */
export const ImportedRecordSchema = z
  .discriminatedUnion('type', [MessageRecordSchema])
  .superRefine((record, ctx) => {
    if (
      record.updatedAt !== null &&
      time(record.updatedAt) < time(record.occurredAt)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['updatedAt'],
        message: 'must not be earlier than occurredAt',
      });
    }
    if (time(record.capturedAt) < time(record.occurredAt)) {
      ctx.addIssue({
        code: 'custom',
        path: ['capturedAt'],
        message: 'must not be earlier than occurredAt',
      });
    }
  });
export type ImportedRecord = z.infer<typeof ImportedRecordSchema>;

/**
 * The identity an imported record is upserted by. Two records with the same
 * identity are the same item; a later import replaces the earlier record.
 */
export interface ImportedRecordIdentity {
  type: ImportedRecordType;
  source: ImportSource;
  sourceAccount: string;
  sourceId: string;
}

/**
 * Get a record's identity.
 *
 * @param record - A validated imported record
 */
export function getImportedRecordIdentity(
  record: ImportedRecord,
): ImportedRecordIdentity {
  return {
    type: record.type,
    source: record.source,
    sourceAccount: record.sourceAccount,
    sourceId: record.sourceId,
  };
}

/**
 * An unambiguous string for an identity: equal strings mean equal
 * identities, compared exactly (case-sensitive).
 *
 * @param identity - Record identity
 */
export function importedRecordIdentityKey(
  identity: ImportedRecordIdentity,
): string {
  return JSON.stringify([
    identity.type,
    identity.source,
    identity.sourceAccount,
    identity.sourceId,
  ]);
}

/**
 * Imported record file with frontmatter and body content
 */
export interface ImportedRecordFile {
  frontmatter: ImportedRecord;
  body: string;
  filePath: string;
}
