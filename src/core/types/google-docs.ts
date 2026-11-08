import { z } from 'zod';

/**
 * Google Docs settings for one subject: an IC profile (`googleDocs:` at the
 * top of the profile config) or one report in a manager profile
 * (`googleDocs:` under the report). The CLI never talks to Google and never
 * stores Google credentials: these settings name the account whose Docs an
 * import skill may collect, and `import` checks every Google Docs record
 * against them.
 *
 * `account` is the subject's Google account, the owner a Doc must have. It
 * is not necessarily the account the skill reads Drive as: in manager mode
 * the skill reads as the manager and keeps only Docs the report owns.
 *
 * An absent `googleDocs:` section means Google Docs is not set up for that
 * subject, and `import` accepts no Google Docs records for it.
 */

/** The MIME type of a Google Doc; other Drive files are never imported */
export const GOOGLE_DOC_MIME_TYPE = 'application/vnd.google-apps.document';

/**
 * Largest Google Docs record body: an excerpt of the Doc's own text, in
 * UTF-8 bytes. There is no uncapped mode; a longer Doc is cut to fit and
 * marked `document.truncated: true`.
 */
export const MAX_DOCUMENT_EXCERPT_BYTES = 16 * 1024;

/**
 * A Google account's email address, stored in lower case (records'
 * `sourceAccount` must be that lower-case form).
 */
export const GoogleAccountSchema = z
  .email('must be a Google account email address')
  .max(320)
  .transform((account) => account.toLowerCase());

/** `googleDocs:` in an IC profile or under a report */
export const GoogleDocsConfigSchema = z.object({
  /** The subject's Google account: the owner every imported Doc must have */
  account: GoogleAccountSchema,
});
export type GoogleDocsConfig = z.infer<typeof GoogleDocsConfigSchema>;

/** Resolved Google Docs settings for the subject an import is for */
export interface GoogleDocsSettings {
  account: string;
}
