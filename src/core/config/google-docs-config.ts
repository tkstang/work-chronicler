import { dirname } from 'node:path';

import type { ImportFs } from '@core/import/import-fs';
import { type ReaderFs, scanImportedRecords } from '@core/storage/reader';
import { GoogleAccountSchema } from '@wc-types/google-docs';
import { ManagerConfigSchema } from '@wc-types/manager';
import type { z } from 'zod';

import {
  ConfigUpdateError,
  type ConfigUpdateResult,
  updateConfigFile,
} from './config-file';
import { ConfigSchema } from './schema';
import { type SlackSettingsOwner, subjectSectionPath } from './slack-config';

/** Whose Google Docs settings a change is for */
export type GoogleDocsSettingsOwner = SlackSettingsOwner;

export interface GoogleDocsSettingsUpdate {
  /** The profile (or legacy) config file */
  configPath: string;
  owner: GoogleDocsSettingsOwner;
  /** The subject's Google account (any letter case; stored in lower case) */
  account: string;
  /**
   * The subject's work log. With it, the account cannot change while the
   * work log holds Google Docs owned by another account, so two people's
   * Docs are never presented together as the subject's.
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

function subjectLabel(owner: GoogleDocsSettingsOwner): string {
  return owner.kind === 'ic' ? 'this profile' : `report ${owner.reportId}`;
}

function uncheckedOwners(owner: GoogleDocsSettingsOwner, why: string): never {
  throw new ConfigUpdateError(
    `The Google Docs already imported for ${subjectLabel(owner)} could not be checked before changing the account (${why}). The config was not changed.`,
  );
}

/**
 * Refuse `account` while the work log holds Google Docs owned by another
 * account: later imports would add the new account's Docs next to them.
 */
function checkWorkLogOwners(
  owner: GoogleDocsSettingsOwner,
  workLog: string,
  account: string,
  fs?: ReaderFs,
): void {
  let scanned: ReturnType<typeof scanImportedRecords>;
  try {
    scanned = scanImportedRecords(workLog, fs ? { fs } : {});
  } catch (error) {
    uncheckedOwners(
      owner,
      error instanceof Error ? error.message : String(error),
    );
  }
  const unreadable = scanned.skipped.filter((entry) => entry.unreadable);
  if (unreadable.length > 0) {
    uncheckedOwners(
      owner,
      `${unreadable.map((entry) => entry.filePath).join(', ')} could not be read`,
    );
  }
  const others = scanned.records.filter(
    (record) =>
      record.frontmatter.source === 'google-docs' &&
      record.frontmatter.sourceAccount !== account,
  );
  if (others.length === 0) return;
  const directories = [
    ...new Set(others.map((record) => dirname(record.filePath))),
  ];
  throw new ConfigUpdateError(
    `The work log for ${subjectLabel(owner)} holds ${others.length} Google Doc(s) owned by another account, which later imports for ${account} would be mixed with. To change the account, first remove ${directories.join(', ')} (then run \`work-chronicler filter\` again if you use a filtered subset), and configure again. The config was not changed.`,
  );
}

/**
 * Set one subject's Google Docs account in its config file, keeping every
 * other setting, comment and unknown key. See {@link updateConfigFile} for
 * how the file is replaced. Given the work log, the account cannot change
 * while it holds Google Docs owned by another account.
 *
 * @param update - Config file, owner and account
 * @returns Whether the file changed, and warnings
 * @throws {ConfigUpdateError} When the change is refused (nothing written)
 */
export function updateGoogleDocsSettings(
  update: GoogleDocsSettingsUpdate,
): ConfigUpdateResult {
  const parsed = GoogleAccountSchema.safeParse(update.account);
  if (!parsed.success) {
    throw new ConfigUpdateError(
      `${issues(parsed.error).join('; ')}. The config was not changed.`,
    );
  }
  const account = parsed.data;
  const schema =
    update.owner.kind === 'ic' ? ConfigSchema : ManagerConfigSchema;
  return updateConfigFile({
    path: update.configPath,
    fs: update.fs,
    randomId: update.randomId,
    validate: (value) => {
      const result = schema.safeParse(value);
      return result.success ? [] : issues(result.error);
    },
    edit: (doc, current) => {
      const path = subjectSectionPath(update.owner, current, 'googleDocs');
      const parent = path
        .slice(0, -1)
        .reduce<unknown>(
          (node, key) =>
            Array.isArray(node) && typeof key === 'number'
              ? node[key]
              : isPlain(node) && typeof key === 'string'
                ? node[key]
                : undefined,
          current,
        ) as Plain;
      const section = parent.googleDocs;
      if (section !== undefined && !isPlain(section)) {
        throw new ConfigUpdateError(
          'The googleDocs: section is not a mapping; fix the config first. The config was not changed.',
        );
      }
      if (section?.account === account) return current;
      if (update.workLog !== undefined) {
        checkWorkLogOwners(
          update.owner,
          update.workLog,
          account,
          update.readFs,
        );
      }
      if (section === undefined) {
        doc.setIn(path, doc.createNode({ account }));
        parent.googleDocs = { account };
      } else {
        doc.setIn([...path, 'account'], account);
        section.account = account;
      }
      return current;
    },
  });
}
