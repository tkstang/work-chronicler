import {
  chmodSync,
  cpSync,
  lstatSync,
  readdirSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import { getImportedRecordFilePath } from '@storage/paths';
import { afterEach, describe, expect, it } from 'vitest';

import { createImportEnv, type ImportEnv, nodeImportFs } from './import-fs';
import {
  countingFs,
  crashAfterFs,
  crashingFs,
  doubleFaultFs,
  fastFs,
  faultyFs,
  fsError,
  hookedFs,
  makeWorld,
  messageFrontmatter,
  slackIdentity,
  snapshot,
  stage,
  storeRecord,
  SYNTH_SOURCES,
} from './import.test-support';
import { type ImportRunOptions, runImport } from './index';

/** The exhaustive loops run an import per operation; give slow CI room */
const EXHAUSTIVE = { timeout: 120_000 };

// Threat-matrix coverage for the destructive half of import: the lock, the
// write-ahead journal, commit, rollback and recovery. The invariant under
// every failure: the work log holds the old batch or the new batch, never a
// mix, and only a fully stored batch is ever reported as imported.

type World = ReturnType<typeof makeWorld> & { empty: string };

const worlds: string[] = [];
afterEach(() => {
  for (const base of worlds.splice(0)) {
    rmSync(base, { recursive: true, force: true });
  }
});

function world(): World {
  const w = makeWorld();
  worlds.push(w.base);
  const empty = join(w.base, 'empty');
  mkdirSync(empty);
  return { ...w, empty };
}

/** A process that is about to die (its PID is not running afterwards) */
const DEAD_PID = 4_000_001;

function env(overrides: Partial<ImportEnv> = {}): ImportEnv {
  return { ...createImportEnv(), ...overrides };
}

/** A later run that finds the earlier process gone */
function laterEnv(overrides: Partial<ImportEnv> = {}): ImportEnv {
  return env({ isProcessAlive: () => false, ...overrides });
}

function importInto(
  w: World,
  options: Partial<ImportRunOptions> = {},
): ReturnType<typeof runImport> {
  return runImport({
    mode: 'import',
    stagingDir: w.staging,
    workLogRoot: w.workLog,
    target: { kind: 'ic' },
    sources: SYNTH_SOURCES,
    ...options,
  });
}

/** Run an import of nothing, which recovers an interrupted import */
function recover(w: World, overrides: Partial<ImportEnv> = {}) {
  return importInto(w, { stagingDir: w.empty, env: laterEnv(overrides) });
}

const hidden = (snap: Record<string, string>) =>
  Object.keys(snap).filter((path) => path.startsWith('.import'));

/** Record files only (no import bookkeeping) */
function records(dir: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(snapshot(dir)).filter(([p]) => !p.startsWith('.import')),
  );
}

const scenarios = [
  {
    name: 'a fresh work log',
    setup: (w: World) => {
      stage(w.staging, 'a.md', messageFrontmatter(1));
      stage(w.staging, 'b.md', messageFrontmatter(2));
    },
  },
  {
    name: 'an update, a create and an unchanged record',
    setup: (w: World) => {
      storeRecord(w.workLog, 1, 'Old body.');
      storeRecord(w.workLog, 3, 'Same body.');
      storeRecord(w.workLog, 4, 'Not in the batch.');
      stage(w.staging, 'a.md', messageFrontmatter(1), 'New body.');
      stage(w.staging, 'b.md', messageFrontmatter(2));
      stage(w.staging, 'c.md', messageFrontmatter(3), 'Same body.');
    },
  },
];

/** Run one clean import to learn the before and after states */
function reference(setup: (w: World) => void) {
  const w = world();
  setup(w);
  const before = snapshot(w.workLog);
  const { fs, counts } = countingFs(nodeImportFs);
  const result = importInto(w, { env: env({ fs }) });
  expect(result.ok).toBe(true);
  return { before, after: snapshot(w.workLog), counts };
}

