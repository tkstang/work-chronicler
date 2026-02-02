import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { type Config, ConfigSchema } from '@core/config/schema';
import {
  getActiveProfile,
  loadGlobalConfig,
  saveGlobalConfig,
} from './global-config';
import {
  ensureProfileDirs,
  getProfileConfigPath,
  getProfileDir,
  getProfileEnvPath,
  getProfilesDir,
  profileExists,
} from './resolver';
import { ProfileNameSchema } from './types';

/**
 * Validate a profile name
 *
 * @throws Error if profile name is invalid
 */
export function validateProfileName(name: string): void {
  const result = ProfileNameSchema.safeParse(name);
  if (!result.success) {
    throw new Error(result.error.errors[0]?.message ?? 'Invalid profile name');
  }
}

/**
 * List all available profiles
 */
export function listProfiles(): string[] {
  const profilesDir = getProfilesDir();

  if (!existsSync(profilesDir)) {
    return [];
  }

  const entries = readdirSync(profilesDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Create a new profile with the given config.
 *
 * @throws Error if profile already exists or name is invalid
 */
export function createProfile(profileName: string, config: Config): void {
  validateProfileName(profileName);

  if (profileExists(profileName)) {
    throw new Error(`Profile '${profileName}' already exists`);
  }

  // Create directories
  ensureProfileDirs(profileName);

  // Write config file
  saveProfileConfig(profileName, config);
}

/**
 * Delete a profile and all its data.
 *
 * @throws Error if profile name is invalid, doesn't exist, or is the active profile
 */
export function deleteProfile(profileName: string): void {
  validateProfileName(profileName);

  if (!profileExists(profileName)) {
    throw new Error(`Profile '${profileName}' does not exist`);
  }

  const active = getActiveProfile();
  if (profileName === active) {
    throw new Error(
      `Cannot delete active profile '${profileName}'. Switch to another profile first.`,
    );
  }

  const profileDir = getProfileDir(profileName);
  rmSync(profileDir, { recursive: true, force: true });
}

/**
 * Load a profile's config.
 *
 * @throws Error if profile doesn't exist or config is invalid
 */
export function loadProfileConfig(profileName: string): Config {
  const configPath = getProfileConfigPath(profileName);

  if (!existsSync(configPath)) {
    throw new Error(`Profile '${profileName}' has no config file`);
  }

  const content = readFileSync(configPath, 'utf-8');
  const raw = parseYaml(content);

  const result = ConfigSchema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Invalid profile config for '${profileName}':\n${errors}`);
  }

  return result.data;
}

/**
 * Save a profile's config.
 */
export function saveProfileConfig(profileName: string, config: Config): void {
  ensureProfileDirs(profileName);
  const configPath = getProfileConfigPath(profileName);
  const content = stringifyYaml(config, {
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  });
  writeFileSync(configPath, content, 'utf-8');
}

/**
 * Escape a value for .env file format.
 * Wraps in double quotes and escapes internal quotes, backslashes, and newlines.
 */
function escapeEnvValue(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
  return `"${escaped}"`;
}

/**
 * Save environment variables to a profile's .env file.
 * File is written with 0600 permissions (owner read/write only) for security.
 */
export function saveProfileEnv(
  profileName: string,
  env: { githubToken?: string; jiraToken?: string; jiraEmail?: string },
): void {
  ensureProfileDirs(profileName);
  const envPath = getProfileEnvPath(profileName);

  const lines: string[] = [
    '# work-chronicler profile environment variables',
    '# These tokens are used for API authentication',
    '',
  ];

  if (env.githubToken) {
    lines.push(`GITHUB_TOKEN=${escapeEnvValue(env.githubToken)}`);
  }

  if (env.jiraToken) {
    lines.push(`JIRA_TOKEN=${escapeEnvValue(env.jiraToken)}`);
  }

  if (env.jiraEmail) {
    lines.push(`JIRA_EMAIL=${escapeEnvValue(env.jiraEmail)}`);
  }

  writeFileSync(envPath, `${lines.join('\n')}\n`, {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

/**
 * Set a profile as the first/default profile (for new workspaces)
 */
export function initializeWorkspaceWithProfile(profileName: string): void {
  const config = loadGlobalConfig();
  config.activeProfile = profileName;
  saveGlobalConfig(config);
}
