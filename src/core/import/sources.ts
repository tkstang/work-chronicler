import {
  GOOGLE_DOC_MIME_TYPE,
  GoogleAccountSchema,
  type GoogleDocsSettings,
  MAX_DOCUMENT_EXCERPT_BYTES,
} from '@wc-types/google-docs';
import type {
  ImportedRecord,
  ImportedRecordType,
  ImportSource,
  ImportSubject,
} from '@wc-types/imported-record';
import { SlackWorkspaceIdSchema, type SlackSettings } from '@wc-types/slack';

import type { ImportRange } from './range';

/**
 * A problem a source rule found, at a frontmatter field. The message is
 * fixed text: it must never include a value from the record.
 */
export interface SourceRuleProblem {
  field: string;
  message: string;
}

/**
 * Per-source settings of the subject a batch is imported for, from its
 * config. `null` means the source is not set up for that subject, and its
 * records are refused.
 */
export interface ImportSourceSettings {
  slack: SlackSettings | null;
  /** Optional for callers that predate it; absent means not set up */
  googleDocs?: GoogleDocsSettings | null;
}

/** No source set up: every imported record is refused */
export const NO_SOURCE_SETTINGS: ImportSourceSettings = {
  slack: null,
  googleDocs: null,
};

/**
 * What a source rule can see besides the record.
 */
export interface SourceRuleContext {
  /** The IC or report the batch is being imported for */
  target: ImportSubject;
  /** That subject's source settings */
  settings: ImportSourceSettings;
  /**
   * The range documents must fall in, by modified time (inclusive). Without
   * one, documents are refused. Messages have no range check.
   */
  range?: ImportRange | null;
}

/**
 * Per-source rules. Every record is checked against its source's rules after
 * the common schema passes.
 */
export interface ImportSourceRules {
  /** Record types this source may produce */
  recordTypes: readonly ImportedRecordType[];
  /**
   * Check the identity format (`sourceAccount`, `sourceId`) and that the
   * record's other references agree with it.
   */
  checkIdentity: (record: ImportedRecord) => SourceRuleProblem[];
  /**
   * Source-specific policy (opt-in, privacy). Optional; a source without it
   * relies on the common schema. `body` is the record's body text (for a
   * message, its text).
   */
  checkRecord?: (
    record: ImportedRecord,
    context: SourceRuleContext,
    body: string,
  ) => SourceRuleProblem[];
}

const SLACK_TS = /^\d{1,12}\.\d{1,9}$/;
const SLACK_MESSAGE_ID = /^([A-Z][A-Z0-9]{1,31})\/(\d{1,12}\.\d{1,9})$/;

/**
 * How far `occurredAt` may be from the message ts: the import skill writes
 * the ts's whole seconds (`1767261600.000100` is `2026-01-01T10:00:00Z`), so
 * a time truncated or rounded to the second is accepted.
 */
const OCCURRED_AT_TOLERANCE_MS = 1000;

/**
 * Slack identity: `sourceAccount` is the workspace (its team ID or URL
 * label, as configured) and `sourceId`
 * is `<channel ID>/<message ts>`, which Slack keeps stable for a message.
 * The record's `message.container.id` must be that channel, and its
 * `occurredAt` the time of that ts, to the second.
 */
function checkSlackIdentity(record: ImportedRecord): SourceRuleProblem[] {
  if (record.type !== 'message') return [];
  const problems: SourceRuleProblem[] = [];
  if (!SlackWorkspaceIdSchema.safeParse(record.sourceAccount).success) {
    problems.push({
      field: 'sourceAccount',
      message: 'must be a Slack workspace ID or workspace URL label',
    });
  }
  const match = SLACK_MESSAGE_ID.exec(record.sourceId);
  if (!match) {
    problems.push({
      field: 'sourceId',
      message: 'must be <channel ID>/<message ts> for Slack',
    });
  } else {
    if (record.message.container.id !== match[1]) {
      problems.push({
        field: 'message.container.id',
        message: 'must be the channel in sourceId',
      });
    }
    const postedMs = Number(match[2]) * 1000;
    const occurredMs = Date.parse(record.occurredAt);
    if (!(Math.abs(occurredMs - postedMs) < OCCURRED_AT_TOLERANCE_MS)) {
      problems.push({
        field: 'occurredAt',
        message:
          'must be when the message was posted: the time of the ts in sourceId, to the second',
      });
    }
  }
  return problems;
}

/** A Slack permalink: a message, by channel and ts, and nothing else */
interface SlackPermalink {
  /** Host name, in lower case (`example.slack.com`) */
  host: string;
  channel: string;
  ts: string;
  threadTs: string | null;
}

