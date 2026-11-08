import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  acquireWorkLogLock,
  type LockEnv,
  type LockFs,
  type LockOwner,
  ownerIsAlive,
  readWorkLogLock,
  WORK_LOG_LOCK_NAMES,
} from './work-log-lock';

// Whether a lock's owner still runs decides whether its lock may be taken
// over. Only proof that the owner is gone counts: a process on this machine
// that is not running, or that ran in an earlier boot (its recorded boot ID
// differs from this boot's). The wall clock never decides it, so a clock
// that jumps while a run holds the lock cannot get that lock taken over.

const owner = (overrides: Partial<LockOwner> = {}): LockOwner => ({
  version: 1,
  pid: 4242,
  hostname: 'this-host',
  startedAt: 2_000,
  runId: 'r1',
  ...overrides,
});

function env(overrides: Partial<LockEnv> = {}): LockEnv {
  return {
    pid: 1,
    hostname: 'this-host',
    now: () => 3_000,
    bootId: () => 'this-boot',
    isProcessAlive: () => true,
    ...overrides,
  };
}

describe('ownerIsAlive', () => {
  it('counts an owner on another machine as alive, whatever its process', () => {
    expect(
      ownerIsAlive(
        owner({ hostname: 'elsewhere', bootId: 'earlier-boot' }),
        env({ isProcessAlive: () => false }),
      ),
    ).toBe(true);
  });

  it('counts an owner whose process is not running as gone', () => {
    expect(
      ownerIsAlive(
        owner({ bootId: 'this-boot' }),
        env({ isProcessAlive: () => false }),
      ),
    ).toBe(false);
  });

  it('counts a running owner from this boot as alive', () => {
    expect(ownerIsAlive(owner({ bootId: 'this-boot' }), env())).toBe(true);
  });

  it('counts an owner from an earlier boot as gone, even when its PID is in use again', () => {
    expect(ownerIsAlive(owner({ bootId: 'earlier-boot' }), env())).toBe(false);
  });

  it.each<[string, Partial<LockEnv>]>([
    ['the clock jumped far ahead', { now: () => 9e15 }],
    ['the clock jumped back', { now: () => 0 }],
  ])('never counts a running owner as gone because %s', (_, clock) => {
    // startedAt is far before any plausible boot; only the process counts
    for (const recorded of [
      owner({ startedAt: 1, bootId: 'this-boot' }),
      owner({ startedAt: 1 }),
    ]) {
      expect(ownerIsAlive(recorded, env(clock))).toBe(true);
    }
  });

  it('keeps a running owner without a boot ID (a 0.6.0 lock) as alive', () => {
    expect(ownerIsAlive(owner(), env())).toBe(true);
    expect(ownerIsAlive(owner(), env({ isProcessAlive: () => false }))).toBe(
      false,
    );
  });

  it('falls back to the process when this boot has no known ID', () => {
    const recorded = owner({ bootId: 'earlier-boot' });
    expect(ownerIsAlive(recorded, env({ bootId: () => null }))).toBe(true);
    expect(
      ownerIsAlive(
        recorded,
        env({ bootId: () => null, isProcessAlive: () => false }),
      ),
    ).toBe(false);
  });
});

// The work-log lock is held under both 0.6.0 names, `.import-lock` then
// `.filter-lock`, so 0.7.0 runs exclude each other through the first, and a
// 0.6.0 `import` or `filter` (which take one name each) is excluded too.
describe('acquireWorkLogLock', () => {
  let dir: string;
  beforeEach(() => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'wc-lock-')));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const nodeLockFs: LockFs = {
    readFile: (path) => readFileSync(path),
    readdir: (path) => readdirSync(path),
    mtimeMs: (path) => lstatSync(path).mtimeMs,
    exists: (path) => existsSync(path),
    mkdir: (path) => mkdirSync(path),
    writeFile: (path, contents) => writeFileSync(path, contents),
    rename: (from, to) => renameSync(from, to),
    rm: (path) => rmSync(path, { recursive: true }),
  };

  let ids = 0;
  const take = (
    command: 'import' | 'filter',
    overrides: Partial<LockEnv> = {},
    fs: LockFs = nodeLockFs,
  ) =>
    acquireWorkLogLock({
      fs,
      env: env({ pid: 100, ...overrides }),
      dir,
      command,
      randomId: () => `id${++ids}`,
    });

  /** A lock as 0.6.0 left it: no boot ID, no command */
  function legacyLock(name: string, pid: number) {
    mkdirSync(join(dir, name));
    writeFileSync(
      join(dir, name, 'owner.json'),
      JSON.stringify({
        version: 1,
        pid,
        hostname: 'this-host',
        startedAt: 1,
        runId: `legacy-${pid}`,
      }),
    );
  }

  it('holds both names with one owner naming the command, and releases both', () => {
    const lock = take('filter');

    expect(lock.held).toBe(true);
    expect(readdirSync(dir).sort()).toEqual([...WORK_LOG_LOCK_NAMES].sort());
    const holders = readWorkLogLock(nodeLockFs, dir);
    expect(holders.map((h) => [h.name, h.command, h.owner?.bootId])).toEqual([
      ['.import-lock', 'filter', 'this-boot'],
      ['.filter-lock', 'filter', 'this-boot'],
    ]);
    expect(lock.held && lock.release()).toEqual([]);
    expect(readdirSync(dir)).toEqual([]);
  });

  it.each(['import', 'filter'] as const)(
    'refuses a second run (%s) while a run holds the lock, never touching it',
    (second) => {
      const first = take('import');
      const before = readFileSync(join(dir, '.import-lock', 'owner.json'));

      const refused = take(second, { pid: 200 });

      expect(refused).toMatchObject({
        held: false,
        reason: 'held',
        name: '.import-lock',
        owner: { pid: 100, command: 'import' },
      });
      expect(readFileSync(join(dir, '.import-lock', 'owner.json'))).toEqual(
        before,
      );
      expect(first.held && first.release()).toEqual([]);
    },
  );

  it.each(WORK_LOG_LOCK_NAMES)(
    'honors a live 0.6.0 lock under %s, and leaves nothing of its own behind',
    (name) => {
      legacyLock(name, 4242);

      const refused = take('import');

      expect(refused).toMatchObject({
        held: false,
        reason: 'held',
        name,
        owner: { pid: 4242 },
        warnings: [],
      });
      expect(readdirSync(dir)).toEqual([name]);
    },
  );

  it.each(WORK_LOG_LOCK_NAMES)(
    'takes over a 0.6.0 lock under %s once its owner has exited',
    (name) => {
      legacyLock(name, 4242);

      const lock = take('filter', {
        isProcessAlive: (pid) => pid !== 4242,
      });

      expect(lock.held).toBe(true);
      const runIds = readWorkLogLock(nodeLockFs, dir).map(
        (h) => h.owner?.runId,
      );
      expect(runIds).toHaveLength(2);
      expect(new Set(runIds).size).toBe(1);
      expect(lock.held && lock.owner.runId).toBe(runIds[0]);
      expect(lock.held && lock.release()).toEqual([]);
      expect(readdirSync(dir)).toEqual([]);
    },
  );

  it('releases the first name when taking the second throws', () => {
    const failing: LockFs = {
      ...nodeLockFs,
      mkdir: (path) => {
        if (path.includes('.filter-lock.claim-')) {
          throw Object.assign(new Error('injected'), { code: 'EIO' });
        }
        nodeLockFs.mkdir(path);
      },
    };

    expect(() => take('import', {}, failing)).toThrow('injected');
    expect(readdirSync(dir)).toEqual([]);
    expect(take('filter').held).toBe(true);
  });
});
