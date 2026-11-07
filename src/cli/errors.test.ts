import chalk from 'chalk';
import { describe, expect, it } from 'vitest';

import { CliError, handleCliError, toCliError } from './errors';

function captureOutput() {
  const stderr: string[] = [];
  const stdout: string[] = [];
  return {
    stderr,
    stdout,
    output: {
      error: (text: string) => stderr.push(text),
      log: (text: string) => stdout.push(text),
    },
  };
}

describe('handleCliError', () => {
  it('prints a CliError message to stderr, its hint to stdout, and returns its exit code', () => {
    const { stderr, stdout, output } = captureOutput();

    const code = handleCliError(
      new CliError('Profile not found', { exitCode: 2, hint: 'Run init' }),
      output,
    );

    expect(code).toBe(2);
    expect(stderr).toEqual(['Profile not found']);
    expect(stdout).toEqual(['Run init']);
  });

  it('prints an unexpected error as "Error: <message>" and returns 1', () => {
    const { stderr, stdout, output } = captureOutput();

    const code = handleCliError(new TypeError('boom'), output);

    expect(code).toBe(1);
    expect(stderr).toEqual([`${chalk.red('Error:')} boom`]);
    expect(stdout).toEqual([]);
  });
});

describe('toCliError', () => {
  it('passes a CliError through so a command prefix is not added twice', () => {
    const original = new CliError('Must provide at least one option');

    expect(toCliError(original, 'Error:')).toBe(original);
  });

  it('prefixes other errors and falls back for non-Error values', () => {
    expect(toCliError(new Error('disk full'), 'Error:').message).toBe(
      'Error: disk full',
    );
    expect(toCliError('oops', 'Error:', 'Unknown error').message).toBe(
      'Error: Unknown error',
    );
  });
});
