import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateContributorMatrix } from '../../../src/cli/analyzer/team';
import { getReportAnalysisDir } from '../../../src/core/workspace/resolver';

function writeProjects(reportId: string, names: string[]): void {
  const dir = getReportAnalysisDir('manager', reportId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'projects.json'),
    JSON.stringify({ projects: names.map((name) => ({ name })) }),
  );
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
});