describe('import: committing a batch', () => {
  it('stores every record and leaves no bookkeeping behind', () => {
    const w = world();
    scenarios[1]?.setup(w);
    const untouched = getImportedRecordFilePath(w.workLog, slackIdentity(4));
    const untouchedBefore = readFileSync(untouched, 'utf-8');

    const result = importInto(w);

    expect(result.ok).toBe(true);
    expect(result.summary).toEqual({
      records: 3,
      created: 1,
      updated: 1,
      unchanged: 1,
    });
    expect(
      readFileSync(
        getImportedRecordFilePath(w.workLog, slackIdentity(1)),
        'utf-8',
      ),
    ).toContain('New body.');
    expect(readFileSync(untouched, 'utf-8')).toBe(untouchedBefore);
    expect(hidden(snapshot(w.workLog))).toEqual([]);
  });

  it('is idempotent: importing the same batch again changes nothing', () => {
    const w = world();
    scenarios[0]?.setup(w);
    expect(importInto(w).ok).toBe(true);
    const once = snapshot(w.workLog);

    const again = importInto(w);

    expect(again.ok).toBe(true);
    expect(again.summary).toMatchObject({
      created: 0,
      updated: 0,
      unchanged: 2,
    });
    expect(snapshot(w.workLog)).toEqual(once);
  });

  it('leaves the work log untouched when the batch is rejected', () => {
    const w = world();
    scenarios[1]?.setup(w);
    writeFileSync(join(w.staging, 'z.md'), '---\nnot: [valid\n---\n');
    const before = snapshot(w.workLog);

    const result = importInto(w);

    expect(result.ok).toBe(false);
    expect(snapshot(w.workLog)).toEqual(before);
  });
});

describe('import: paths changing between validation and commit', () => {
  /** Run `change` once, just before the transaction directory is created */
  function changeBeforeCommit(change: () => void): ImportEnv {
    let done = false;
    return env({
      fs: hookedFs(nodeImportFs, (op, args) => {
        if (
          !done &&
          op === 'mkdir' &&
          String(args[0]).endsWith('.import-transaction')
        ) {
          done = true;
          change();
        }
      }),
    });
  }

  it('refuses when a directory is swapped for a symlink, writing nothing through it', () => {
    const w = world();
    scenarios[1]?.setup(w);
    const slackDir = join(w.workLog, 'messages', 'slack');
    const moved = join(w.outside, 'slack-moved');
    const before = records(w.workLog);

    const result = importInto(w, {
      env: changeBeforeCommit(() => {
        renameSync(slackDir, moved);
        symlinkSync(moved, slackDir);
      }),
    });

    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('CHANGED_DURING_IMPORT');
    // The real directory, now outside, holds exactly what it held before
    rmSync(slackDir);
    renameSync(moved, slackDir);
    expect(records(w.workLog)).toEqual(before);
    expect(hidden(snapshot(w.workLog))).toEqual([]);
  });

  it('refuses when a stored record is edited, keeping the edit', () => {
    const w = world();
    scenarios[1]?.setup(w);
    const dest = getImportedRecordFilePath(w.workLog, slackIdentity(1));

    const result = importInto(w, {
      env: changeBeforeCommit(() => writeFileSync(dest, 'edited meanwhile')),
    });

    expect(result.issues[0]?.code).toBe('CHANGED_DURING_IMPORT');
    expect(readFileSync(dest, 'utf-8')).toBe('edited meanwhile');
  });

  it('refuses when a new destination appears, keeping what appeared', () => {
    const w = world();
    scenarios[1]?.setup(w);
    const dest = getImportedRecordFilePath(w.workLog, slackIdentity(2));

    const result = importInto(w, {
      env: changeBeforeCommit(() => writeFileSync(dest, 'created meanwhile')),
    });

    expect(result.issues[0]?.code).toBe('CHANGED_DURING_IMPORT');
    expect(readFileSync(dest, 'utf-8')).toBe('created meanwhile');
    // The update planned alongside it was not applied either
    expect(
      readFileSync(
        getImportedRecordFilePath(w.workLog, slackIdentity(1)),
        'utf-8',
      ),
    ).toContain('Old body.');
  });

  it('refuses when the work log itself is replaced', () => {
    const w = world();
    scenarios[1]?.setup(w);
    const before = records(w.workLog);
    const old = join(w.base, 'work-log-old');

    const result = importInto(w, {
      env: changeBeforeCommit(() => {
        renameSync(w.workLog, old);
        mkdirSync(w.workLog);
      }),
    });

    expect(result.issues[0]?.code).toBe('CHANGED_DURING_IMPORT');
    expect(records(old)).toEqual(before);
    expect(records(w.workLog)).toEqual({});
  });

  it('rolls back records already stored when a later destination changes', () => {
    const w = world();
    scenarios[0]?.setup(w);
    const first = getImportedRecordFilePath(w.workLog, slackIdentity(1));
    const second = getImportedRecordFilePath(w.workLog, slackIdentity(2));
    let done = false;

    const result = importInto(w, {
      env: env({
        fs: hookedFs(nodeImportFs, (op) => {
          // After the first record is stored, someone creates the second
          if (!done && op !== 'link' && existsSync(first)) {
            done = true;
            writeFileSync(second, 'created meanwhile');
          }
        }),
      }),
    });

    expect(result.issues[0]?.code).toBe('CHANGED_DURING_IMPORT');
    expect(existsSync(first)).toBe(false);
    expect(readFileSync(second, 'utf-8')).toBe('created meanwhile');
  });
});

