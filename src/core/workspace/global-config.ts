import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  ensureWorkspaceRoot,
  getGlobalConfigPath,
  profileExists,
} from './resolver';
import {
  type GlobalConfig,
  GlobalConfigSchema,
  ProfileNameSchema,
  validateProfileName,
} from './types';

/**
 * Load global config from ~/.work-chronicler/config.json
 *
 * If file doesn't exist, returns default config.
 * If file exists but is invalid, throws error.
 */
export function loadGlobalConfig(): GlobalConfig {
  const configPath = getGlobalConfigPath();

  if (!existsSync(configPath)) {
    return GlobalConfigSchema.parse({});
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    const raw = JSON.parse(content);
    return GlobalConfigSchema.parse(raw);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in global config: ${configPath}`);
    }
    throw error;
  }
}

/**
 * Save global config to ~/.work-chronicler/config.json
 */
export function saveGlobalConfig(config: GlobalConfig): void {
  ensureWorkspaceRoot();
  const configPath = getGlobalConfigPath();
  const content = JSON.stringify(config, null, 2);
  writeFileSync(configPath, `${content}\n`, 'utf-8');
}

/**
 * Get the active profile name.
 *
 * Resolution order:
 * 1. WORK_CHRONICLER_PROFILE environment variable
 * 2. activeProfile in global config
 * 3. Fallback: "default"
 *
 * @throws Error if WORK_CHRONICLER_PROFILE contains an invalid profile name
 */
export function getActiveProfile(): string {
  // 1. Check environment variable
  const envProfile = process.env.WORK_CHRONICLER_PROFILE;
  if (envProfile) {
    const result = ProfileNameSchema.safeParse(envProfile);
    if (!result.success) {
      throw new Error(
        `Invalid WORK_CHRONICLER_PROFILE: ${result.error.errors[0]?.message}`,
      );
    }
    return envProfile;
  }

  // 2. Check global config
  const config = loadGlobalConfig();
  return config.activeProfile;
}

/**
 * Set the active profile in global config.
 *
 * @throws Error if profile name is invalid or doesn't exist
 */
export function setActiveProfile(profileName: string): void {
  validateProfileName(profileName);

  if (!profileExists(profileName)) {
    throw new Error(`Profile '${profileName}' does not exist`);
  }

  const config = loadGlobalConfig();
  config.activeProfile = profileName;
  saveGlobalConfig(config);
}
