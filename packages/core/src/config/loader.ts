import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
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
 * Find the config file path by checking:
 * 1. Explicit path if provided
 * 2. Current directory
 * 3. Global config directory
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

  // Check current directory
  for (const name of CONFIG_FILE_NAMES) {
    const localPath = resolve(name);
    if (existsSync(localPath)) {
      return localPath;
    }
  }

  // Check global config directory
  for (const name of CONFIG_FILE_NAMES) {
    const globalPath = join(GLOBAL_CONFIG_DIR, name);
    if (existsSync(globalPath)) {
      return globalPath;
    }
  }

  return null;
}

/**
 * Load and validate configuration from a YAML file
 */
export async function loadConfig(configPath?: string): Promise<Config> {
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
 * Get the output directory from config, resolved to absolute path
 */
export function getOutputDirectory(
  config: Config,
  configPath?: string,
): string {
  const baseDir = configPath ? dirname(configPath) : process.cwd();
  return resolve(baseDir, config.output.directory);
}

/**
 * Generate example config content
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
