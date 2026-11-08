import type {
  ImportedRecord,
  ImportedRecordType,
  ImportSource,
  ImportSubject,
} from '@wc-types/imported-record';
import type { SlackSettings } from '@wc-types/slack';

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
}

/** No source set up: every imported record is refused */
export const NO_SOURCE_SETTINGS: ImportSourceSettings = { slack: null };

/**
 * What a source rule can see besides the record.
 */
export interface SourceRuleContext {
  /** The IC or report the batch is being imported for */
  target: ImportSubject;
  /** That subject's source settings */
  settings: ImportSourceSettings;
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
   * relies on the common schema.
   */
  checkRecord?: (
    record: ImportedRecord,
    context: SourceRuleContext,
  ) => SourceRuleProblem[];
}

const SLACK_ID = /^[A-Z][A-Z0-9]{1,31}$/;
const SLACK_TS = /^\d{1,12}\.\d{1,9}$/;
const SLACK_MESSAGE_ID = /^([A-Z][A-Z0-9]{1,31})\/(\d{1,12}\.\d{1,9})$/;

/**
 * Slack identity: `sourceAccount` is the workspace (team) ID and `sourceId`
 * is `<channel ID>/<message ts>`, which Slack keeps stable for a message.
 * The record's `message.container.id` must be that channel.
 */
function checkSlackIdentity(record: ImportedRecord): SourceRuleProblem[] {
  const problems: SourceRuleProblem[] = [];
  if (!SLACK_ID.test(record.sourceAccount)) {
    problems.push({
      field: 'sourceAccount',
      message: 'must be a Slack workspace ID',
    });
  }
  const match = SLACK_MESSAGE_ID.exec(record.sourceId);
  if (!match) {
    problems.push({
      field: 'sourceId',
      message: 'must be <channel ID>/<message ts> for Slack',
    });
  } else if (record.message.container.id !== match[1]) {
    problems.push({
      field: 'message.container.id',
      message: 'must be the channel in sourceId',
    });
  }
  return problems;
}

/** A Slack permalink: a message, by channel and ts, and nothing else */
interface SlackPermalink {
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
    channel,
    ts: `${digits.slice(0, -6)}.${digits.slice(-6)}`,
    threadTs,
  };
}

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
): SourceRuleProblem[] {
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
  if (container.name !== null && !/^[^\s\p{C}]{1,80}$/u.test(container.name)) {
    problem('message.container.name', 'must be a Slack channel name');
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
};

/**
 * Check a record against its source's rules.
 *
 * @param record - A record that passed the common schema
 * @param context - Import target and its source settings
 * @returns Problems; empty when the record is acceptable
 */
export function checkSourceRules(
  record: ImportedRecord,
  context: SourceRuleContext,
): SourceRuleProblem[] {
  const rules = IMPORT_SOURCE_RULES[record.source];
  if (!rules.recordTypes.includes(record.type)) {
    return [{ field: 'type', message: 'is not produced by this source' }];
  }
  return [
    ...rules.checkIdentity(record),
    ...(rules.checkRecord?.(record, context) ?? []),
  ];
}
