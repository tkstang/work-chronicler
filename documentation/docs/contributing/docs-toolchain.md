---
title: Docs Toolchain
description: "Set up the local docs toolchain, preview changes and build the site."
---

# Docs Toolchain

This page is for documentation contributors. Follow the [contributor map](index.md) and [authoring contract](../contributing.md); readers start with [the documentation home](../index.md).

## Prerequisites

- Node.js 24
- pnpm 10+

## Required install-root compatibility policy

The current Fumadocs Markdown handler wrapper is incompatible with
`mdast-util-to-markdown` 2.2.0: valid bold and italic content can recurse during
compilation. Keep authored content and framework versions; constrain this
transitive dependency to exactly `2.1.2` at the **effective pnpm install root**.
This is a constrained fresh install, not an unconstrained compatibility claim.

For a new independent app, the CLI creates app-root `pnpm-workspace.yaml` with
`packages: []` and this policy. Install inside that app. For a workspace member,
the CLI creates no local workspace boundary: install from the existing workspace
root and propose this exact addition to its `pnpm-workspace.yaml`:

```yaml
overrides:
  mdast-util-to-markdown: 2.1.2
```

Preserve all existing `packages`, overrides and other settings. Add the one entry
under an existing `overrides` map rather than duplicating the key. Obtain the
repository owner's approval before editing existing policy. A conflicting version
or declined/skipped edit remains a manual setup requirement; stop before claiming
a successful install/build. Do not split an actual workspace member with a local
`pnpm-workspace.yaml`, or place an ineffective override in its `package.json`.
`--no-root-patch` controls root build scripts only and never approves dependency
policy changes. CLI init does not merge or overwrite existing root policy.

Use the repository's selected pnpm version (10+). This root YAML syntax works
with pnpm 10 and 12; pnpm 12 ignores `package.json`'s `pnpm.overrides`, and pnpm 10
ignores policy in a workspace member. After installation, inspect
`pnpm why mdast-util-to-markdown` from the effective root to confirm `2.1.2`, then
run the checker and real build below. Retain the effective root policy and
lockfile in version control. Do not change a user-scope package-manager install.

## Install and preview

From the **repository root**, enter the docs app; subsequent commands run in the **app directory**:

```bash
cd documentation
pnpm install
pnpm dev
```

Fumadocs generates a static export under `out/`. `cd documentation && pnpm start` expects a Next server and is not the static-export preview command; serve `out/` with a static HTTP server and mount the configured base path.

## Validate before committing

From the **repository root**, enter the app and validate in this order:

```bash
cd documentation
pnpm docs:format
pnpm docs:format:check
pnpm docs:lint
oat docs nav sync --target-dir .
oat docs nav sync --target-dir . --check
pnpm docs:check
pnpm build
```

Lint is disabled; formatting is enabled (oxfmt). Disabled scripts print a message and are not validation. Nav sync writes only approved, owned navigation; the read-only check fails on drift or unlisted reader pages. Inspect the rendered site for navigation, links, tabs and diagrams.

From the **repository root**, enter the app and regenerate the machine inventory when needed:

```bash
cd documentation
oat docs generate-index --docs-dir docs --output index.md
```

The app's predev/prebuild hooks regenerate it automatically. This does not replace authored Contents or navigation checks.
