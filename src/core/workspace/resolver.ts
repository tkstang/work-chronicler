import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Default workspace root directory
 */
const DEFAULT_WORKSPACE_ROOT = join(homedir(), '.work-chronicler');

/**
 * Standard directories within a profile
 */
const PROFILE_SUBDIRS = ['work-log', 'analysis', 'outputs'] as const;

/**
 * Get the workspace root directory.
 *
 * Resolution order:
 * 1. WORK_CHRONICLER_HOME environment variable
 * 2. Default: ~/.work-chronicler/
 *
 * @returns Absolute path to workspace root
 */
export function getWorkspaceRoot(): string {
  return process.env.WORK_CHRONICLER_HOME ?? DEFAULT_WORKSPACE_ROOT;
}

/**
 * Check if workspace mode is enabled (workspace root exists)
 */
export function isWorkspaceMode(): boolean {
  return existsSync(getWorkspaceRoot());
}

/**
 * Get the profiles directory path
 */
export function getProfilesDir(): string {
  return join(getWorkspaceRoot(), 'profiles');
}

/**
 * Get the path to a specific profile directory
 */
export function getProfileDir(profileName: string): string {
  return join(getProfilesDir(), profileName);
}

/**
 * Get the path to a profile's config file
 */
export function getProfileConfigPath(profileName: string): string {
  return join(getProfileDir(profileName), 'config.yaml');
}

/**
 * Get the path to a profile's .env file
 */
export function getProfileEnvPath(profileName: string): string {
  return join(getProfileDir(profileName), '.env');
}

/**
 * Get the path to a profile's work-log directory
 */
export function getWorkLogDir(profileName: string): string {
  return join(getProfileDir(profileName), 'work-log');
}

/**
 * Get the path to a profile's analysis directory
 */
export function getAnalysisDir(profileName: string): string {
  return join(getProfileDir(profileName), 'analysis');
}

/**
 * Get the path to a profile's outputs directory
 */
export function getOutputsDir(profileName: string): string {
  return join(getProfileDir(profileName), 'outputs');
}

/**
 * Get the path to the global config file
 */
export function getGlobalConfigPath(): string {
  return join(getWorkspaceRoot(), 'config.json');
}

/**
 * Ensure workspace root directory exists
 */
export function ensureWorkspaceRoot(): void {
  const root = getWorkspaceRoot();
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true });
  }
}

/**
 * Ensure all profile directories exist
 */
export function ensureProfileDirs(profileName: string): void {
  const profileDir = getProfileDir(profileName);

  // Create profile directory
  if (!existsSync(profileDir)) {
    mkdirSync(profileDir, { recursive: true });
  }

  // Create subdirectories
  for (const subdir of PROFILE_SUBDIRS) {
    const subdirPath = join(profileDir, subdir);
    if (!existsSync(subdirPath)) {
      mkdirSync(subdirPath, { recursive: true });
    }
  }
}

/**
 * Check if a profile directory exists
 */
export function profileExists(profileName: string): boolean {
  return existsSync(getProfileDir(profileName));
}
