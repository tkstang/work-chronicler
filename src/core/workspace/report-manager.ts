/**
 * Report management for manager mode
 */

import { readFileSync, writeFileSync } from 'node:fs';
import type {
  ManagerConfig,
  ReportConfig,
  ReportMetadata,
} from '@wc-types/manager';
import { ManagerConfigSchema } from '@wc-types/manager';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { generateReportId, validateReportName } from './report-utils';
import {
  ensureReportDirs,
  getProfileConfigPath,
  getProfileDir,
  isManagerMode,
} from './resolver';

/**
 * Load manager config from profile
 *
 * @param profileName - Profile name (must be 'manager')
 * @returns Manager config
 * @throws Error if profile is not in manager mode or config is invalid
 */
export function loadManagerConfig(profileName: string): ManagerConfig {
  if (!isManagerMode(profileName)) {
    throw new Error('Profile is not in manager mode');
  }

  const configPath = getProfileConfigPath(profileName);
  const content = readFileSync(configPath, 'utf-8');
  const raw = parseYaml(content);

  const result = ManagerConfigSchema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Invalid manager config:\n${errors}`);
  }

  return result.data;
}

/**
 * Save manager config to profile
 *
 * @param profileName - Profile name (must be 'manager')
 * @param config - Manager config to save
 * @throws Error if profile is not in manager mode
 */
export function saveManagerConfig(
  profileName: string,
  config: ManagerConfig,
): void {
  if (!isManagerMode(profileName)) {
    throw new Error('Profile is not in manager mode');
  }

  const configPath = getProfileConfigPath(profileName);
  const content = stringifyYaml(config, {
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  });
  writeFileSync(configPath, content, 'utf-8');
}

/**
 * Get report by ID
 *
 * @param config - Manager config
 * @param reportId - Report ID
 * @returns Report config or undefined
 */
export function getReport(
  config: ManagerConfig,
  reportId: string,
): ReportConfig | undefined {
  return config.reports.find((r) => generateReportId(r.name) === reportId);
}

/**
 * Check if report ID exists
 *
 * @param config - Manager config
 * @param reportId - Report ID to check
 * @returns True if exists
 */
export function reportExists(config: ManagerConfig, reportId: string): boolean {
  return config.reports.some((r) => generateReportId(r.name) === reportId);
}

/**
 * Add report to config
 *
 * @param profileName - Manager profile name
 * @param report - Report config to add
 * @throws Error if report with same ID already exists or name is invalid
 */
export function addReport(profileName: string, report: ReportConfig): void {
  if (!validateReportName(report.name)) {
    throw new Error('Invalid report name');
  }

  const config = loadManagerConfig(profileName);
  const reportId = generateReportId(report.name);

  if (reportExists(config, reportId)) {
    throw new Error(`Report "${report.name}" (${reportId}) already exists`);
  }

  config.reports.push(report);
  saveManagerConfig(profileName, config);

  // Create report directory structure
  ensureReportDirs(profileName, reportId);
}

/**
 * Remove report from config
 *
 * @param profileName - Manager profile name
 * @param reportId - Report ID to remove
 * @param deleteData - Whether to delete report data directory
 * @throws Error if report not found
 */
export function removeReport(
  profileName: string,
  reportId: string,
  deleteData: boolean,
): void {
  const config = loadManagerConfig(profileName);

  const index = config.reports.findIndex(
    (r) => generateReportId(r.name) === reportId,
  );

  if (index === -1) {
    throw new Error(`Report "${reportId}" not found`);
  }

  config.reports.splice(index, 1);
  saveManagerConfig(profileName, config);

  if (deleteData) {
    const { rmSync } = require('node:fs');
    const { join } = require('node:path');
    const reportPath = join(getProfileDir(profileName), 'reports', reportId);
    rmSync(reportPath, { recursive: true, force: true });
  }
}

/**
 * Update report repos or Jira projects
 *
 * @param profileName - Manager profile name
 * @param reportId - Report ID
 * @param options - Update options
 * @throws Error if report not found
 */
export function updateReport(
  profileName: string,
  reportId: string,
  options: {
    addRepo?: string;
    removeRepo?: string;
    addJiraProject?: string;
    removeJiraProject?: string;
  },
): void {
  const config = loadManagerConfig(profileName);
  const report = getReport(config, reportId);

  if (!report) {
    throw new Error(`Report "${reportId}" not found`);
  }

  if (options.addRepo && !report.repos.includes(options.addRepo)) {
    report.repos.push(options.addRepo);
  }

  if (options.removeRepo) {
    report.repos = report.repos.filter((r) => r !== options.removeRepo);
  }

  if (
    options.addJiraProject &&
    !report.jiraProjects.includes(options.addJiraProject)
  ) {
    report.jiraProjects.push(options.addJiraProject);
  }

  if (options.removeJiraProject) {
    report.jiraProjects = report.jiraProjects.filter(
      (p) => p !== options.removeJiraProject,
    );
  }

  saveManagerConfig(profileName, config);
}

/**
 * List all reports with metadata
 *
 * @param profileName - Manager profile name
 * @returns Array of report metadata
 */
export function listReports(profileName: string): ReportMetadata[] {
  const config = loadManagerConfig(profileName);

  return config.reports.map((report) => {
    const reportId = generateReportId(report.name);

    return {
      id: reportId,
      name: report.name,
      github: report.github,
      email: report.email,
      repoCount: report.repos.length,
      jiraProjectCount: report.jiraProjects.length,
      lastFetchTime: undefined, // TODO: Read from report metadata file
    };
  });
}