describe('import: failures and interruption at every step', () => {
  describe.each(scenarios)('with $name', ({ setup }) => {
    it(
      'keeps the old batch or the new batch when any single operation fails',
      EXHAUSTIVE,
      () => {
        const { before, after, counts } = reference(setup);
        for (let failAt = 1; failAt <= counts.all; failAt++) {
          const w = world();
          setup(w);
          const result = importInto(w, {
            env: env({ fs: faultyFs(fastFs, failAt) }),
          });
          const label = `operation ${failAt} of ${counts.all} failed`;
          // Reference runs leave no bookkeeping, so before/after are records only
          expect(records(w.workLog), label).toEqual(result.ok ? after : before);
          // Whatever bookkeeping a failed cleanup left, a later import clears
          expect(recover(w).ok, label).toBe(true);
          expect(snapshot(w.workLog), label).toEqual(
            result.ok ? after : before,
          );
        }
      },
    );

    it(
      'recovers to the old or the new batch after a crash at every write',
      EXHAUSTIVE,
      () => {
        const { before, after, counts } = reference(setup);
        for (let crashAt = 1; crashAt <= counts.mutating + 1; crashAt++) {
          const w = world();
          setup(w);
          const crashed = importInto(w, {
            env: env({ fs: crashingFs(fastFs, crashAt), pid: DEAD_PID }),
          });
          const recovered = recover(w);
          const final = snapshot(w.workLog);
          const label = `crash at write ${crashAt} of ${counts.mutating}`;

          expect(recovered.ok, label).toBe(true);
          if (isDeepStrictEqual(final, after)) {
            expect([undefined, 'completed'], label).toContain(
              recovered.recovery?.outcome,
            );
          } else {
            expect(final, label).toEqual(before);
            expect(crashed.ok, label).toBe(false);
            expect(recovered.recovery?.outcome, label).not.toBe('completed');
          }
        }
      },
    );
  });

  it(
    'never reports a mix when handling a failure fails too',
    EXHAUSTIVE,
    () => {
      // A first failure anywhere, then a second one in the rollback or
      // cleanup that follows (the first three changes it makes).
      const setup = scenarios[1]?.setup ?? (() => {});
      const { before, after, counts } = reference(setup);
      for (let first = 1; first <= counts.all; first++) {
        for (let then = 1; then <= 3; then++) {
          const w = world();
          setup(w);
          const result = importInto(w, {
            env: env({ fs: doubleFaultFs(fastFs, first, then) }),
          });
          const recovered = recover(w);
          const final = snapshot(w.workLog);
          const label = `operation ${first} failed, then change ${then} after it`;

          expect(recovered.ok, label).toBe(true);
          if (isDeepStrictEqual(final, after)) {
            expect([undefined, 'completed'], label).toContain(
              recovered.recovery?.outcome,
            );
          } else {
            expect(final, label).toEqual(before);
            expect(result.ok, label).toBe(false);
            expect(recovered.recovery?.outcome, label).not.toBe('completed');
          }
        }
      }
    },
  );

  describe('once the batch is recorded as stored', () => {
    const setup = scenarios[1]?.setup ?? (() => {});
    const isCommittedJournal = (path: string) =>
      JSON.parse(readFileSync(path, 'utf-8')).state === 'committed';

    /**
     * Fail the directory sync after the `committed` journal is in place,
     * and every later operation that `also` matches.
     */
    function failAfterCommitted(
      also: (op: string, path: string) => boolean,
    ): ImportEnv {
      let committed = false;
      return env({
        fs: hookedFs(nodeImportFs, (op, args) => {
          const path = String(args[0]);
          if (
            committed &&
            op === 'syncDirectory' &&
            path.endsWith('.import-transaction')
          ) {
            throw fsError('EIO');
          }
          if (committed && also(op, path)) throw fsError('EIO');
          if (op === 'rename' && path.endsWith('journal.json.tmp')) {
            committed = isCommittedJournal(path);
          }
        }),
      });
    }

    it('keeps the stored batch when a later flush and a restore would fail', () => {
      const { after } = reference(setup);
      const w = world();
      setup(w);

      const result = importInto(w, {
        env: failAfterCommitted(
          (op, path) =>
            op === 'rename' &&
            path.includes(`${join('.import-transaction', 'backup')}`),
        ),
      });

      expect(result.ok).toBe(true);
      expect(result.warnings.join('\n')).toContain('could not be flushed');
      expect(snapshot(w.workLog)).toEqual(after);
      expect(recover(w).ok).toBe(true);
      expect(snapshot(w.workLog)).toEqual(after);
    });

    it('reports completed only for a stored batch when cleanup also fails', () => {
      const { after } = reference(setup);
      const w = world();
      setup(w);

      const result = importInto(w, {
        env: failAfterCommitted(
          (op, path) => op === 'rename' && path.endsWith('.import-transaction'),
        ),
      });
      const recovered = recover(w);

      expect(result.ok).toBe(true);
      expect(recovered.ok).toBe(true);
      expect(recovered.recovery?.outcome).toBe('completed');
      expect(snapshot(w.workLog)).toEqual(after);
    });

    it('does not call a recorded batch completed when a record lacks its new version', () => {
      const w = world();
      setup(w);
      const dest = getImportedRecordFilePath(w.workLog, slackIdentity(1));
      importInto(w, {
        env: env({
          fs: crashAfterFs(
            nodeImportFs,
            (op, args) =>
              op === 'rename' &&
              String(args[1]).endsWith('journal.json') &&
              isCommittedJournal(String(args[1])),
          ),
          pid: DEAD_PID,
        }),
      });
      writeFileSync(dest, 'edited after the interruption');

      const result = recover(w);

      expect(result.ok).toBe(false);
      expect(result.recovery).toBeNull();
      expect(result.issues).toEqual([
        expect.objectContaining({ code: 'RECOVERY_CONFLICT' }),
      ]);
      expect(readFileSync(dest, 'utf-8')).toBe('edited after the interruption');
      expect(existsSync(join(w.workLog, '.import-transaction'))).toBe(true);
    });
  });

  it('recovers after a crash during recovery itself', EXHAUSTIVE, () => {
    const setup = scenarios[1]?.setup ?? (() => {});
    const { before } = reference(setup);
    const updated = (args: unknown[]) =>
      String(args[1]).includes(join('messages', 'slack'));
    let interrupted = 0;
    for (let crashAt = 1; crashAt <= 40; crashAt++) {
      const w = world();
      setup(w);
      // Crash right after the first record is replaced, mid-commit
      importInto(w, {
        env: env({
          fs: crashAfterFs(
            fastFs,
            (op, args) => op === 'rename' && updated(args),
          ),
          pid: DEAD_PID,
        }),
      });
      // Then crash the recovering process too
      importInto(w, {
        stagingDir: w.empty,
        env: laterEnv({
          fs: crashingFs(fastFs, crashAt),
          pid: DEAD_PID + 1,
        }),
      });
      const final = recover(w);
      expect(final.ok, `recovery crash ${crashAt}`).toBe(true);
      expect(snapshot(w.workLog), `recovery crash ${crashAt}`).toEqual(before);
      if (final.recovery?.outcome === 'rolled-back') interrupted++;
    }
    // Some crashes landed before the rollback finished
    expect(interrupted).toBeGreaterThan(0);
  });

  it.skipIf(process.getuid?.() === 0 || process.platform === 'win32')(
    'keeps the old batch when the destination directory is read-only (real permissions)',
    () => {
      const w = world();
      scenarios[1]?.setup(w);
      const before = snapshot(w.workLog);
      const slackDir = join(w.workLog, 'messages', 'slack');
      chmodSync(slackDir, 0o555);
      try {
        const result = importInto(w);
        expect(result.ok).toBe(false);
      } finally {
        chmodSync(slackDir, 0o755);
      }
      expect(snapshot(w.workLog)).toEqual(before);
    },
  );
});

