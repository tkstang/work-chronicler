import { describe, expect, it } from 'vitest';

import { type LockEnv, type LockOwner, ownerIsAlive } from './work-log-lock';

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
