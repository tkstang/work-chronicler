---
title: Getting started
description: Install work-chronicler, create a profile, fetch and analyze your work, and run your first AI skill.
---

# Getting started

This page takes you from installing the CLI to a first draft written by an AI
skill. It uses an individual contributor (IC) profile; managers start the same
way with `init --mode manager` (see [Manager mode](workflows/manager-mode.md)).

## Requirements

- Node.js 22.22.1 or later (24 recommended).
- A GitHub personal access token and, optionally, a JIRA API token. See
  [Tokens](tools/configuration.md#tokens) for the scopes they need.
- An AI coding assistant that runs skills: Claude Code, Cursor, Codex or
  Gemini.

## Install and fetch your work

```bash
npm install -g work-chronicler

work-chronicler init            # guided setup: profile, sources, repos, tokens
work-chronicler fetch all       # fetch PRs and tickets, then link them
work-chronicler status          # see what was fetched
work-chronicler analyze --all   # tag impact, detect projects, build a timeline
work-chronicler skills install  # add the AI skills to Claude Code, Cursor, Codex or Gemini
```

[The `init` wizard](tools/configuration.md#the-init-wizard) lists what `init`
asks for. To also record the PR reviews you gave, fetch with
`work-chronicler fetch all --reviews` (see
[Record the PR reviews you gave](workflows/pr-reviews-given.md)).

## Where your data lives

Data lives in `~/.work-chronicler/profiles/<profile>/`. Each profile has its
own `config.yaml`, `.env` (tokens, mode `600`) and `work-log/`. Set
`WORK_CHRONICLER_HOME` to use another root. [Workspace
layout](tools/configuration.md#workspace-layout) shows every directory.

## Run your first skill

In your AI coding assistant, run a skill such as
`/work-chronicler-write-self-review`, or start with
`/work-chronicler-summarize-work` for a quick summary. Skills are assistant
slash commands; they do not run in a terminal.

## Next steps

- [Workflows](workflows/index.md): resumes and self-reviews, peer reviews,
  Slack and Google Docs imports, and manager review packets.
- [AI skills](tools/skills.md): every skill and how skills find your data.
- [MCP server](tools/mcp-server.md): let an assistant query your work log.
- [Command reference](tools/commands.md): every command and flag.
