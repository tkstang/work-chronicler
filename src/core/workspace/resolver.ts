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
const PROFILE_SUBDIRS = ['work-log'] as const;

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
  return join(getWorkLogDir(profileName), '.analysis');
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

  // Create standard work-log subdirectories (used by analyze/filter and for user notes)
  const workLogDir = getWorkLogDir(profileName);
  const workLogSubdirs = ['.analysis', 'notes', 'performance-reviews'];

  for (const subdir of workLogSubdirs) {
    const subdirPath = join(workLogDir, subdir);
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

/**
 * Check if profile is in manager mode
 *
 * @param profileName - Profile name
 * @returns True if manager mode
 */
export function isManagerMode(profileName: string): boolean {
  return profileName === 'manager';
}

/**
 * Get the path to a report's work-log directory (manager mode)
 *
 * @param profileName - Profile name (must be 'manager')
 * @param reportId - Report ID (required for manager mode)
 * @returns Absolute path to report's work-log directory
 * @throws Error if report ID is not provided in manager mode
 */
export function getReportWorkLogDir(
  profileName: string,
  reportId: string,
): string {
  if (isManagerMode(profileName)) {
    if (!reportId) {
      throw new Error('Report ID required for manager mode paths');
    }
    return join(getProfileDir(profileName), 'reports', reportId, 'work-log');
  }

  // For IC mode, return standard work-log path
  return getWorkLogDir(profileName);
}

/**
 * Get the path to a report's analysis directory (manager mode)
 *
 * @param profileName - Profile name
 * @param reportId - Report ID (optional, for manager mode)
 * @returns Absolute path to analysis directory
 */
export function getReportAnalysisDir(
  profileName: string,
  reportId: string,
): string {
  if (isManagerMode(profileName)) {
    if (reportId) {
      // Per-report analysis
      return join(getProfileDir(profileName), 'reports', reportId, 'analysis');
    }
    // Team-level analysis
    return join(getProfileDir(profileName), 'analysis');
  }

  // For IC mode, return standard analysis path
  return getAnalysisDir(profileName);
}

/**
 * Get the path to a report's outputs directory (manager mode)
 *
 * @param profileName - Profile name
 * @param reportId - Report ID (optional, for manager mode)
 * @returns Absolute path to outputs directory
 */
export function getReportOutputsDir(
  profileName: string,
  reportId: string,
): string {
  if (isManagerMode(profileName)) {
    if (reportId) {
      // Per-report outputs
      return join(getProfileDir(profileName), 'reports', reportId, 'outputs');
    }
    // Team-level outputs
    return join(getProfileDir(profileName), 'outputs');
  }

  // For IC mode, return standard outputs path (work-log/outputs)
  return join(getWorkLogDir(profileName), 'outputs');
}

/**
 * Ensure report directories exist (manager mode)
 *
 * @param profileName - Profile name (must be 'manager')
 * @param reportId - Report ID
 */
export function ensureReportDirs(profileName: string, reportId: string): void {
  if (!isManagerMode(profileName)) {
    throw new Error('ensureReportDirs only available in manager mode');
  }

  const reportDir = join(getProfileDir(profileName), 'reports', reportId);

  // Create report directory structure
  const dirs = [
    join(reportDir, 'work-log'),
    join(reportDir, 'analysis'),
    join(reportDir, 'outputs'),
    join(reportDir, 'notes'),
    join(reportDir, 'performance-reviews'),
    join(reportDir, 'peer-reviews'),
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}
