import type {
  ImportedRecord,
  ImportedRecordType,
  ImportSource,
  ImportSubject,
} from '@wc-types/imported-record';

/**
 * A problem a source rule found, at a frontmatter field. The message is
 * fixed text: it must never include a value from the record.
 */
export interface SourceRuleProblem {
  field: string;
  message: string;
}

/**
 * What a source rule can see besides the record.
 */
export interface SourceRuleContext {
  /** The IC or report the batch is being imported for */
  target: ImportSubject;
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

/**
 * Rules for every accepted source. Source policy such as Slack's privacy and
 * opt-in rules plugs in through `checkRecord`.
 */
export const IMPORT_SOURCE_RULES: Record<ImportSource, ImportSourceRules> = {
  slack: {
    recordTypes: ['message'],
    checkIdentity: checkSlackIdentity,
  },
};

/**
 * Check a record against its source's rules.
 *
 * @param record - A record that passed the common schema
 * @param context - Import target
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