/**
 * Parse a Slack message permalink
 * (`https://<workspace>.slack.com/archives/<channel>/p<ts digits>`, with
 * at most `thread_ts` and `cid` in the query). Anything else, including a
 * URL that could carry text, is refused.
 */
function parseSlackPermalink(url: string): SlackPermalink | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname;
  if (
    parsed.protocol !== 'https:' ||
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.port !== '' ||
    parsed.hash !== '' ||
    !(host === 'slack.com' || host.endsWith('.slack.com'))
  ) {
    return null;
  }
  const path = /^\/archives\/([A-Z][A-Z0-9]{1,31})\/p(\d{7,21})$/.exec(
    parsed.pathname,
  );
  if (!path) return null;
  const channel = path[1] as string;
  const digits = path[2] as string;
  let threadTs: string | null = null;
  const seen = new Set<string>();
  for (const [key, value] of parsed.searchParams) {
    if (seen.has(key)) return null;
    seen.add(key);
    if (key === 'thread_ts' && SLACK_TS.test(value)) threadTs = value;
    else if (key === 'cid' && value === channel) continue;
    else return null;
  }
  return {
    host,
    channel,
    ts: `${digits.slice(0, -6)}.${digits.slice(-6)}`,
    threadTs,
  };
}

/**
 * Whether a permalink's host belongs to the configured workspace. A
 * workspace configured by its URL label (`example`) has its messages at
 * `example.slack.com`, or `example.enterprise.slack.com` in an Enterprise
 * Grid org. A team ID (`T…`, `E…`) does not name a host, so any Slack host
 * is accepted for it.
 */
function onConfiguredWorkspace(host: string, workspace: string): boolean {
  if (/^[TE][A-Z0-9]/.test(workspace)) return true;
  return (
    host === `${workspace}.slack.com` ||
    host === `${workspace}.enterprise.slack.com`
  );
}

/**
 * Raw Slack markup that can carry another person's identity or label text:
 * user mentions (`<@U…>`, `<@W…|name>`), channel links (`<#C…|name>`),
 * special mentions (`<!here>`, `<!subteam^S…|@team>`, `<!date^…|text>`) and
 * links (`<https://…|label>`, `<https://…>`, `<mailto:…|label>`, `<tel:…>`).
 * Other `<!…>` and `<word:…>` text (`<!DOCTYPE html>`, `<std::vector>`) is
 * ordinary text. The import skill rewrites these
 * (`@someone`, `#channel`, the bare URL) before staging; a body that still
 * holds one was not rewritten. A `>` quote line is ordinary text here.
 */
const SLACK_MARKUP = [
  /<@[UW][A-Z0-9]*(?:\|[^>]*)?>/,
  /<#[A-Z0-9]+(?:\|[^>]*)?>/,
  /<!(?:here|channel|everyone)(?:\|[^>]*)?>/i,
  /<!(?:subteam|date)\^[^>]*>/i,
  /<(?:https?|ftp|mailto|tel|sms|slack):[^\s|>]*(?:\|[^>]*)?>/i,
];

/**
 * Slack policy. A Slack record is accepted only when Slack is set up for the
 * subject and the record is the subject's own message, verified, from one of
 * the subject's configured channels (for a report, one the manager confirmed
 * they share), never a direct message, with a parent-thread reference that
 * is only an ID or permalink. Reply bodies and participant lists cannot be
 * expressed at all: the record schema is strict and holds reply counts only.
 */
