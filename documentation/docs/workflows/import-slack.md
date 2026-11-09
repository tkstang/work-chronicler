---
title: Import Slack messages
description: Choose Slack channels with the setup skill, then import your own messages as supplementary evidence, in an IC profile or for a report.
---

# Import Slack messages

**Skills**: `/work-chronicler-setup-slack`, then `/work-chronicler-import-slack`

The CLI never contacts Slack. These skills read Slack through your
assistant's Slack connector, read-only: they never post, react or change
anything there. The CLI stores the settings and checks every record on import
(see [Slack commands](../tools/slack.md) and [Slack records](../tools/import-records.md#slack-records)).

```mermaid
flowchart TD
  accTitle: Slack import workflow
  accDescr: The setup skill records the workspace, the subject's user ID and the chosen channels with the slack commands. The import skill reads slack show, then works in batches of a few hundred records, each in a new staging directory: it searches day by day, holds back secrets, writes records, runs validate and import, and deletes the directory, until every kept message is imported or a batch keeps failing. An IC profile runs link after a complete import.
  subgraph SETUP["setup-slack skill: once per IC profile or report"]
    A1["Read slack show --json; find the workspace and the subject's Slack user ID"] --> A2["slack configure"]
    A2 --> A3["List public channels (IC profile, on request: also the ones you posted in); private ones only on opt-in; never DMs"]
    A3 --> A4["Manager profile: confirm the report is a member"]
    A4 --> A5["slack channels add, with a one-line reason per channel"]
  end
  subgraph IMPORT["import-slack skill: whenever you want newer messages"]
    B1["Read slack show --json; ask about private channels"] --> B2["Start a batch of about 300 records in a new staging directory"]
    B2 --> B3["Search one day at a time for the subject's messages; keep those in importable channels"]
    B3 --> B4["Check each result; hold back any message holding a secret"]
    B4 --> B5["Write one record per kept message"]
    B5 --> B6["validate, then import (wait and retry on IMPORT_IN_PROGRESS)"]
    B6 --> B7["Delete the batch's staging directory"]
    B6 -->|"a batch keeps failing: stop"| B7
    B7 -->|"days or kept messages left"| B2
    B7 -->|"all imported (IC profile: run link)"| B8["Report counts only"]
    B7 -->|"import stopped"| B8
  end
  A5 --> B1
  SL[("Slack, read through the assistant's connector")] -.-> A3
  SL -.-> B3
```

**Setup** (`/work-chronicler-setup-slack`, once per IC profile or report):

1. Finds the workspace (its team ID if a Slack tool shows one, otherwise its
   URL label from a permalink, such as `example` for `example.slack.com`)
   and the subject's Slack user ID, and runs `slack configure`.
2. Lists your public channels and asks which hold review-relevant work.
   If you ask for the channels you posted in, it finds them by searching
   your own messages (the channel list leaves out archived channels and
   ones you left). Private channels are offered only if you opt in; direct
   messages and group DMs never are.
3. In a manager profile, offers only channels you share with the report: it
   checks the report is a member before passing `--shared-with-manager`.
4. Records a one-line reason per channel with `slack channels add`.

**Import** (`/work-chronicler-import-slack`):

1. Reads `slack show --json` and stops if Slack is not set up.
2. Searches one day at a time for messages the subject wrote in the
   profile's fetch range (private channels only with your consent, each
   searched on its own unless you allow a search of all of them), without
   reading threads or other people's replies, and keeps only those from
   importable channels. A day with more results than one Slack search
   returns (400) is searched again channel by channel.
3. Writes one record per message (the subject's own text; a reply keeps only
   its parent's ID and link) in batches of a few hundred, each in a new
   temporary staging directory: it runs `validate`, then `import`, and
   deletes the directory before the next batch. If a batch keeps failing,
   it stops and reports the days it did not import. A message holding a
   password, key, token or other secret is held back and counted, not
   staged in this run. An earlier import may already have stored such a
   message: an import never removes records.
4. Reports counts only. Running it again updates the same records and never
   duplicates them.

## For a report

```
/work-chronicler-setup-slack alice-smith
/work-chronicler-import-slack alice-smith
```

Only channels you and the report both belong to are used, and records go to
`reports/alice-smith/work-log/messages/`.

Slack import is opt-in per report: a report without Slack settings
contributes no Slack records. Only channels that you (the manager) and the
report both belong to may be used. The CLI cannot see Slack, so the setup
skill (`/work-chronicler-setup-slack`) checks membership through your Slack
connector, and you confirm it for each channel with `--shared-with-manager`;
the CLI refuses a report channel without that confirmation, and `import`
refuses records from a channel that lacks it. `/work-chronicler-import-slack`
then imports the report's own messages from those channels. Run both skills
with the report ID, for example `/work-chronicler-setup-slack alice-smith`.

```bash
work-chronicler slack configure --report alice-smith \
  --workspace T0EXAMPLE --user U0EXAMPLE2
work-chronicler slack channels add C0EXAMPLE --report alice-smith \
  --name billing-launch --reason "Launch coordination" --shared-with-manager
work-chronicler slack show --report alice-smith --json
```

The same rules as for an IC apply: only the report's own messages, public
channels unless `--private` opts one in, never direct messages. See
[Slack commands](../tools/slack.md).

## Settings reference

- [Slack commands](../tools/slack.md): `slack configure`, `slack channels` and `slack show`.
- [Slack configuration](../tools/configuration.md#slack): the `slack` fields in `config.yaml`.
- [Slack records](../tools/import-records.md#slack-records): what `import` refuses.
