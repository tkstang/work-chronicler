import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CLI version', () => {
  it('matches package.json version', () => {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
    ) as { version?: string };

    expect(pkg.version).toBeTruthy();

    const cliSource = readFileSync(
      new URL('../src/cli/index.ts', import.meta.url),
      'utf-8',
    );

    expect(cliSource).toMatch(
      new RegExp(`\\.version\\(['"\`]${pkg.version}['"\`]\\)`),
    );
  });
});
