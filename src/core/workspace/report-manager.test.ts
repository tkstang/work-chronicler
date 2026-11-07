import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadManagerConfig, updateReport } from './report-manager';

// `reports update` arguments come straight from the command line, while the
// stored keys are trimmed when the config loads. A key typed with stray
// whitespace must name the same stored project.
let root: string;

const MANAGER_YAML = [
  'mode: "manager"',
  'github:',
  '  org: "acme"',
  'fetch:',
  '  since: "2026-01-01"',
  'reports:',
  '  - name: "Alice Smith"',
  '    github: "alice"',
  '    email: "alice@example.com"',
  '    jiraProjects: ["PROJ", "OPS"]',
].join('\n');

function storedJiraProjects(): string[] {
  return loadManagerConfig('team').reports[0]?.jiraProjects ?? [];
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'wc-report-manager-'));
  vi.stubEnv('HOME', join(root, 'home'));
  vi.stubEnv('WORK_CHRONICLER_HOME', root);
  const dir = join(root, 'profiles', 'team');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'config.yaml'), MANAGER_YAML);
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

describe('updateReport JIRA project arguments', () => {
  it('removes a stored key given with surrounding whitespace', () => {
    updateReport('team', 'alice-smith', { removeJiraProject: ' PROJ ' });

    expect(storedJiraProjects()).toEqual(['OPS']);
  });

  it('does not add a second copy of a stored key given with whitespace', () => {
    updateReport('team', 'alice-smith', { addJiraProject: ' OPS' });

    expect(storedJiraProjects()).toEqual(['PROJ', 'OPS']);
  });
});