describe('import: interrupted imports and the lock', () => {
  /** Leave an import interrupted with its lock held, before any commit */
  function interruptHoldingLock(w: World) {
    importInto(w, {
      env: env({
        fs: crashAfterFs(
          nodeImportFs,
          (op, args) =>
            op === 'link' && String(args[1]).endsWith('.import-lock'),
        ),
        pid: DEAD_PID,
      }),
    });
  }

  /** Leave an import interrupted mid-commit (first record replaced) */
  function interruptMidCommit(w: World) {
    const dest = getImportedRecordFilePath(w.workLog, slackIdentity(1));
    importInto(w, {
      env: env({
        fs: crashAfterFs(
          nodeImportFs,
          (op, args) => op === 'rename' && args[1] === dest,
        ),
        pid: DEAD_PID,
      }),
    });
    return dest;
  }

  it('refuses while the lock holder is still running', () => {
    const w = world();
    scenarios[1]?.setup(w);
    interruptHoldingLock(w);
    const before = snapshot(w.workLog);

    const result = importInto(w, { env: env({ isProcessAlive: () => true }) });

    expect(result.issues.map((i) => i.code)).toEqual(['IMPORT_IN_PROGRESS']);
    expect(snapshot(w.workLog)).toEqual(before);
  });

  it('refuses a lock held from another machine', () => {
    const w = world();
    scenarios[1]?.setup(w);
    interruptHoldingLock(w);

    const result = importInto(w, {
      env: laterEnv({ hostname: 'another-synthetic-host' }),
    });

    expect(result.issues.map((i) => i.code)).toEqual(['IMPORT_IN_PROGRESS']);
  });

  it('takes over a lock taken before the machine last booted', () => {
    const w = world();
    scenarios[1]?.setup(w);
    interruptHoldingLock(w);

    const result = importInto(w, {
      // The PID is in use again, but by a process started after a reboot
      env: env({ isProcessAlive: () => true, bootTime: () => Date.now() + 1 }),
    });

    expect(result.ok).toBe(true);
    expect(hidden(snapshot(w.workLog))).toEqual([]);
  });

  it('rolls an interrupted batch back, reports it, then imports the new batch', () => {
    const w = world();
    scenarios[1]?.setup(w);
    const { after } = reference(scenarios[1]?.setup ?? (() => {}));
    interruptMidCommit(w);

    const result = importInto(w, { env: laterEnv() });

    expect(result.ok).toBe(true);
    expect(result.recovery).toMatchObject({
      outcome: 'rolled-back',
      records: 2,
    });
    expect(snapshot(w.workLog)).toEqual(after);
  });

  it('stops without guessing when a record changed after the interruption', () => {
    const w = world();
    scenarios[1]?.setup(w);
    const dest = interruptMidCommit(w);
    writeFileSync(dest, 'edited after the interruption');

    const result = recover(w);
    const check = runImport({
      mode: 'validate',
      stagingDir: w.empty,
      workLogRoot: w.workLog,
      target: { kind: 'ic' },
      sources: SYNTH_SOURCES,
      env: laterEnv(),
    });

    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({
      code: 'RECOVERY_CONFLICT',
      destination: expect.stringMatching(/^messages\/slack\/[0-9a-f]{32}\.md$/),
    });
    expect(result.recovery).toBeNull();
    expect(readFileSync(dest, 'utf-8')).toBe('edited after the interruption');
    expect(existsSync(join(w.workLog, '.import-transaction'))).toBe(true);
    expect(check.issues.map((i) => i.code)).toEqual(['RECOVERY_REQUIRED']);
  });

  it('validate reports an interrupted import without touching it', () => {
    const w = world();
    scenarios[1]?.setup(w);
    interruptMidCommit(w);
    const before = snapshot(w.workLog);

    const dead = runImport({
      mode: 'validate',
      stagingDir: w.staging,
      workLogRoot: w.workLog,
      target: { kind: 'ic' },
      sources: SYNTH_SOURCES,
      env: laterEnv(),
    });
    const alive = runImport({
      mode: 'validate',
      stagingDir: w.staging,
      workLogRoot: w.workLog,
      target: { kind: 'ic' },
      sources: SYNTH_SOURCES,
      env: env({ isProcessAlive: () => true }),
    });

    expect(dead.issues.map((i) => i.code)).toEqual(['RECOVERY_REQUIRED']);
    expect(alive.issues.map((i) => i.code)).toEqual(['IMPORT_IN_PROGRESS']);
    expect(snapshot(w.workLog)).toEqual(before);
  });

  it('does not take over when the lock cannot be read', () => {
    const w = world();
    scenarios[1]?.setup(w);
    interruptHoldingLock(w);
    const lock = join(w.workLog, '.import-lock');

    const result = importInto(w, {
      env: laterEnv({
        fs: hookedFs(nodeImportFs, (op, args) => {
          if (op === 'readFile' && args[0] === lock) throw fsError('EACCES');
        }),
      }),
    });

    expect(result.issues.map((i) => i.code)).toEqual(['IMPORT_IN_PROGRESS']);
    expect(existsSync(lock)).toBe(true);
  });
});

