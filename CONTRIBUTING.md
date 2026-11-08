# Contributing

## Setup

Use the Node.js version in `.nvmrc` and the pnpm version pinned in
`package.json` (`packageManager`; Corepack picks it up).

```bash
pnpm install     # also installs the git hooks in tools/git-hooks/
pnpm build
pnpm test
pnpm cli status  # run the CLI from source
```

Set `GIT_HOOKS=0` before `pnpm install` to skip hook installation.

When you run the CLI against real data during development, point it at a
scratch workspace so your own profiles are untouched:

```bash
WORK_CHRONICLER_HOME="$(mktemp -d)" pnpm cli init
```

To try a published version with `npx work-chronicler@<version>`, run it from
an isolated temporary directory outside any npm project or workspace (for
example `cd "$(mktemp -d)"`). Inside this repository, or a project that
links a checkout, npx may resolve the local package instead of the
published version.

## Checks

The `package.json` scripts are the source of truth for linting, formatting,
type checking and tests. Before opening a pull request, run the lint, format,
type-check and test scripts listed there, plus `pnpm build` when you change
entry points, exports, path aliases or the published `files` list. CI runs
lint (oxlint), a format check (oxfmt), type checking, tests, the build and a
publish dry-run on ready pull requests; draft pull requests skip CI. Tests are
co-located as `src/**/*.test.ts`.

## Branches and commits

- Branch from `main` with a short topic name such as `feat/<topic>`,
  `fix/<topic>` or `docs/<topic>`.
- Write [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`). The
  `commit-msg` hook enforces this with commitlint.
- Mark breaking changes with `!` or a `BREAKING CHANGE:` footer, and note them
  in `CHANGELOG.md`.

## Pull requests

- Fill in the pull request template: Purpose, Changes, Testing and Notes.
- Add user-visible changes to the `## [Unreleased]` section of `CHANGELOG.md`.
- Pull requests are squash-merged; the merge subject carries the PR number.

## Skills

Skills live in `.agents/skills/<name>/`. Skills prefixed `work-chronicler-`
ship in the npm package and are installed with `work-chronicler skills install`.
Unprefixed skills, such as `release-notes`, are maintainer tools and are not
published. See `AGENTS.md` for skill conventions.

## Releases

Releases are tag-driven. A maintainer bumps `version` in `package.json`, moves
the `Unreleased` changelog entries under the new version, merges to `main`, and
pushes a `v<version>` tag. The release workflow tests the tag, publishes to npm
and creates the GitHub Release. Do not publish or create releases by hand.