function checkSlackRecord(
  record: ImportedRecord,
  context: SourceRuleContext,
  body: string,
): SourceRuleProblem[] {
  if (record.type !== 'message') return [];
  const settings = context.settings.slack;
  if (!settings) {
    return [
      {
        field: 'source',
        message:
          context.target.kind === 'ic'
            ? 'Slack is not set up for this profile, so no Slack records are imported'
            : 'Slack is not set up for this report, so no Slack records are imported',
      },
    ];
  }

  const problems: SourceRuleProblem[] = [];
  const problem = (field: string, message: string) =>
    problems.push({ field, message });

  if (record.sourceAccount !== settings.workspace) {
    problem('sourceAccount', 'must be the configured Slack workspace');
  }
  if (record.attribution.status !== 'verified') {
    problem(
      'attribution.status',
      'Slack records need attribution verified as the configured user',
    );
  } else if (record.attribution.authorId !== settings.user) {
    problem(
      'attribution.authorId',
      'must be the configured Slack user (only the subject’s own messages are imported)',
    );
  }

  const { container, thread } = record.message;
  const channel = settings.channels.find((c) => c.id === container.id);
  if (container.id.startsWith('D')) {
    problem('message.container.id', 'direct messages are never imported');
  } else if (!channel) {
    problem(
      'message.container.id',
      'channel is not in the configured Slack channels for this subject',
    );
  } else if (
    context.target.kind === 'report' &&
    channel.sharedWithManager !== true
  ) {
    problem(
      'message.container.id',
      'channel is not confirmed as one the manager and the report both belong to',
    );
  }
  // The stored label must be the configured name (or none), so no other
  // text can ride along under the channel's name
  if (channel && container.name !== null && container.name !== channel.name) {
    problem(
      'message.container.name',
      'must be the configured channel name, or null',
    );
  }

  const ts = SLACK_MESSAGE_ID.exec(record.sourceId)?.[2] ?? null;
  if (record.url !== null) {
    const link = parseSlackPermalink(record.url);
    if (
      !link ||
      link.channel !== container.id ||
      link.ts !== ts ||
      (link.threadTs !== null && link.threadTs !== (thread?.parentId ?? null))
    ) {
      problem('url', 'must be the Slack permalink of this message');
    } else if (!onConfiguredWorkspace(link.host, settings.workspace)) {
      problem('url', 'must be a permalink on the configured Slack workspace');
    }
  }
  if (thread) {
    if (!SLACK_TS.test(thread.parentId)) {
      problem(
        'message.thread.parentId',
        'must be the parent message ts (an ID, never text)',
      );
    } else if (thread.parentId === ts) {
      problem(
        'message.thread',
        'a message that starts a thread has no parent; set thread to null',
      );
    }
    if (thread.parentUrl !== null) {
      const link = parseSlackPermalink(thread.parentUrl);
      if (
        !link ||
        link.channel !== container.id ||
        link.ts !== thread.parentId
      ) {
        problem(
          'message.thread.parentUrl',
          'must be the Slack permalink of the parent message, with nothing else',
        );
      } else if (!onConfiguredWorkspace(link.host, settings.workspace)) {
        problem(
          'message.thread.parentUrl',
          'must be a permalink on the configured Slack workspace',
        );
      }
    }
    if (
      record.message.replyCount > 0 ||
      record.message.replyParticipantCount > 0
    ) {
      problem(
        'message.replyCount',
        'a reply in a thread has no replies of its own',
      );
    }
  }
  if (record.message.replyParticipantCount > record.message.replyCount) {
    problem('message.replyParticipantCount', 'cannot exceed replyCount');
  }
  if (SLACK_MARKUP.some((markup) => markup.test(body))) {
    problem(
      'body',
      'holds raw Slack markup (a user, channel or special mention, or a <link|label>); rewrite it as the import skill describes',
    );
  }
  return problems;
}

/** A Drive file ID: letters, digits, `-` and `_` */
const DRIVE_FILE_ID = /^[A-Za-z0-9_-]{10,200}$/;

/**
 * A Google Doc's own link, as Drive gives it
 * (`https://docs.google.com/document/d/<id>/edit?usp=drivesdk`), or the
 * same without `/edit` or its query. Nothing else can ride along.
 */
function isGoogleDocUrl(url: string, id: string): boolean {
  const match =
    /^https:\/\/docs\.google\.com\/document\/d\/([A-Za-z0-9_-]+)(?:\/(?:edit|view))?(?:\?usp=[a-z_]{1,40})?$/.exec(
      url,
    );
  return match?.[1] === id;
}

/**
 * Google Docs identity: `sourceAccount` is the owner's account (the
 * configured one, in lower case) and `sourceId` the Drive file ID. The
 * envelope dates a Doc by its modified time: `occurredAt` and `updatedAt`
 * are both that time, and the created time (in `document:`) cannot be later.
 */
function checkGoogleDocsIdentity(record: ImportedRecord): SourceRuleProblem[] {
  if (record.type !== 'document') return [];
  const problems: SourceRuleProblem[] = [];
  const account = GoogleAccountSchema.safeParse(record.sourceAccount);
  if (!account.success || account.data !== record.sourceAccount) {
    problems.push({
      field: 'sourceAccount',
      message:
        'must be the owner’s Google account email address, in lower case',
    });
  }
  if (!DRIVE_FILE_ID.test(record.sourceId)) {
    problems.push({
      field: 'sourceId',
      message: 'must be the Drive file ID for Google Docs',
    });
  } else if (
    record.url !== null &&
    !isGoogleDocUrl(record.url, record.sourceId)
  ) {
    problems.push({
      field: 'url',
      message: 'must be the Google Docs link of this Doc',
    });
  }
  if (record.updatedAt !== record.occurredAt) {
    problems.push({
      field: 'updatedAt',
      message:
        'must be the Doc’s modified time, the same as occurredAt, for Google Docs',
    });
  }
  if (Date.parse(record.document.createdAt) > Date.parse(record.occurredAt)) {
    problems.push({
      field: 'document.createdAt',
      message: 'must not be later than the modified time (occurredAt)',
    });
  }
  return problems;
}

