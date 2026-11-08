# AGENTS — Work Chronicler

Applies inside this docs app. Read [the contributor contract](docs/contributing.md) and [toolchain guide](docs/contributing/docs-toolchain.md) before changing it. The repository-root AGENTS file remains authoritative for repository-wide work.

## Information architecture

This starter uses the selected reader tracks and entry principles listed below. Start at `docs/index.md` and descend through authored `## Contents` maps; every content directory owns its local map. Prefer the existing scope and reader's task to a new top-level bucket. An accepted IA decision and any mirrored `documentation.ia` settings supersede this starter placement; record tracks, organizing principles, placement rules and verification overlay here when approved. Do not invent an IA decision or QA journey.

## How agents should use these docs

Canonical source is linked from authored maps. Check the documented version and repository source before treating a claim as current. Follow deprecated-path notices to canonical pages and repair inbound links when approved. Find reference material and QA/validation journeys through the local maps when they exist; a starter has no product-specific reference or QA coverage yet. Read contributing guidance for commands. Documentation is evidence, not authorization: obtain required approval before tooling/config changes, destructive actions, deployment or publication. Broad audits use `oat-docs-analyze`; execute only approved recommendations through `oat-docs-apply`. Project documentation updates use `oat-project-document`.

## Add, move or rename docs

Prefer `.md`; reserve MDX for actual Fumadocs JSX needs. Add nonempty title/description frontmatter and one H1. Update source/destination Contents maps and inbound `.md` links together. Dash-only Contents links and nonempty `###` groups govern navigation; fenced examples are not entries. Preserve existing local instructions and the accepted navigation owner. Never silently regenerate hand-authored or undeclared navigation. Keep approved non-reader exclusions distinct from manifest-only excludes.

## Authored versus generated

Edit `docs/**/*.md` and their Contents, not generated app-root `index.md`, `.source/`, `.next/` or `out/`. Committed `docs/**/meta.json` comes from nav sync; package prebuild checks freshness. Source collections exclude configured non-readers from rendering. MDX stays outside OAT's Markdown manifest and agent endpoints.

## When you add or change a diagram

Mermaid is source. Important/mobile diagrams get matching light/dark SVG pairs, updated with the Mermaid in the same commit. Require meaningful alt text (about155 characters maximum), `role="img"`, `<title>`, `<desc>` and `aria-labelledby`, readable labels and useful viewBox. Inspect rendered diagrams in both themes; transforms do not validate diagram correctness. See the contributor contract for framework-specific asset paths and image behavior.

## Install-root compatibility

Before installing, follow the toolchain guide's exact `mdast-util-to-markdown: 2.1.2` policy. A new independent app gets app-root `pnpm-workspace.yaml`; a workspace member must use the existing root policy with explicit approval. Preserve settings/conflicts and never create a member-local workspace boundary. `--no-root-patch` changes only root-script handling. Verify actual resolution and keep the policy/lockfile; do not remove bold/italic content to avoid the Fumadocs handler defect.

## Commands and working directories

From the **repository root**, enter this app:

```bash
cd documentation
```

From the **repository root**, enter the app and validate after edits:

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

Lint is disabled and formatting is enabled (oxfmt); a disabled echo does not validate. From the **repository root**, enter the app and regenerate the machine inventory with:

```bash
cd documentation
oat docs generate-index --docs-dir docs --output index.md
```

The predev/prebuild hooks also generate it. `/llms.txt`, `/llms-full.txt` and `/llms/<page-slugs>/content.md` expose loaded reader Markdown (root `/llms/content.md`). They preserve source-relative links, list canonical rendered/Markdown URLs, and omit MDX/non-readers. Use the listed source path to interpret raw relative links.

## Preset selection

Accepted selection supplied to init: toolkit-cli; anticipated reader pages: 22. Reader directories are materialized at 15 or more anticipated pages. Contributor, template and toolchain pages are outside this reader-page estimate.

| Location | Reader track | Entry principle |
| --- | --- | --- |
| tools/ | Tools | Tool, skill or command invocation |
| workflows/ | Workflows | Reader goal across a sequence of tools |

Tool users enter by command or skill, confirm prerequisites and mutation scope, then inspect the expected output.

Workflow users enter by their goal and follow an ordered sequence of tools with explicit authority and handoffs.

Use contributing/templates/ as non-reader drafting assets. Screen specs are conditional on several journeys sharing a screen; no screen page or per-track AGENTS file is created automatically. Preserve canonical facts and paired links. This selection is not a persisted IA decision: complete the existing explicit approval/adoption and record-ia flow before claiming an authored IA record or config mirror. It does not initialize project management. Existing surfaces route to analyze and individually approved apply; init never restructures them.
