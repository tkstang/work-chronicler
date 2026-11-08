---
title: Google Docs commands
description: "google-docs configure and google-docs show: the per-profile and per-report Google Docs settings that import enforces."
---

# Google Docs commands

These commands keep the Google Docs settings the Google Docs import skill
(`/work-chronicler-import-google-docs`) uses. The CLI never contacts Google
and never stores Google credentials; the skill reads Drive with `gog`,
read-only, and hands the Docs to `import`. Settings are kept per IC profile, and per report in a manager
profile (pass `--report <id>` there; it is refused in an IC profile).
Without settings, no Google Docs records are imported. See
[Configuration](configuration.md#google-docs) for the field.

| Command                                   | Meaning                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `google-docs configure --account <email>` | Set up Google Docs: the subject's Google account (yours, or the report's), the owner every imported Doc must have. It is stored in lower case. It cannot change while the work log holds Google Docs owned by another account (they would be presented with the new account's as the subject's): remove the `documents/google-docs/` directory the error names first (and run `filter` again if you use a subset). |
| `google-docs show`                        | Print what the import skill uses (read-only).                                                                                                                                                                                                                                                                                                                                                                      |

Both take `--report <id>`, `-c, --config <path>` and `--json`. Configuring
the same account again writes nothing and reports `changed: false`; a
refused change exits with status 1 and, with `--json`, prints
`{ "ok": false, "error": "…" }`. The config is changed the same way as for
the `slack` commands, keeping everything else in it.

## `google-docs show --json`

`google-docs show --json` prints one JSON object:

| Field                    | Meaning                                                                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profile`                | The profile, or `null` with `--config`.                                                                                                                                                                        |
| `mode`                   | `ic` or `manager`.                                                                                                                                                                                             |
| `subject`, `subjectName` | The record subject (`{ kind: ic }` or `{ kind: report, reportId }`) and the report's name.                                                                                                                     |
| `configured`             | Whether Google Docs is set up for the subject. When `false`, nothing can be imported.                                                                                                                          |
| `range`                  | The profile's fetch range, `since` and `until` (`null` means now), as configured: a Doc is imported when its modified time falls inside it (see [Google Docs records](import-records.md#google-docs-records)). |
| `account`                | The account every imported Doc must be owned by, or `null`.                                                                                                                                                    |
| `record`                 | The fields every staged record must carry: `type`, `source`, `sourceAccount`, `subject`, `unverified` `attribution` with no `authorId`, and `document.mimeType`; `null` when not configured.                   |
| `excerptMaxBytes`        | The largest record body, in UTF-8 bytes (16384).                                                                                                                                                               |
| `importCommand`          | The `import` command line for this subject, with `<staging-dir>` to fill in.                                                                                                                                   |
| `workLog`                | Where the records will be stored.                                                                                                                                                                              |

For the skill that uses these settings, see [Import Google Docs](../workflows/import-google-docs.md).
