# Git Hooks

Automated git hooks for code quality and consistency.

## Features

- **Automatic Setup**: Hooks are installed automatically on `pnpm install`
- **Silent When Ready**: No output if hooks are already configured
- **Skippable in CI/Docker**: Set `GIT_HOOKS=0` to skip installation
- **Individually Controllable**: Enable/disable specific hooks as needed

## Available Hooks

- `pre-commit`: Runs `lint-staged` (linting, formatting, tests on staged files)
- `commit-msg`: Validates commit messages with `commitlint`
- `pre-push`: Runs full test suite before pushing
- `post-checkout`: Runs `pnpm install` when switching branches with lockfile changes

## Usage

### Automatic (Recommended)

Hooks are automatically installed when you run `pnpm install`. If they're already installed, the setup is silent.

### Manual Control

```bash
# View status of all hooks
pnpm hooks:status

# Enable all hooks
pnpm hooks:enable-all

# Disable all hooks
pnpm hooks:disable-all

# Enable specific hook
pnpm hooks enable pre-commit

# Disable specific hook
pnpm hooks disable pre-commit
```

## Skipping Hooks

### In Docker/CI

Set the `GIT_HOOKS` environment variable to `0`:

```dockerfile
ENV GIT_HOOKS=0
RUN pnpm install
```

### Locally (Temporary)

```bash
# Skip hook setup for this install only
GIT_HOOKS=0 pnpm install
```

### Locally (Permanent)

```bash
# Disable all hooks
pnpm hooks:disable-all
```

Disabled hooks are tracked in `.git/hooks/.disabled-hooks` and won't be re-enabled by `pnpm install`.

## How It Works

1. The `prepare` script in `package.json` runs `manage-hooks.js setup` after every `pnpm install`
2. The script checks if `GIT_HOOKS=0` is set - if so, it exits immediately
3. If all hooks are already installed or intentionally disabled, it exits silently
4. Otherwise, it installs missing hooks and reports what was done

## Troubleshooting

### Hooks not running

```bash
# Check hook status
pnpm hooks:status

# Re-enable all hooks
pnpm hooks:enable-all
```

### Hooks running when they shouldn't

```bash
# Disable specific hook
pnpm hooks disable pre-push

# Or disable all
pnpm hooks:disable-all
```

### Hooks failing in CI

Ensure `GIT_HOOKS=0` is set in your CI environment or Dockerfile.

## Implementation Details

- Hooks are symlinked from `tools/git-hooks/` to `.git/hooks/`
- Disabled hooks are tracked in `.git/hooks/.disabled-hooks`
- The `setup` action respects intentionally disabled hooks
- Git's `core.hooksPath` is unset to ensure hooks run from `.git/hooks/`