describe('import: containment of bookkeeping and cleanup', () => {
  const setupFresh = scenarios[0]?.setup ?? (() => {});
  const setupUpdate = scenarios[1]?.setup ?? (() => {});

  /** Run `change` once, just before `path` is created or moved into place */
  function beforePlacing(path: string, change: () => void): ImportEnv {
    let done = false;
    return env({
      fs: hookedFs(nodeImportFs, (op, args) => {
        const target =
          op === 'mkdir' ? args[0] : op === 'rename' ? args[1] : undefined;
        if (!done && target === path) {
          done = true;
          change();
        }
      }),
    });
  }

  it('leaves an outside directory alone when a new directory is swapped for a symlink', () => {
    // Gate H1: messages/ becomes a link to outside/ (holding slack/) just
    // before import puts messages/ in place.
    const w = world();
    setupFresh(w);
    mkdirSync(join(w.outside, 'slack'));
    const outsideBefore = snapshot(w.outside);
    const messages = join(w.workLog, 'messages');

    const result = importInto(w, {
      env: beforePlacing(messages, () => symlinkSync(w.outside, messages)),
    });
    const later = recover(w);

    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('CHANGED_DURING_IMPORT');
    expect(later.ok).toBe(true);
    expect(snapshot(w.outside)).toEqual(outsideBefore);
  });

  it('refuses to act through a new directory swapped for a symlink after it is placed', () => {
    const w = world();
    setupFresh(w);
    mkdirSync(join(w.outside, 'slack'));
    const outsideBefore = snapshot(w.outside);
    const messages = join(w.workLog, 'messages');
    let placed = false;
    let swapped = false;

    const result = importInto(w, {
      env: env({
        fs: hookedFs(nodeImportFs, (op, args) => {
          if (placed && !swapped) {
            swapped = true;
            renameSync(messages, join(w.base, 'moved-messages'));
            symlinkSync(w.outside, messages);
          }
          if (op === 'rename' && args[1] === messages) placed = true;
        }),
      }),
    });
    const later = recover(w);

    expect(swapped).toBe(true);
    expect(result.ok).toBe(false);
    // Recovery cannot vouch for messages/ now, so it stops rather than guess
    expect(later.ok).toBe(false);
    expect(later.issues.map((i) => i.code)).toEqual(['RECOVERY_CONFLICT']);
    expect(snapshot(w.outside)).toEqual(outsideBefore);
  });

  /** Interrupt a two-record update right after the first record is replaced */
  function interruptTwoUpdates(w: World) {
    storeRecord(w.workLog, 1, 'Old one.');
    storeRecord(w.workLog, 2, 'Old two.');
    stage(w.staging, 'a.md', messageFrontmatter(1), 'New one.');
    stage(w.staging, 'b.md', messageFrontmatter(2), 'New two.');
    importInto(w, {
      env: env({
        fs: crashAfterFs(
          nodeImportFs,
          (op, args) =>
            op === 'rename' &&
            String(args[1]).includes(join('messages', 'slack')),
        ),
        pid: DEAD_PID,
      }),
    });
  }

  it.each([
    [
      'a symlink',
      (backup: string, moved: string) => {
        renameSync(backup, moved);
        symlinkSync(moved, backup);
      },
    ],
    [
      'another directory',
      (backup: string, moved: string) => {
        renameSync(backup, moved);
        cpSync(moved, backup, { recursive: true });
      },
    ],
  ])(
    'refuses to recover through a backup directory replaced by %s',
    (_label, replace) => {
      // Gate H2
      const w = world();
      interruptTwoUpdates(w);
      const backup = join(w.workLog, '.import-transaction', 'backup');
      const moved = join(w.outside, 'backup');
      replace(backup, moved);
      const outsideBefore = snapshot(w.outside);

      const result = recover(w);

      expect(result.ok).toBe(false);
      expect(result.recovery).toBeNull();
      expect(result.issues.map((i) => i.code)).toContain('RECOVERY_CONFLICT');
      expect(snapshot(w.outside)).toEqual(outsideBefore);
      expect(existsSync(join(w.workLog, '.import-transaction'))).toBe(true);
    },
  );

  /** Every directory below `root`, deepest first */
  function directories(root: string, rel = ''): string[] {
    const found: string[] = [];
    for (const name of readdirSync(join(root, rel))) {
      const path = rel ? join(rel, name) : name;
      if (lstatSync(join(root, path)).isDirectory()) {
        found.push(...directories(root, path), path);
      }
    }
    return found;
  }

  describe.each([
    ['a fresh work log', setupFresh],
    ['an update, a create and an unchanged record', setupUpdate],
  ])('with %s', (_name, setup) => {
    it(
      'never acts through a directory swapped for a symlink before recovery',
      EXHAUSTIVE,
      () => {
        const { counts } = reference(setup);
        let probes = 0;
        for (let crashAt = 1; crashAt <= counts.mutating; crashAt++) {
          const probe = world();
          setup(probe);
          importInto(probe, {
            env: env({ fs: crashingFs(fastFs, crashAt), pid: DEAD_PID }),
          });
          for (const dir of directories(probe.workLog)) {
            // Same crash, then `dir` replaced by a link to an exact copy
            const w = world();
            setup(w);
            importInto(w, {
              env: env({ fs: crashingFs(fastFs, crashAt), pid: DEAD_PID }),
            });
            const real = join(w.workLog, dir);
            if (!existsSync(real)) continue;
            const decoy = join(w.outside, 'decoy');
            cpSync(real, decoy, { recursive: true });
            renameSync(real, join(w.base, 'held'));
            symlinkSync(decoy, real);
            const decoyBefore = snapshot(decoy);

            const result = recover(w, { fs: fastFs });
            const label = `crash at write ${crashAt}, ${dir} linked`;

            expect(snapshot(decoy), label).toEqual(decoyBefore);
            // With a journal, recovery must check its bookkeeping first, so it
            // can never roll back or complete through a linked folder of it
            if (dir.startsWith('.import-transaction')) {
              expect(['completed', 'rolled-back'], label).not.toContain(
                result.recovery?.outcome,
              );
            }
            probes++;
          }
        }
        expect(probes).toBeGreaterThan(0);
      },
    );
  });
});
