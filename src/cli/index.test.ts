import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

describe('work-chronicler --version', () => {
  it('prints the package.json version', () => {
    const { version } = JSON.parse(
      readFileSync(join(repoRoot, 'package.json'), 'utf-8'),
    ) as { version: string };

    // Isolate HOME so loading the CLI never reads the real workspace.
    const home = mkdtempSync(join(tmpdir(), 'wc-cli-version-'));
    try {
      const output = execFileSync(
        process.execPath,
        ['--import', 'tsx', 'src/cli/index.ts', '--version'],
        {
          cwd: repoRoot,
          encoding: 'utf-8',
          env: { PATH: process.env.PATH, HOME: home },
        },
      );
      expect(output.trim()).toBe(version);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('work-chronicler error handling', () => {
  it('prints a command failure without a stack trace and exits 1', () => {
    // Isolate HOME and the workspace so the command never sees real data.
    const home = mkdtempSync(join(tmpdir(), 'wc-cli-error-'));
    try {
      const result = spawnSync(
        process.execPath,
        ['--import', 'tsx', 'src/cli/index.ts', 'workspace', 'root'],
        {
          cwd: repoRoot,
          encoding: 'utf-8',
          env: {
            PATH: process.env.PATH,
            HOME: home,
            WORK_CHRONICLER_HOME: join(home, 'workspace'),
          },
        },
      );
      expect(result.status).toBe(1);
      expect(result.stderr.trimEnd()).toMatch(
        /(^|\n)Workspace not initialized\. Run `work-chronicler init` first\.$/,
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
