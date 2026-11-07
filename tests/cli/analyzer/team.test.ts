import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  aggregateTeamProjects,
  generateContributorMatrix,
} from '../../../src/cli/analyzer/team';
import type { ProjectGrouping } from '../../../src/core/types/project';
import { getReportAnalysisDir } from '../../../src/core/workspace/resolver';

function project(name: string): ProjectGrouping {
  return {
    projectId: name.toLowerCase().replace(/\s+/g, '-'),
    name,
    prUrls: [`https://github.com/acme/app/pull/${name.length}`],
    ticketKeys: [],
    signals: { sharedTickets: [], sharedLabels: [], commonKeywords: [] },
    confidence: 'high',
    dominantSignal: 'tickets',
    stats: {
      prCount: 1,
      ticketCount: 0,
      totalAdditions: 10,
      totalDeletions: 2,
      repos: ['acme/app'],
    },
  };
}

function writeAnalysis(reportId: string, projects: unknown): void {
  const dir = getReportAnalysisDir('manager', reportId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'projects.json'), JSON.stringify({ projects }));
}

function writeProjects(reportId: string, names: string[]): void {
  writeAnalysis(reportId, names.map(project));
}

describe('team contributor matrix', () => {
  let home: string;
  const originalHome = process.env.WORK_CHRONICLER_HOME;

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'wc-team-'));
    process.env.WORK_CHRONICLER_HOME = home;
  });

  afterEach(() => {
    if (originalHome === undefined) delete process.env.WORK_CHRONICLER_HOME;
    else process.env.WORK_CHRONICLER_HOME = originalHome;
    rmSync(home, { recursive: true, force: true });
  });

  // The matrix feeds performance-review material, so crediting a report with
  // a teammate's project would put false evidence in someone's review.
  it('credits each report only with projects from its own analysis', async () => {
    writeProjects('alice', ['Checkout revamp', 'Shared platform']);
    writeProjects('bob', ['Search relevance', 'Shared platform']);

    const matrix = await generateContributorMatrix('manager', [
      'alice',
      'bob',
      'carol',
    ]);

    expect(matrix).toEqual({
      alice: ['Checkout revamp', 'Shared platform'],
      bob: ['Search relevance', 'Shared platform'],
      carol: [],
    });
  });

  it('skips a malformed report instead of aborting the team rollup', async () => {
    writeAnalysis('broken', [null]);
    writeProjects('alice', ['Checkout revamp']);

    const projects = await aggregateTeamProjects('manager', [
      'broken',
      'alice',
    ]);
    const matrix = await generateContributorMatrix('manager', [
      'broken',
      'alice',
    ]);

    expect(projects.map((p) => p.name)).toEqual(['Checkout revamp']);
    expect(matrix).toEqual({ broken: [], alice: ['Checkout revamp'] });
  });
});
