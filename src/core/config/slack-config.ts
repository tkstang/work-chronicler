import { dirname } from 'node:path';

import type { ImportFs } from '@core/import/import-fs';
import { type ReaderFs, scanImportedRecords } from '@core/storage/reader';
import { ManagerConfigSchema } from '@wc-types/manager';
import {
  ReportSlackChannelSchema,
  SlackChannelSchema,
  SlackUserIdSchema,
  SlackWorkspaceIdSchema,
} from '@wc-types/slack';
import { generateReportId } from '@workspace/report-utils';
import { type Document, isSeq } from 'yaml';
import type { z } from 'zod';

import {
  ConfigUpdateError,
  type ConfigUpdateResult,
  updateConfigFile,
} from './config-file';
import { ConfigSchema } from './schema';

/** Whose Slack settings a change is for */
export type SlackSettingsOwner =
  | { kind: 'ic' }
  | { kind: 'report'; reportId: string };

/** A channel as given on the command line */
export interface SlackChannelInput {
  id: string;
  name: string;
  reason: string;
  /** The explicit opt-in for a private channel */
  private: boolean;
  /**
   * Reports only: the manager confirmed they and the report are both members
   * of the channel. Required for every report channel.
   */
  sharedWithManager?: boolean;
}

/** A change to one subject's Slack settings */
export type SlackSettingsChange =
  | { kind: 'configure'; workspace: string; user: string }
  | { kind: 'add-channel'; channel: SlackChannelInput }
  | { kind: 'remove-channel'; id: string };

export interface SlackSettingsUpdate {
  /** The profile (or legacy) config file */
  configPath: string;
  owner: SlackSettingsOwner;
  change: SlackSettingsChange;
  /**
   * The subject's work log. With it, `configure` refuses a user while the
   * work log holds Slack messages by another user, so two people's messages
   * are never presented together as the subject's.
   */
  workLog?: string;
  fs?: ImportFs;
  /** Work-log reads (tests inject failures) */
  readFs?: ReaderFs;
  randomId?: () => string;
}

type Plain = Record<string, unknown>;

