import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { createImportEnv, nodeImportFs } from '@core/import/import-fs';
import {
  crashAfterFs,
  makeWorld,
  messageFrontmatter,
  recordFile,
  snapshot,
  stage,
  storeRecord,
  SYNTH_SOURCES,
} from '@core/import/import.test-support';
import {
  parseImportedRecordFile,
  serializeImportedRecord,
} from '@core/import/record-file';
import {
  getFilteredSubsetState,
  InterruptedImportError,
  replaceFilteredSubset,
  type SubsetPlan,
} from '@storage/filtered-subset';
import { scanImportedRecords } from '@storage/reader';
import { afterEach, describe, expect, it } from 'vitest';

import { runImport } from './index';

// `filter` reads records only under the work-log lock, after finishing any
// interrupted import, so a subset never holds part of a batch; when the
// import cannot be finished, `filter` refuses and changes nothing. The
// transactions here are written literally, in the 0.6.0 journal format
// (version 3), independent of the current commit code, so a transaction a
// 0.6.0 import left behind is shown to recover.

const DEAD_PID = 4_000_001;
const worlds: string[] = [];
afterEach(() => {
  for (const base of worlds.splice(0)) {
    rmSync(base, { recursive: true, force: true });
  }
});

function world() {
  const w = makeWorld();
  worlds.push(w.base);
  return w;
}

const sha = (data: Buffer | string) =>
  createHash('sha256').update(data).digest('hex');

function id(path: string) {
  const stat = lstatSync(path, { bigint: true });
  return { dev: String(stat.dev), ino: String(stat.ino) };
}

/** A stored record's bytes, as `import` writes them */
function storedBytes(n: number, body: string): Buffer {
  const parsed = parseImportedRecordFile(
    Buffer.from(recordFile(messageFrontmatter(n), body)),
  );
  if (!parsed.ok) throw new Error('fixture must be valid');
  return Buffer.from(serializeImportedRecord(parsed.record, parsed.body));
}

/**
 * Leave the work log as a 0.6.0 import interrupted while updating record 1
 * would: `prepared` (nothing applied), `committing` (the record replaced) or
 * `committed` (every record stored, cleanup not done).
 */
function interrupted060(
  workLog: string,
  state: 'prepared' | 'committing' | 'committed',
): { dest: string } {
  const dest = storeRecord(workLog, 1, 'Stored earlier.');
  const oldBytes = readFileSync(dest);
  const newBytes = storedBytes(1, 'Updated by the interrupted batch.');
  const txn = join(workLog, '.import-transaction');
  mkdirSync(txn);
  for (const folder of ['staged', 'backup', 'applying', 'dirs']) {
    mkdirSync(join(txn, folder));
  }
  writeFileSync(join(txn, 'staged', '0.md'), newBytes);
  writeFileSync(join(txn, 'backup', '0.md'), oldBytes);
  if (state !== 'prepared') {
    writeFileSync(join(txn, 'applying', '0'), '');
    renameSync(join(txn, 'staged', '0.md'), dest);
  }
  const journal = {
    version: 3,
    batchId: 'batch-060',
    state,
    root: id(workLog),
    transaction: id(txn),
    folders: {
      staged: id(join(txn, 'staged')),
      backup: id(join(txn, 'backup')),
      applying: id(join(txn, 'applying')),
      dirs: id(join(txn, 'dirs')),
    },
    directories: [
      { segments: ['messages'], id: id(dirname(dirname(dest))), created: null },
      {
        segments: ['messages', 'slack'],
        id: id(dirname(dest)),
        created: null,
      },
    ],
    operations: [
      {
        destination: ['messages', 'slack', basename(dest)],
        action: 'update',
        staged: '0.md',
        backup: '0.md',
        oldHash: sha(oldBytes),
        newHash: sha(newBytes),
      },
    ],
  };
  writeFileSync(join(txn, 'journal.json'), JSON.stringify(journal));
  return { dest };
}

const none = { pullRequests: 0, tickets: 0, prReviews: 0, messages: 0 };