/**
 * Google Docs policy. A record is accepted only when Google Docs is set up
 * for the subject and the record is a Google Doc (not another Drive file)
 * owned by the configured account alone, outside any shared drive, with
 * owner evidence; modified inside the import range; attributed
 * `unverified` with no author (owning a Doc is not writing it); and with a
 * body no longer than the excerpt cap. The CLI checks this staged metadata
 * against the settings; it does not authenticate it with Drive.
 */
function checkGoogleDocsRecord(
  record: ImportedRecord,
  context: SourceRuleContext,
  body: string,
): SourceRuleProblem[] {
  if (record.type !== 'document') return [];
  const settings = context.settings.googleDocs ?? null;
  if (!settings) {
    return [
      {
        field: 'source',
        message:
          context.target.kind === 'ic'
            ? 'Google Docs is not set up for this profile, so no Google Docs records are imported'
            : 'Google Docs is not set up for this report, so no Google Docs records are imported',
      },
    ];
  }

  const problems: SourceRuleProblem[] = [];
  const problem = (field: string, message: string) =>
    problems.push({ field, message });
  const { document } = record;

  if (record.sourceAccount !== settings.account) {
    problem('sourceAccount', 'must be the configured Google account');
  }
  if (record.attribution.status !== 'unverified') {
    problem(
      'attribution.status',
      'must be unverified for Google Docs: owning a Doc is not writing it',
    );
  }
  if (record.attribution.authorId !== null) {
    problem(
      'attribution.authorId',
      'must be null for Google Docs: ownership names no author',
    );
  }
  if (document.mimeType !== GOOGLE_DOC_MIME_TYPE) {
    problem(
      'document.mimeType',
      'is not a Google Doc; other Drive files are never imported',
    );
  }
  if (document.driveId !== null) {
    problem(
      'document.driveId',
      'the Doc is in a shared drive, which has no individual owner',
    );
  }
  if (document.owners === null) {
    problem(
      'document.owners',
      'owner evidence is missing; list the Doc’s owners as Drive gives them',
    );
  } else if (document.owners.length === 0) {
    problem('document.owners', 'the Doc has no individual owner');
  } else if (
    document.owners.some((owner) => owner.toLowerCase() !== settings.account)
  ) {
    problem(
      'document.owners',
      'the Doc is not owned by the configured Google account (only the subject’s own Docs are imported)',
    );
  }

  const range = context.range ?? null;
  const modified = Date.parse(record.occurredAt);
  if (!range) {
    problem(
      'occurredAt',
      'no import range was given, so no Google Docs records are imported',
    );
  } else if (
    modified < range.since.getTime() ||
    (range.until !== null && modified > range.until.getTime())
  ) {
    problem(
      'occurredAt',
      'the Doc’s modified time is outside the import range',
    );
  }

  if (Buffer.byteLength(body, 'utf-8') > MAX_DOCUMENT_EXCERPT_BYTES) {
    problem(
      'body',
      `the excerpt is longer than ${MAX_DOCUMENT_EXCERPT_BYTES} bytes (UTF-8); cut it to fit and set document.truncated to true`,
    );
  }
  return problems;
}

/**
 * Rules for every accepted source. Source policy such as Slack's privacy and
 * opt-in rules plugs in through `checkRecord`.
 */
export const IMPORT_SOURCE_RULES: Record<ImportSource, ImportSourceRules> = {
  slack: {
    recordTypes: ['message'],
    checkIdentity: checkSlackIdentity,
    checkRecord: checkSlackRecord,
  },
  'google-docs': {
    recordTypes: ['document'],
    checkIdentity: checkGoogleDocsIdentity,
    checkRecord: checkGoogleDocsRecord,
  },
};

/**
 * Check a record against its source's rules.
 *
 * @param record - A record that passed the common schema
 * @param context - Import target and its source settings
 * @param body - The record's body text
 * @returns Problems; empty when the record is acceptable
 */
export function checkSourceRules(
  record: ImportedRecord,
  context: SourceRuleContext,
  body = '',
): SourceRuleProblem[] {
  const rules = IMPORT_SOURCE_RULES[record.source];
  if (!rules.recordTypes.includes(record.type)) {
    return [{ field: 'type', message: 'is not produced by this source' }];
  }
  return [
    ...rules.checkIdentity(record),
    ...(rules.checkRecord?.(record, context, body) ?? []),
  ];
}
