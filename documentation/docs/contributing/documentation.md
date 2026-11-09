---
title: Contributing to the documentation
description: "Authoring contract: authored and generated files, the navigation contract, page moves, diagrams and validation."
---

# Contributing to the documentation

Ship documentation with the behavior it explains. Use the [docs toolchain guide](docs-toolchain.md) for setup and validation, [Markdown features](markdown-features.md) for the syntax this app renders, and the [contributor guides](index.md) as the local map.

Agent working rules: `documentation/AGENTS.md` (the docs-app source file).

## Authored and generated files

| Surface                                                               | Owner and action                                                          |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `docs/**/*.md`, including `docs/**/index.md`                          | Authored source; edit purpose and Contents maps directly.                 |
| `AGENTS.md` and this contributor guide                                | Authored working rules and human guidance; keep their audiences separate. |
| `docs/**/meta.json`                                                   | Committed derived sidebar; regenerate with nav sync, never hand-edit.     |
| App-root `index.md`                                                   | Generated machine inventory from Markdown; predev/prebuild regenerate it. |
| `.source/`, `.next/`, `out/`                                          | Generated collection, build and static export; do not edit.               |
| `app/`, `lib/`, `source.config.ts`, `next.config.js`, package scripts | Authored application/configuration; review tooling changes explicitly.    |

Fumadocs collections omit configured non-reader routes as well as navigation/manifest entries. Per-page `generateMetadata` reads title/description from loaded source. `/llms.txt`, `/llms-full.txt` and `/llms/<page-slugs>/content.md` (root `/llms/content.md`) serve the same loaded `.md` reader set, including readers omitted from a hand-authored sidebar. MDX is excluded. Agent bodies retain authored Markdown: resolve relative links against the listed source path, not `/llms/`; follow each canonical rendered URL for the site.

## Navigation contract

Every content directory has an authored `index.md` with a useful purpose paragraph and one `## Contents` local map. Prefer `.md` pages with nonempty `title` and `description` frontmatter and exactly one document H1. `overview.md` is deprecated.

Within `## Contents`, use dash-only links to sibling pages or child indexes, optionally followed by a description on an indented continuation line (the theme renders each entry as a card, so a `-` separator would show inside it). A `### Label` starts a group and must contain at least one authored entry before the next group/end. Entries before the first group are ungrouped. A `*` or `+` link bullet, or an empty authored group, is an error naming the file and line. The map ends at the next level-two heading; fenced examples are ignored. A self-index link retains the existing landing-page behavior. Missing Contents keeps deterministic manifest fallback, but strict nav still requires an authored map and lists unlisted reader pages.

```markdown
## Contents

- [Start here](getting-started.md)
  The first safe result.

### Contributor guides

- [Contributing](contributing/index.md)
  Local setup and authoring.
```

`documentation.navOwner: nav-sync` means nav sync owns derived navigation. With `hand-authored` or undeclared ownership, do not silently regenerate; agree the ownership/change first. Configured `documentation.nonReaderPaths` omits drafts/templates from navigation and manifests; an explicit Contents link does not override an exclusion. `documentation.excludes` affects only the manifest. Do not add an exclusion to hide an unlisted reader page.

## Add, move or rename a page

1. Read the nearest authored map and choose a path in its scope; create a child `index.md` when adding a directory.
2. Add useful title/description frontmatter, one H1, and the page's reader outcome. Use `.md`-suffixed source links such as `[Guide](guide.md)` and `[Section](section/index.md)`.
3. Update the nearest Contents map. For a move/rename, update both source and destination maps and every inbound link in the same change. Review old published URLs; agree a redirect or a static stub/recovery page when needed.
4. Refresh owned navigation, run the checks below and inspect the rendered links/navigation before committing. Never repair drift by hand-editing derived files.

## Markdown and MDX

Use the least complex layer that expresses the reader's need: **Markdown → existing transform → MDX**. Ordinary prose stays `.md`. Use MDX only for actual JSX/component needs; MDX is excluded from OAT's Markdown manifest and the agent Markdown endpoints. Use a language on every fence and `bash` for shell commands. [Markdown features](markdown-features.md) lists every feature this app renders, with syntax and examples; do not describe anything else as supported without an approved configuration and a working example. Lint is disabled and formatting is enabled (oxfmt); disabled scripts only print a message.

## Diagrams and accessibility

Run the app’s docs:check script (from the repository root: `cd documentation && pnpm docs:check`) before committing. It checks reader metadata/maps/links, navigation, contributor commands and real Mermaid syntax without building the site. Errors fail; warnings prompt review. Fix authored sources, then explicitly sync owned navigation and retry.

Mermaid is the diagram source of truth. Important or phone-sized diagrams also get matching `<name>-light.svg` and `<name>-dark.svg` assets. Change the Mermaid and both SVGs in the same commit, preserving nodes, edges and labels. Each SVG uses `role="img"`, a descriptive `<title>` and `<desc>` (connected with `aria-labelledby`), a legible viewBox and readable labels. Keep image alt text concise, about 155 characters or less, and describe the diagram's meaning without inventing claims.

See [Mermaid diagrams](markdown-features.md#mermaid-diagrams) and [Images](markdown-features.md#images) for the syntax.

Fumadocs images live under `public/diagrams/` and use root-relative `/diagrams/name-light.svg` and `/diagrams/name-dark.svg` links; the theme adds the base path and shows the matching theme. Place the pair in a Diagram tab beside a Mermaid source tab. Markdown images are zoomable; static search and the light/dark theme are configured.