/** A subset plan built by reading the records, as `filter` does */
function readingPlan(seen: string[][]) {
  return (workLog: string) => (): SubsetPlan => {
    seen.push(scanImportedRecords(workLog).records.map((r) => r.body));
    return {
      files: [],
      directories: [],
      selection: {
        version: 1,
        createdAt: '2026-11-08T00:00:00.000Z',
        filters: ['synthetic'],
        counts: none,
        totals: none,
      },
    };
  };
}

describe('filter and interrupted imports', () => {
  it.each<
    [
      'prepared' | 'committing' | 'committed',
      string,
      'discarded' | 'rolled back' | 'completed',
    ]
  >([
    ['prepared', 'Stored earlier.', 'discarded'],
    ['committing', 'Stored earlier.', 'rolled back'],
    ['committed', 'Updated by the interrupted batch.', 'completed'],
  ])(
    'finishes a 0.6.0 import interrupted while %s before reading records',
    async (state, body, outcome) => {
      const w = world();
      interrupted060(w.workLog, state);
      const seen: string[][] = [];

      const { warnings } = await replaceFilteredSubset(
        w.workLog,
        readingPlan(seen)(w.workLog),
      );

      // The builder ran once, after recovery, and saw one whole batch
      expect(seen).toEqual([[body]]);
      expect(existsSync(join(w.workLog, '.import-transaction'))).toBe(false);
      expect(warnings).toContainEqual(
        expect.stringContaining(`interrupted import was ${outcome}`),
      );
      expect(getFilteredSubsetState(w.workLog).status).toBe('selected');
    },
  );

  it('the same 0.6.0 journal is recovered by import too', () => {
    const w = world();
    const { dest } = interrupted060(w.workLog, 'committing');

    const result = runImport({
      mode: 'import',
      stagingDir: w.staging,
      workLogRoot: w.workLog,
      target: { kind: 'ic' },
      sources: SYNTH_SOURCES,
    });

    expect(result.ok).toBe(true);
    expect(result.recovery).toEqual({
      batchId: 'batch-060',
      outcome: 'rolled-back',
      records: 1,
    });
    expect(readFileSync(dest, 'utf-8')).toContain('Stored earlier.');
  });

  it('finishes an import that crashed mid-commit before reading records', async () => {
    const w = world();
    storeRecord(w.workLog, 1, 'Stored earlier.');
    stage(w.staging, 'a.md', messageFrontmatter(1), 'Replacement.');
    stage(w.staging, 'b.md', messageFrontmatter(2), 'New.');
    // Crash right after the first record is moved into place
    runImport({
      mode: 'import',
      stagingDir: w.staging,
      workLogRoot: w.workLog,
      target: { kind: 'ic' },
      sources: SYNTH_SOURCES,
      env: {
        ...createImportEnv(),
        pid: DEAD_PID,
        fs: crashAfterFs(
          nodeImportFs,
          (op, args) =>
            op === 'rename' && String(args[1]).includes('messages/slack/'),
        ),
      },
    });
    expect(existsSync(join(w.workLog, '.import-transaction'))).toBe(true);
    const seen: string[][] = [];

    await replaceFilteredSubset(w.workLog, readingPlan(seen)(w.workLog), {
      env: { isProcessAlive: (pid) => pid !== DEAD_PID },
    });

    expect(seen).toEqual([['Stored earlier.']]);
  });

  it('refuses, changing nothing, when the interrupted import cannot be finished', async () => {
    const w = world();
    const seen: string[][] = [];
    await replaceFilteredSubset(w.workLog, readingPlan(seen)(w.workLog));
    const subset = snapshot(join(w.workLog, 'filtered'));
    const { dest } = interrupted060(w.workLog, 'committing');
    // Edited after the interruption: recovery cannot tell whose it is
    writeFileSync(dest, 'edited by hand');
    const before = snapshot(w.workLog);
    seen.length = 0;

    const run = replaceFilteredSubset(w.workLog, readingPlan(seen)(w.workLog));

    await expect(run).rejects.toThrow(InterruptedImportError);
    await expect(run).rejects.toThrow(/RECOVERY_CONFLICT.*not changed/);
    expect(seen).toEqual([]);
    expect(snapshot(w.workLog)).toEqual(before);
    expect(snapshot(join(w.workLog, 'filtered'))).toEqual(subset);
  });
});
