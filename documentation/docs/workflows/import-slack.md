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
  accDescr: The setup skill records the workspace, the subject's user ID and the chosen channels with the slack commands. The import skill reads slack show, searches those channels for the subject's own messages, stages one record per message, then runs validate and import and deletes the staging directory.
  subgraph SETUP["setup-slack skill: once per IC profile or report"]
    A1["Read slack show --json; find the workspace and the subject's Slack user ID"] --> A2["slack configure"]
    A2 --> A3["List public channels; private ones only on opt-in; never DMs"]
    A3 --> A4["Manager profile: confirm the report is a member"]
    A4 --> A5["slack channels add, with a one-line reason per channel"]
  end
  subgraph IMPORT["import-slack skill: whenever you want newer messages"]
    B1["Read slack show --json"] --> B2["Search each importable channel (private ones only with consent) for the subject's messages in the fetch range"]
    B2 --> B3["Write one record per kept message to a temporary staging directory"]
    B3 --> B4["validate"]
    B4 --> B5["import"]
    B5 --> B6["Delete the staging directory; report counts only"]
  end
  A5 --> B1
  SL[("Slack, read through the assistant's connector")] -.-> A3
  SL -.-> B2
```

**Setup** (`/work-chronicler-setup-slack`, once per IC profile or report):

1. Finds the workspace (its team ID if a Slack tool shows one, otherwise its
   URL label from a permalink, such as `example` for `example.slack.com`)
   and the subject's Slack user ID, and runs `slack configure`.
2. Lists your public channels and asks which hold review-relevant work.
   Private channels are offered only if you opt in; direct messages and
   group DMs never are.
3. In a manager profile, offers only channels you share with the report: it
   checks the report is a member before passing `--shared-with-manager`.
4. Records a one-line reason per channel with `slack channels add`.

**Import** (`/work-chronicler-import-slack`):

1. Reads `slack show --json` and stops if Slack is not set up.
2. Searches each importable channel for messages the subject wrote in the
   profile's fetch range (private channels only with your consent), without
   reading threads or other people's replies.
3. Writes one record per message (the subject's own text; a reply keeps only
   its parent's ID and link) to a temporary staging directory, runs
   `validate`, then `import`, and deletes the directory.
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
