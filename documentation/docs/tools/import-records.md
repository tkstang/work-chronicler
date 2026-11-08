---
title: Import record format
description: The staged batch, record frontmatter, where records are stored, and the Slack and Google Docs rules that import and validate enforce.
---

# Import record format

A batch for [`import` and `validate`](import.md) is a directory of record files. This page defines what the directory and each record must hold.

## The staged batch

- The directory holds only record files named `*.md`: no subdirectories,
  symlinks, hidden files or other files. A batch holds at most 10,000
  records, each file at most 1 MiB, and its records at most 64 MiB in
  total (each record counted as its stored form plus its text); a larger
  batch is refused (`BATCH_TOO_LARGE`): split it.
- Each file is one record: a `---` line, YAML frontmatter, a closing `---`
  line, then the body (for a message, its text; for a Google Doc, an excerpt
  of its text). The YAML is read strictly:
  one document, no duplicate keys, aliases or tags, and no keys the format
  does not define.
- Every record names the subject it is about, which must be the import's
  target: `{ kind: ic }` in an IC profile, or `{ kind: report, reportId: <id> }`
  matching `--report`.
- File names only identify records in messages. Where a record is stored
  follows its identity (`type`, `source`, `sourceAccount` and `sourceId`;
  see [Where records are stored](#where-records-are-stored)), never its
  staged file name: changing its `sourceId` stores it somewhere else,
  renaming its file does not.

## Record format

Every record shares these frontmatter fields:

| Field           | Meaning                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion` | `1`.                                                                                                                                                                                |
| `type`          | The record type: `message` or `document`.                                                                                                                                           |
| `source`        | Where the record came from: `slack` (messages) or `google-docs` (documents).                                                                                                        |
| `sourceAccount` | The workspace or account the ID belongs to. For Slack, the configured workspace: its team ID or URL label. For Google Docs, the owner's account: the configured one, in lower case. |
| `sourceId`      | The item's stable ID within that account. For Slack, `<channel ID>/<message ts>`. For Google Docs, the Drive file ID.                                                               |
| `url`           | Link to the item, or `null` (the default).                                                                                                                                          |
| `occurredAt`    | When it happened (ISO 8601): a message was posted, or a Doc was last modified.                                                                                                      |
| `updatedAt`     | When it was last edited, or `null` (the default). Not earlier than `occurredAt`. For a Google Doc, its modified time, the same as `occurredAt`.                                     |
| `capturedAt`    | When the skill read it. Not earlier than `occurredAt`.                                                                                                                              |
| `subject`       | Who it is about: `{ kind: ic }` or `{ kind: report, reportId: <id> }`.                                                                                                              |
| `attribution`   | Who wrote it: `status` is `verified` (the skill confirmed the author is the subject; `authorId` required) or `unverified`, with the source's `authorId` when known.                 |
| `mentions`      | `tickets` (keys such as `PROJ-12`, uppercased) and `pullRequests` (URLs) the record mentions. Both default to empty.                                                                |

A `message` record adds a `message` field: `container` (`id` and optional
`name` of the channel or conversation), `thread` (`null`, or the `parentId` and
optional `parentUrl` of the thread it replies in: a reference, never the
parent's text), and `replyCount` and `replyParticipantCount` (counts only;
default `0`). This example uses invented data:

```markdown
---
schemaVersion: 1
type: message
source: slack
sourceAccount: T0EXAMPLE
sourceId: C0EXAMPLE/1767261600.000100
occurredAt: "2026-01-01T10:00:00Z"
capturedAt: "2026-01-05T09:00:00Z"
subject: { kind: ic }
attribution: { status: verified, authorId: U0EXAMPLE }
mentions: { tickets: [BILL-311], pullRequests: [] }
message:
  container: { id: C0EXAMPLE, name: billing-launch }
  replyCount: 3
  replyParticipantCount: 2
---

Usage-based invoices are live for every account (BILL-311).
```

A `document` record adds a `document` field: `title`, `mimeType` (the
source's file type), `createdAt`, `owners` (the owners' account email
addresses as the source lists them; `null` when unknown), `driveId` (the
shared drive holding it, or `null`) and `truncated` (required: whether the
body stops before the end of the Doc). The body is an excerpt of the Doc's
own text, never a summary. This example uses invented data:

```markdown
---
schemaVersion: 1
type: document
source: google-docs
sourceAccount: you@example.com
sourceId: 1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789
url: "https://docs.google.com/document/d/1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789/edit"
occurredAt: "2026-02-10T16:20:00Z"
updatedAt: "2026-02-10T16:20:00Z"
capturedAt: "2026-02-12T09:00:00Z"
subject: { kind: ic }
attribution: { status: unverified, authorId: null }
mentions: { tickets: [BILL-311], pullRequests: [] }
document:
  title: Usage-based invoicing design
  mimeType: application/vnd.google-apps.document
  createdAt: "2025-11-03T10:00:00Z"
  owners: [you@example.com]
  driveId: null
  truncated: false
---

Goals: bill accounts by usage from March (BILL-311).
```

## Where records are stored

A record's identity is its `type`, `source`, `sourceAccount` and `sourceId`.
It is stored at `work-log/messages/<source>/<hash>.md` (a message) or
`work-log/documents/<source>/<hash>.md` (a document), where `<hash>` is
derived from the identity alone. Importing a record with the same identity again replaces the stored
one (upsert); an identical record is left as it is, so repeating an import
changes nothing. Records that are not in the batch are never removed.
`<hash>` is in lower case; a file whose name differs only in letter case
(`ABC….md`, on a volume that ignores case) is not read as a record, and
`import` refuses to store over it (`IDENTITY_CONFLICT`) until it is renamed.

## Slack records

`import` and `validate` read the target's Slack settings (see
[Slack commands](slack.md)) and refuse a Slack record (`SOURCE_RULE`) when:

- Slack is not set up for the IC profile or report: without settings, no
  Slack records are imported;
- `sourceAccount` is not the configured workspace;
- `occurredAt` is not when the message was posted: the time of the ts in
  `sourceId`, to the second (`1767261600.000100` is
  `2026-01-01T10:00:00Z`);
- `attribution` is `unverified`, or `authorId` is not the configured user
  (only the subject's own messages are imported);
- the channel (`message.container.id`) is not in the configured channels,
  is a direct message (`D…`), or, for a report, is not confirmed as one the
  manager and the report both belong to;
- `message.container.name` is not `null` or the channel's configured name
  (use the `name` that `slack show` lists);
- `message.thread.parentId` is not a message ts, or `parentUrl` (and the
  record's own `url`) is anything but the bare Slack permalink of that
  message (`https://<host>.slack.com/archives/<channel>/p<ts>`, with at
  most `thread_ts` and `cid` in the query). For a workspace configured by
  its URL label (`example`), the host must be that workspace's
  (`example.slack.com`, or `example.enterprise.slack.com` in an Enterprise
  Grid org), so in a Grid org a permalink on another workspace's host
  (`team-a.slack.com`) is refused: configure the team or `E…` org ID when a
  Slack tool shows it (see [Configuration](configuration.md#slack)). For a team
  ID, any `slack.com` host is accepted;
- a reply in a thread carries reply counts, or `replyParticipantCount`
  exceeds `replyCount`;
- the body (the message text) still holds raw Slack markup that can carry
  another person's name or label text: a user mention (`<@U…>`, `<@W…|name>`),
  a channel link (`<#C…|name>`), a special mention (`<!here>`,
  `<!subteam^…|@team>`) or a link in markup (`<https://…>`,
  `<https://…|label>`). The import skill writes these as `@someone`,
  `#channel`, `@here` and the bare URL. A line starting with `>` is ordinary
  text and is accepted.

Reply bodies, the parent's text and lists of participants cannot be written
at all: the format has no field for them, so a record that carries one is
rejected (`SCHEMA_INVALID`).

## Google Docs records

`import` and `validate` read the target's Google Docs settings (see
[Google Docs commands](google-docs.md)) and the range, and refuse a Google Docs record
(`SOURCE_RULE`) when:

- Google Docs is not set up for the IC profile or report: without settings,
  no Google Docs records are imported;
- `sourceAccount` is not the configured account (in lower case), or
  `sourceId` is not a Drive file ID;
- `document.owners` is missing (`null`: no owner evidence), empty (a Doc with
  no individual owner), or lists any account but the configured one;
  `document.driveId` is set (a shared-drive Doc, which has no individual
  owner);
- `document.mimeType` is not `application/vnd.google-apps.document`: other
  Drive files are never imported;
- `attribution` is `verified`, or has an `authorId`: owning a Doc is not
  writing it, so Docs are always `unverified`;
- the modified time (`occurredAt`, which `updatedAt` must equal) is outside
  the range, or `document.createdAt` is later than it;
- the body is longer than 16 KiB (16,384 bytes of UTF-8). There is no
  uncapped mode: cut the excerpt to fit and set `document.truncated: true`;
- `url` is anything but the Doc's own link
  (`https://docs.google.com/document/d/<sourceId>`, optionally with `/edit`
  or `/view` and a `usp` query).

The range is the profile's `fetch` range (`google-docs show` prints it),
or the `--since` / `--until` given for the batch, each replacing its bound.
A Doc is in range when its modified time falls inside it, inclusive, in UTC:
a date-only `since` starts at 00:00:00Z and a date-only `until` ends at the
end of that day, so a Doc modified at 23:59 UTC on the `until` day is
included. A Doc created before the range but modified inside it is in range.
`fetch.until: null` leaves the range open-ended. A configured range that
cannot be read is refused (`RANGE_INVALID`) only for a batch with Google
Docs records.

The CLI checks this staged metadata against the settings; it does not
authenticate it with Google. The import skill reads Drive and must stage
only what Drive reports.