function isPlain(value: unknown): value is Plain {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issues(error: z.ZodError): string[] {
  return error.issues.map((issue) =>
    issue.path.length > 0
      ? `${issue.path.join('.')}: ${issue.message}`
      : issue.message,
  );
}

function subjectLabel(owner: SlackSettingsOwner): string {
  return owner.kind === 'ic' ? 'this profile' : `report ${owner.reportId}`;
}

/** The path of the `slack:` section in the file's plain value */
function slackPath(
  owner: SlackSettingsOwner,
  current: unknown,
): (string | number)[] {
  if (owner.kind === 'ic') return ['slack'];
  const reports = isPlain(current) ? current.reports : undefined;
  const matches = Array.isArray(reports)
    ? reports.flatMap((report, index) =>
        isPlain(report) &&
        typeof report.name === 'string' &&
        generateReportId(report.name) === owner.reportId
          ? [index]
          : [],
      )
    : [];
  if (matches.length !== 1) {
    throw new ConfigUpdateError(
      matches.length === 0
        ? `No report with ID ${owner.reportId} is in the manager profile; see \`reports list\`. The config was not changed.`
        : `More than one report has ID ${owner.reportId}; fix the config first. The config was not changed.`,
    );
  }
  return ['reports', matches[0] as number, 'slack'];
}

function getAt(value: unknown, path: (string | number)[]): unknown {
  let node = value;
  for (const key of path) {
    if (Array.isArray(node) && typeof key === 'number') node = node[key];
    else if (isPlain(node) && typeof key === 'string') node = node[key];
    else return undefined;
  }
  return node;
}

function setAt(value: unknown, path: (string | number)[], next: unknown) {
  const parent = getAt(value, path.slice(0, -1)) as Plain;
  parent[path[path.length - 1] as string] = next;
}

/** A channel entry as written to the file (every setting explicit) */
function channelEntry(owner: SlackSettingsOwner, channel: SlackChannelInput) {
  const entry: Plain = {
    id: channel.id,
    name: channel.name,
    reason: channel.reason,
    private: channel.private,
  };
  if (owner.kind === 'report') entry.sharedWithManager = true;
  return entry;
}

function checkChannel(
  owner: SlackSettingsOwner,
  channel: SlackChannelInput,
): void {
  if (owner.kind === 'ic' && channel.sharedWithManager) {
    throw new ConfigUpdateError(
      'Shared membership is confirmed only for a manager’s report channels. The config was not changed.',
    );
  }
  if (owner.kind === 'report' && !channel.sharedWithManager) {
    throw new ConfigUpdateError(
      `A report channel must be one you (the manager) and report ${owner.reportId} both belong to. Check that, then confirm it with --shared-with-manager. The config was not changed.`,
    );
  }
  const schema =
    owner.kind === 'ic' ? SlackChannelSchema : ReportSlackChannelSchema;
  const parsed = schema.safeParse(channelEntry(owner, channel));
  if (!parsed.success) {
    throw new ConfigUpdateError(
      `The channel was refused (${issues(parsed.error).join('; ')}). The config was not changed.`,
    );
  }
}

function uncheckedAuthors(owner: SlackSettingsOwner, why: string): never {
  throw new ConfigUpdateError(
    `The Slack messages already imported for ${subjectLabel(owner)} could not be checked before changing the user (${why}). The config was not changed.`,
  );
}

/**
 * Refuse `user` while the work log holds Slack messages by anyone else:
 * later imports would add the new user's messages next to them, and readers
 * would present both as the subject's.
 */
function checkWorkLogAuthors(
  owner: SlackSettingsOwner,
  workLog: string,
  user: string,
  fs?: ReaderFs,
): void {
  let scanned: ReturnType<typeof scanImportedRecords>;
  try {
    scanned = scanImportedRecords(workLog, fs ? { fs } : {});
  } catch (error) {
    uncheckedAuthors(
      owner,
      error instanceof Error ? error.message : String(error),
    );
  }
  const unreadable = scanned.skipped.filter((entry) => entry.unreadable);
  if (unreadable.length > 0) {
    uncheckedAuthors(
      owner,
      `${unreadable.map((entry) => entry.filePath).join(', ')} could not be read`,
    );
  }
  const others = scanned.records.filter(
    (record) =>
      record.frontmatter.source === 'slack' &&
      record.frontmatter.attribution.authorId !== user,
  );
  if (others.length === 0) return;
  const authors = [
    ...new Set(
      others.map(
        (record) => record.frontmatter.attribution.authorId ?? 'unknown',
      ),
    ),
  ];
  const directories = [
    ...new Set(others.map((record) => dirname(record.filePath))),
  ];
  throw new ConfigUpdateError(
    `The work log for ${subjectLabel(owner)} holds ${others.length} Slack message(s) by another Slack user (${authors.join(', ')}), which later imports for ${user} would be mixed with. To change the user, first remove ${directories.join(', ')} (then run \`work-chronicler filter\` again if you use a filtered subset), and configure again. The config was not changed.`,
  );
}

/**
 * Apply a change to the plain value and the document alike; returns the
 * value the file must hold afterwards.
 *
 * @param checkUser - Refuses a user `configure` would newly set
 */
function applyChange(
  doc: Document,
  current: unknown,
  owner: SlackSettingsOwner,
  change: SlackSettingsChange,
  checkUser: (user: string) => void,
): unknown {
  const path = slackPath(owner, current);
  const slack = getAt(current, path);
  if (slack !== undefined && !isPlain(slack)) {
    throw new ConfigUpdateError(
      'The slack: section is not a mapping; fix the config first. The config was not changed.',
    );
  }

  if (change.kind === 'configure') {
    for (const [schema, value] of [
      [SlackWorkspaceIdSchema, change.workspace],
      [SlackUserIdSchema, change.user],
    ] as const) {
      const parsed = schema.safeParse(value);
      if (!parsed.success) {
        throw new ConfigUpdateError(
          `${issues(parsed.error).join('; ')}. The config was not changed.`,
        );
      }
    }
    if (slack === undefined || slack.user !== change.user) {
      checkUser(change.user);
    }
    if (slack === undefined) {
      const section = {
        workspace: change.workspace,
        user: change.user,
        channels: [],
      };
      doc.setIn(path, doc.createNode(section));
      setAt(current, path, section);
      return current;
    }
    const channels = Array.isArray(slack.channels) ? slack.channels : [];
    const differs =
      slack.workspace !== change.workspace || slack.user !== change.user;
    if (differs && channels.length > 0) {
      throw new ConfigUpdateError(
        `Slack channels are configured for ${subjectLabel(owner)} under another workspace or user. Remove them first (\`slack channels remove\`), then configure again. The config was not changed.`,
      );
    }
    if (slack.workspace !== change.workspace) {
      doc.setIn([...path, 'workspace'], change.workspace);
      slack.workspace = change.workspace;
    }
    if (slack.user !== change.user) {
      doc.setIn([...path, 'user'], change.user);
      slack.user = change.user;
    }
    return current;
  }

  if (slack === undefined) {
    throw new ConfigUpdateError(
      `Slack is not set up for ${subjectLabel(owner)}; run \`slack configure\` first. The config was not changed.`,
    );
  }
  const channels = slack.channels;
  if (channels !== undefined && !Array.isArray(channels)) {
    throw new ConfigUpdateError(
      'slack.channels is not a list; fix the config first. The config was not changed.',
    );
  }
  const list = (channels ?? []) as unknown[];
  const index = list.findIndex(
    (entry) =>
      isPlain(entry) &&
      entry.id ===
        (change.kind === 'add-channel' ? change.channel.id : change.id),
  );

  if (change.kind === 'remove-channel') {
    if (index === -1) {
      const ids = list.flatMap((entry) =>
        isPlain(entry) && typeof entry.id === 'string' ? [entry.id] : [],
      );
      throw new ConfigUpdateError(
        `Channel ${change.id} is not configured for ${subjectLabel(owner)} (${
          ids.length > 0
            ? `configured channels: ${ids.join(', ')}`
            : 'no channels are configured'
        }). The config was not changed.`,
      );
    }
    doc.deleteIn([...path, 'channels', index]);
    list.splice(index, 1);
    return current;
  }

  checkChannel(owner, change.channel);
  const entry = channelEntry(owner, change.channel);
  if (index !== -1) {
    const existing = list[index] as Plain;
    const same = Object.entries(entry).every(
      ([key, value]) =>
        existing[key] === value ||
        // `private: false` and an omitted `private` mean the same
        (key === 'private' && value === false && existing[key] === undefined),
    );
    if (same) return current;
    throw new ConfigUpdateError(
      `Channel ${change.channel.id} is already configured with other settings; remove it first to change it. The config was not changed.`,
    );
  }
  if (channels === undefined) {
    doc.setIn([...path, 'channels'], doc.createNode([entry]));
    slack.channels = [entry];
  } else {
    // An empty list is written `[]`; give its first entry block style
    const node = doc.getIn([...path, 'channels'], true);
    if (isSeq(node) && node.items.length === 0) node.flow = false;
    doc.addIn([...path, 'channels'], doc.createNode(entry));
    list.push(entry);
  }
  return current;
}

/**
 * Change one subject's Slack settings in its config file, keeping every
 * other setting, comment and unknown key. See {@link updateConfigFile} for
 * how the file is replaced.
 *
 * Rules: channels need `slack configure` first; a report channel must be
 * confirmed as shared by the manager and the report; direct and group
 * messages are never allowed; a `G…` ID needs the private opt-in; the
 * workspace or user cannot change while channels are configured; and, given
 * the work log, a user cannot be configured while it holds Slack messages by
 * another user.
 *
 * @param update - Config file, owner and change
 * @returns Whether the file changed, and warnings
 * @throws {ConfigUpdateError} When the change is refused (nothing written)
 */
export function updateSlackSettings(
  update: SlackSettingsUpdate,
): ConfigUpdateResult {
  const schema =
    update.owner.kind === 'ic' ? ConfigSchema : ManagerConfigSchema;
  return updateConfigFile({
    path: update.configPath,
    fs: update.fs,
    randomId: update.randomId,
    validate: (value) => {
      const parsed = schema.safeParse(value);
      return parsed.success ? [] : issues(parsed.error);
    },
    edit: (doc, current) =>
      applyChange(doc, current, update.owner, update.change, (user) => {
        if (update.workLog !== undefined) {
          checkWorkLogAuthors(
            update.owner,
            update.workLog,
            user,
            update.readFs,
          );
        }
      }),
  });
}
