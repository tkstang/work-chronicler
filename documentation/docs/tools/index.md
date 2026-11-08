---
title: "Tools"
description: "Reference for the work-chronicler CLI commands, configuration, MCP server and AI skills."
---

# Tools

Look up a command, a configuration field, an MCP tool or a skill here. Each
page covers how to invoke it, what it reads and changes, and what it outputs.
For a goal that spans several tools, start in [Workflows](../workflows/index.md).

Run `work-chronicler <command> --help` for the same flags from the CLI. From a
source checkout, use `pnpm cli <command>`.

## Contents

### CLI commands

- [Command reference](commands.md) - Global options, setup, profile, manager-mode, skills, workspace and MCP commands, and where each other group lives.
- [Fetch commands](fetch.md) - `fetch github`, `fetch jira` and `fetch all`, and the PR reviews you gave (`--reviews`).
- [Import and validate](import.md) - Store a staged batch all or nothing, how commands read imported records, and errors.
- [Import record format](import-records.md) - The staged batch, record fields, storage paths and the Slack and Google Docs rules.
- [Slack commands](slack.md) - `slack configure`, `slack channels` and `slack show`.
- [Google Docs commands](google-docs.md) - `google-docs configure` and `google-docs show`.
- [Link, analyze and filter](link-analyze-filter.md) - Link PRs to tickets, tag impact, detect projects, build a timeline and filter a subset.

### Configuration

- [Configuration](configuration.md) - Profiles, `config.yaml` fields, tokens, environment variables and the workspace layout.

### MCP server

- [MCP server](mcp-server.md) - Client setup, config discovery and the ten read-only tools.

### AI skills

- [AI skills](skills.md) - What each IC, manager, Slack and Google Docs skill does, installing and upgrading them, and how they find your data.
