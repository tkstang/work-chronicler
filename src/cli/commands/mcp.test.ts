import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { mcpCommand } from './mcp';

// The tools the server registers, as MCP clients list them
const tools = JSON.parse(
  readFileSync(
    join(import.meta.dirname, '..', '..', 'mcp', 'tools-list.golden.json'),
    'utf-8',
  ),
) as { name: string }[];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mcp --info', () => {
  it('lists every tool the server registers, and only those', async () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.join(' '));
    });

    await mcpCommand.parseAsync(['--info'], { from: 'user' });

    const listed = lines
      .map((line) => /^ {2}- ([a-z_]+):/.exec(line)?.[1])
      .filter((name): name is string => Boolean(name));
    expect(listed.sort()).toEqual(tools.map((tool) => tool.name).sort());
  });
});
