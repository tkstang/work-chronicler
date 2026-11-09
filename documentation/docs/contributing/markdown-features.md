---
title: Markdown features
description: "Every Markdown feature the Work Chronicler docs app renders, each with its syntax and a rendered example."
---

# Markdown features

This page lists the features the docs app renders today: Fumadocs MDX with
GitHub Flavored Markdown and Shiki code highlighting, plus the
`@open-agent-toolkit` transforms for tabs, `.md` links, callouts and Mermaid.
Write pages as `.md`. Anything not on this page is not configured; see
[Contributing to the documentation](documentation.md) for the page contract.

## Frontmatter

Every page starts with a nonempty `title` and `description`. The title becomes
the page heading in navigation, the browser tab and search; the description is
the page's meta description and its entry in the generated manifest.

=== "Syntax"

    ```yaml
    ---
    title: Fetch commands
    description: fetch github, fetch jira and fetch all, and their flags.
    ---
    ```

## Headings

Use one `#` heading per page. Every `##` and `###` heading outside a tab group
gets an anchor link and an entry in the "On this page" table of contents; the
section headings on this page are the rendered example. A heading inside a tab
panel gets neither, so keep headings out of tabs.

=== "Syntax"

    ```text
    ## Section heading

    ### Subsection heading
    ```

## Links between pages

Link to another page by its `.md` source path; a section index is
`section/index.md`. The build turns these into site routes, and agents can
follow the same path to the source file. Add `#anchor` for a heading.

=== "Syntax"

    ```text
    See [Fetch commands](../tools/fetch.md#pr-reviews-you-gave) and the
    [Tools](../tools/index.md) map.
    ```

=== "Rendered"

    See [Fetch commands](../tools/fetch.md#pr-reviews-you-gave) and the
    [Tools](../tools/index.md) map.

## Callouts

GitHub-style alert blockquotes: `NOTE`, `TIP`, `IMPORTANT`, `WARNING` and
`CAUTION`.

=== "Syntax"

    ```text
    > [!NOTE]
    > Imported records are supplementary evidence.

    > [!TIP]
    > Run `filter --clear` to go back to the full work log.

    > [!IMPORTANT]
    > `import` stores a batch all or nothing.

    > [!WARNING]
    > `--reviews` costs extra GitHub requests.

    > [!CAUTION]
    > `profile delete` removes the profile and all its data.
    ```

=== "Rendered"

    > [!NOTE]
    > Imported records are supplementary evidence.

    > [!TIP]
    > Run `filter --clear` to go back to the full work log.

    > [!IMPORTANT]
    > `import` stores a batch all or nothing.

    > [!WARNING]
    > `--reviews` costs extra GitHub requests.

    > [!CAUTION]
    > `profile delete` removes the profile and all its data.

## Tabs

A run of `=== "Label"` lines, each followed by content indented four spaces,
becomes one tab group. Tabs can hold any Markdown on this page, including other
tab groups.

=== "Syntax"

    ```text
    === "IC profile"

        work-chronicler slack show --json

    === "Manager profile"

        work-chronicler slack show --report alice-smith --json
    ```

=== "Rendered"

    === "IC profile"

        work-chronicler slack show --json

    === "Manager profile"

        work-chronicler slack show --report alice-smith --json

## Code blocks

Fenced code blocks are highlighted by language and get a copy button. Add
`title="..."` after the language for a file-name bar.

=== "Syntax"

    ````text
    ```yaml title="config.yaml"
    fetch:
      since: 2026-01-01
      until: null
    ```
    ````

=== "Rendered"

    ```yaml title="config.yaml"
    fetch:
      since: 2026-01-01
      until: null
    ```

## Highlighted lines and diffs

Shiki notation comments mark lines: `[!code highlight]` highlights a line,
`[!code ++]` and `[!code --]` mark added and removed lines. The comment itself
is removed from the output.

=== "Syntax"

    ````text
    ```ts
    const since = '2026-01-01';
    const until = null; // [!code highlight]
    const cache = false; // [!code --]
    const cache = true; // [!code ++]
    ```
    ````

=== "Rendered"

    ```ts
    const since = '2026-01-01';
    const until = null; // [!code highlight]
    const cache = false; // [!code --]
    const cache = true; // [!code ++]
    ```

## Tables

GitHub Flavored Markdown tables, with optional column alignment.

=== "Syntax"

    ```text
    | Command      | Writes        |
    | :----------- | ------------: |
    | `fetch jira` | `jira/`       |
    | `analyze`    | `.analysis/`  |
    ```

=== "Rendered"

    | Command      |       Writes |
    | :----------- | -----------: |
    | `fetch jira` |      `jira/` |
    | `analyze`    | `.analysis/` |

## Task lists, strikethrough and autolinks

=== "Syntax"

    ```text
    - [x] Fetch your PRs
    - [ ] Run `analyze --all`

    ~~Upper-cased project keys~~ Keys keep their case.

    Issues: https://github.com/tkstang/work-chronicler/issues
    ```

=== "Rendered"

    - [x] Fetch your PRs
    - [ ] Run `analyze --all`

    ~~Upper-cased project keys~~ Keys keep their case.

    Issues: https://github.com/tkstang/work-chronicler/issues

## Footnotes

A `[^label]` reference links to its definition, which renders at the end of
the page.

=== "Syntax"

    ```text
    Reviews you gave are review work.[^reviews]

    [^reviews]: They are never counted as PRs you authored.
    ```

=== "Rendered"

    Reviews you gave are review work.[^reviews]

    [^reviews]: They are never counted as PRs you authored.

## Mermaid diagrams

A `mermaid` code block renders as a diagram that follows the light or dark
theme and opens full-screen with **Enlarge**. Give every diagram an `accTitle`
and `accDescr`. `oat docs check` validates the syntax.

=== "Syntax"

    ````text
    ```mermaid
    flowchart LR
      accTitle: Fetch into the work log
      accDescr: fetch writes PRs and tickets into the work log, which analyze reads.
      F[fetch] --> W[(Work log)]
      W --> A[analyze]
    ```
    ````

=== "Rendered"

    ```mermaid
    flowchart LR
      accTitle: Fetch into the work log
      accDescr: fetch writes PRs and tickets into the work log, which analyze reads.
      F[fetch] --> W[(Work log)]
      W --> A[analyze]
    ```

## Images

Put image files under `public/` and link them root-relative; images open
zoomed when clicked. A pair named `<name>-light.<ext>` and `<name>-dark.<ext>`
shows only the file that matches the current theme. Keep alt text concise
(about 155 characters or less).

=== "Syntax"

    ```text
    ![Fetch writes to the work log](/diagrams/markdown-example-light.svg)
    ![Fetch writes to the work log](/diagrams/markdown-example-dark.svg)
    ```

=== "Rendered"

    ![Fetch writes to the work log](/diagrams/markdown-example-light.svg)
    ![Fetch writes to the work log](/diagrams/markdown-example-dark.svg)

## MDX pages

A page named `.mdx` can use JSX and the components the app registers (the
Fumadocs defaults, `Mermaid`, `Tabs` and `Tab`). MDX pages are left out of the
generated manifest and the `/llms` agent endpoints, so use them only when a
page needs a component that Markdown cannot express. This site has no MDX pages
today.

=== "Syntax"

    ```text
    <Tabs>
      <Tab title="IC profile">Run `work-chronicler status`.</Tab>
      <Tab title="Manager profile">Run `work-chronicler reports list`.</Tab>
    </Tabs>
    ```
