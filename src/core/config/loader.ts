import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import {
  getActiveProfile,
  getProfileConfigPath,
  isWorkspaceMode,
} from '@workspace/index';
import { parse as parseYaml } from 'yaml';
import { type Config, ConfigSchema } from './schema';

const CONFIG_FILE_NAMES = [
  'work-chronicler.yaml',
  'work-chronicler.yml',
  '.work-chronicler.yaml',
  '.work-chronicler.yml',
];

const GLOBAL_CONFIG_DIR = join(homedir(), '.config', 'work-chronicler');

/**
 * Find the config file path by checking multiple locations.
 *
 * Search order:
 * 1. Explicit path if provided
 * 2. Active profile config (if workspace mode enabled)
 * 3. Current directory (work-chronicler.yaml, .work-chronicler.yaml, etc.)
 * 4. Global config directory (~/.config/work-chronicler/)
 *
 * @param explicitPath - Optional explicit path to config file
 * @returns Absolute path to config file, or null if not found
 *
 * @example
 * ```ts
 * const configPath = findConfigPath();
 * if (configPath) {
 *   console.log(`Found config at: ${configPath}`);
 * }
 * ```
 */
export function findConfigPath(explicitPath?: string): string | null {
  // If explicit path provided, use it
  if (explicitPath) {
    const resolved = resolve(explicitPath);
    if (existsSync(resolved)) {
      return resolved;
    }
    return null;
  }

  // Check active profile config (workspace mode)
  if (isWorkspaceMode()) {
    const profileName = getActiveProfile();
    const profileConfigPath = getProfileConfigPath(profileName);
    if (existsSync(profileConfigPath)) {
      return profileConfigPath;
    }
  }

  // Check current directory (legacy mode)
  for (const name of CONFIG_FILE_NAMES) {
    const localPath = resolve(name);
    if (existsSync(localPath)) {
      return localPath;
    }
  }

  // Check global config directory (legacy mode)
  for (const name of CONFIG_FILE_NAMES) {
    const globalPath = join(GLOBAL_CONFIG_DIR, name);
    if (existsSync(globalPath)) {
      return globalPath;
    }
  }

  return null;
}

/**
 * Load and validate configuration from a YAML file.
 *
 * @param configPath - Optional path to config file. If not provided, searches default locations.
 * @returns Validated configuration object
 * @throws Error if config file not found or validation fails
 *
 * @example
 * ```ts
 * const config = await loadConfig();
 * console.log(`Fetching PRs for ${config.github.username}`);
 * ```
 */
export async function loadConfig(configPath?: string): Promise<Config> {
  // In workspace mode, require the active profile config to exist unless the user explicitly
  // provided a config path (legacy mode).
  if (!configPath && isWorkspaceMode()) {
    const profileName = getActiveProfile();
    const profileConfigPath = getProfileConfigPath(profileName);
    if (!existsSync(profileConfigPath)) {
      throw new Error(
        `Workspace profile '${profileName}' is not initialized. Run \`work-chronicler init --profile ${profileName}\`, switch profiles, or pass --config <path> to use a legacy config file.`,
      );
    }
  }

  const foundPath = findConfigPath(configPath);

  if (!foundPath) {
    throw new Error(
      'Config file not found. Run `work-chronicler init` to create one.',
    );
  }

  const content = readFileSync(foundPath, 'utf-8');
  const raw = parseYaml(content);

  const result = ConfigSchema.safeParse(raw);

  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Invalid config file:\n${errors}`);
  }

  return result.data;
}

/**
 * Get the work-log output directory, resolved to an absolute path.
 *
 * The path is resolved relative to the config file's directory (if provided)
 * or the current working directory.
 *
 * @param config - The loaded configuration object
 * @param configPath - Optional path to config file (for relative resolution)
 * @returns Absolute path to output directory
 *
 * @example
 * ```ts
 * const outputDir = getOutputDirectory(config, configPath);
 * // outputDir: "/home/user/project/work-log"
 * ```
 */
export function getOutputDirectory(
  config: Config,
  configPath?: string,
): string {
  const baseDir = configPath ? dirname(configPath) : process.cwd();
  return resolve(baseDir, config.output.directory);
}

/**
 * Generate example configuration file content.
 *
 * Use this when creating a new config file via `work-chronicler init`.
 *
 * @returns YAML string with example configuration
 */
export function generateExampleConfig(): string {
  return `# work-chronicler configuration
# See https://github.com/your-org/work-chronicler for documentation

github:
  username: "your-github-username"
  # token: Optional, can also use GITHUB_TOKEN env var
  orgs:
    - name: "your-org"
      repos:
        - "repo-one"
        - "repo-two"
    # Use ["*"] to include all repos in an org
    - name: "another-org"
      repos: ["*"]

jira:
  instances:
    - name: "company"
      url: "https://your-company.atlassian.net"
      # email: Optional, for authentication
      # token: Optional, can also use JIRA_TOKEN env var
      projects:
        - "PROJ"
        - "TEAM"

output:
  directory: "./work-log"

fetch:
  since: "2024-01-01"
  until: null  # null means now
`;
}
