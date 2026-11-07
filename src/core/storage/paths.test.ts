import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getPRDirectory, getPRFilePath } from './paths';

describe('PR storage paths', () => {
  it('never writes an org directory with a leading @', () => {
    const date = new Date('2025-03-04T12:00:00Z');

    expect(getPRFilePath('/wl', '@voxmedia', 'chorus', date, 42)).toBe(
      join('/wl', 'pull-requests', 'voxmedia', 'chorus', '2025-03-04_42.md'),
    );
    expect(getPRDirectory('/wl', '@voxmedia')).toBe(
      join('/wl', 'pull-requests', 'voxmedia'),
    );
    expect(() => getPRDirectory('/wl', '@@voxmedia')).toThrow(/@/);
  });
});
