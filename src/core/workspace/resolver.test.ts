import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getReportAnalysisDir,
  getReportOutputsDir,
  getReportWorkLogDir,
  isManagerMode,
} from './resolver';

// Manager mode is read from each profile's config.yaml, so every test runs
// against a temporary workspace with real profile configs.
let root: string;

function writeProfileConfig(profile: string, yaml: string): void {
  const dir = join(root, 'profiles', profile);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.yaml'), yaml);
}

const MANAGER_YAML = [
  'mode: "manager"',
  'github:',
  '  org: "acme"',
  'fetch:',
  '  since: "2026-01-01"',
  'reports: []',
].join('\n');

const IC_YAML = [
  'github:',
  '  username: octocat',
  '  orgs: []',
  'fetch:',
  '  since: "2026-01-01"',
].join('\n');

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wc-resolver-'));
  vi.stubEnv('HOME', join(root, 'home'));
  vi.stubEnv('WORK_CHRONICLER_HOME', root);
  writeProfileConfig('team-leads', MANAGER_YAML);
  // An IC profile that happens to be named "manager"
  writeProfileConfig('manager', IC_YAML);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe('isManagerMode', () => {
  it('is true for a profile whose config declares mode: manager, whatever its name', () => {
    expect(isManagerMode('team-leads')).toBe(true);
  });

  it('is false for an IC profile named "manager"', () => {
    expect(isManagerMode('manager')).toBe(false);
  });

  it('is false for a profile without a config or with unparseable YAML', () => {
    expect(isManagerMode('missing')).toBe(false);
    writeProfileConfig('broken', 'mode: [manager\n');
    expect(isManagerMode('broken')).toBe(false);
  });
});

describe('report paths for a manager profile with a custom name', () => {
  const profileDir = () => join(root, 'profiles', 'team-leads');

  it('resolves per-report work-log, analysis and outputs directories', () => {
    expect(getReportWorkLogDir('team-leads', 'alice-smith')).toBe(
      join(profileDir(), 'reports', 'alice-smith', 'work-log'),
    );
    expect(getReportAnalysisDir('team-leads', 'alice-smith')).toBe(
      join(profileDir(), 'reports', 'alice-smith', 'analysis'),
    );
    expect(getReportOutputsDir('team-leads', 'alice-smith')).toBe(
      join(profileDir(), 'reports', 'alice-smith', 'outputs'),
    );
  });

  it('resolves team-level analysis and outputs without a report ID', () => {
    expect(getReportAnalysisDir('team-leads', '')).toBe(
      join(profileDir(), 'analysis'),
    );
    expect(getReportOutputsDir('team-leads', '')).toBe(
      join(profileDir(), 'outputs'),
    );
  });

  it('requires a report ID for the work-log directory', () => {
    expect(() => getReportWorkLogDir('team-leads', '')).toThrow(
      'Report ID required',
    );
  });
});

describe('report paths for an IC profile named "manager"', () => {
  it('falls back to the profile work log', () => {
    const workLog = join(root, 'profiles', 'manager', 'work-log');
    expect(getReportWorkLogDir('manager', 'alice-smith')).toBe(workLog);
    expect(getReportAnalysisDir('manager', 'alice-smith')).toBe(
      join(workLog, '.analysis'),
    );
    expect(getReportOutputsDir('manager', 'alice-smith')).toBe(
      join(root, 'profiles', 'manager', 'outputs'),
    );
  });
});
