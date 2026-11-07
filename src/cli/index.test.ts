import { execFileSync } from 'node:child_process';
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
