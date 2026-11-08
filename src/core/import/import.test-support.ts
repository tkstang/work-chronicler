// Test support for the import engine tests (not part of the build: see
// tsconfig.build.json, which excludes *.test.ts and *.test-support.ts).
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { getImportedRecordFilePath } from '@storage/paths';
import { stringify } from 'yaml';

import { type ImportFs, nodeImportFs } from './import-fs';
import {
  parseImportedRecordFile,
  serializeImportedRecord,
} from './record-file';
import type { ImportSourceSettings } from './sources';

/** Planted in record content so tests can assert it is never echoed */
export const SECRET = 'zebra-quartz-secret';

/**
 * A synthetic, valid message record's frontmatter. `n` varies the identity.
 */
export function messageFrontmatter(
  n = 1,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const ts = `1700000000.${String(n).padStart(6, '0')}`;
  return {
    schemaVersion: 1,
    type: 'message',
    source: 'slack',
    sourceAccount: 'T0SYNTH01',
    sourceId: `C0SYNTH01/${ts}`,
    url: null,
    occurredAt: '2026-03-02T10:00:00Z',
    updatedAt: null,
    capturedAt: '2026-03-05T09:00:00Z',
    subject: { kind: 'ic' },
    attribution: { status: 'verified', authorId: 'U0SYNTH01' },
    mentions: { tickets: [], pullRequests: [] },
    message: {
      container: { id: 'C0SYNTH01', name: 'synthetic-channel' },
      thread: null,
      replyCount: 0,
      replyParticipantCount: 0,
    },
    ...overrides,
  };
}

/**
 * Slack settings matching {@link messageFrontmatter}: its workspace, author
 * and channel (confirmed as shared, so report imports accept it too).
 */
export const SYNTH_SOURCES: ImportSourceSettings = {
  slack: {
    workspace: 'T0SYNTH01',
    user: 'U0SYNTH01',
    channels: [
      {
        id: 'C0SYNTH01',
        name: 'synthetic-channel',
        reason: 'Synthetic test channel',
        private: false,
        sharedWithManager: true,
      },
    ],
  },
};

/** A staged record file's bytes */
export function recordFile(
  data: Record<string, unknown>,
  body = `Synthetic message. ${SECRET}`,
): string {
  return `---\n${stringify(data)}---\n\n${body}\n`;
}

/** Write a staged record */
export function stage(
  dir: string,
  name: string,
  data: Record<string, unknown> = messageFrontmatter(),
  body?: string,
): void {
  writeFileSync(join(dir, name), recordFile(data, body));
}

/** A fresh base directory with staging/, work-log/ and outside/ */
export function makeWorld(): {
  base: string;
  staging: string;
  workLog: string;
  outside: string;
} {
  // Resolved, so paths seen by injected hooks match (macOS /var is a link)
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'wc-import-')));
  const staging = join(base, 'staging');
  const workLog = join(base, 'work-log');
  const outside = join(base, 'outside');
  for (const dir of [staging, workLog, outside]) mkdirSync(dir);
  return { base, staging, workLog, outside };
}

/**
 * Everything under a directory: file contents, link targets and empty
 * directories, keyed by relative path. Two equal snapshots mean nothing in
 * the tree changed.
 */
export function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string, rel: string) => {
    const entries = readdirSync(current);
    if (entries.length === 0 && rel) out[`${rel}/`] = '<empty dir>';
    for (const name of entries) {
      const path = join(current, name);
      const relPath = rel ? `${rel}/${name}` : name;
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) out[relPath] = `link:${readlinkSync(path)}`;
      else if (stat.isDirectory()) walk(path, relPath);
      else out[relPath] = readFileSync(path, 'utf-8');
    }
  };
  walk(dir, '');
  return out;
}

/** Filesystem operation names, as in {@link ImportFs} */
export type FsOp = keyof ImportFs;

/**
 * Wrap a filesystem so a hook runs before every operation. The hook can
 * throw (to inject a failure) or change the real filesystem (to model a
 * concurrent change).
 */
export function hookedFs(
  base: ImportFs,
  before: (op: FsOp, args: unknown[]) => void,
): ImportFs {
  const wrapped = {} as Record<string, unknown>;
  for (const op of Object.keys(base) as FsOp[]) {
    const fn = base[op] as (...args: unknown[]) => unknown;
    wrapped[op] = (...args: unknown[]) => {
      before(op, args);
      return fn(...args);
    };
  }
  return wrapped as unknown as ImportFs;
}

/** An error shaped like Node's filesystem errors */
export function fsError(code: string): Error {
  return Object.assign(new Error(`${code}: injected`), { code });
}

/** Whether the temp directory's filesystem ignores letter case */
export const caseInsensitiveTmp = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'wc-case-'));
  writeFileSync(join(dir, 'probe'), '');
  try {
    lstatSync(join(dir, 'PROBE'));
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
})();

/** Operations that change the filesystem */
export const MUTATING_OPS: ReadonlySet<FsOp> = new Set<FsOp>([
  'writeFile',
  'mkdir',
  'rename',
  'link',
  'unlink',
  'rmdir',
  'removeTree',
]);

/**
 * Model the process dying at the `crashAt`-th mutating operation (1-based):
 * that operation does not happen (a write leaves half its bytes behind),
 * and every operation after it fails, so nothing the dying process tries
 * afterwards (such as a rollback) reaches the disk.
 */
export function crashingFs(base: ImportFs, crashAt: number): ImportFs {
  let mutations = 0;
  let dead = false;
  const wrapped = {} as Record<string, unknown>;
  for (const op of Object.keys(base) as FsOp[]) {
    const fn = base[op] as (...args: unknown[]) => unknown;
    wrapped[op] = (...args: unknown[]) => {
      if (dead) throw fsError('ECRASHED');
      if (MUTATING_OPS.has(op) && ++mutations === crashAt) {
        dead = true;
        if (op === 'writeFile') {
          const data = args[1] as Uint8Array;
          base.writeFile(
            args[0] as string,
            data.subarray(0, Math.floor(data.length / 2)),
          );
        }
        throw fsError('ECRASHED');
      }
      return fn(...args);
    };
  }
  return wrapped as unknown as ImportFs;
}

/**
 * Fail exactly the `failAt`-th operation call (1-based, any operation) with
 * EACCES; every other call runs normally.
 */
export function faultyFs(base: ImportFs, failAt: number): ImportFs {
  let calls = 0;
  return hookedFs(base, () => {
    if (++calls === failAt) throw fsError('EACCES');
  });
}

/** Count operation calls (all, and mutating only) */
export function countingFs(base: ImportFs): {
  fs: ImportFs;
  counts: { all: number; mutating: number };
} {
  const counts = { all: 0, mutating: 0 };
  const fs = hookedFs(base, (op) => {
    counts.all++;
    if (MUTATING_OPS.has(op)) counts.mutating++;
  });
  return { fs, counts };
}

/**
 * Model the process dying right after the first operation for which
 * `after` returns true: that operation completes, and every later one fails.
 */
export function crashAfterFs(
  base: ImportFs,
  after: (op: FsOp, args: unknown[]) => boolean,
): ImportFs {
  let armed = false;
  let dead = false;
  const wrapped = {} as Record<string, unknown>;
  for (const op of Object.keys(base) as FsOp[]) {
    const fn = base[op] as (...args: unknown[]) => unknown;
    wrapped[op] = (...args: unknown[]) => {
      if (dead || armed) {
        dead = true;
        throw fsError('ECRASHED');
      }
      const result = fn(...args);
      if (after(op, args)) armed = true;
      return result;
    };
  }
  return wrapped as unknown as ImportFs;
}

/** The identity of the synthetic record numbered `n` */
export function slackIdentity(n: number) {
  return {
    type: 'message',
    source: 'slack',
    sourceAccount: 'T0SYNTH01',
    sourceId: `C0SYNTH01/1700000000.${String(n).padStart(6, '0')}`,
  } as const;
}

/** Store record `n` in a work log as an earlier import would have */
export function storeRecord(
  workLog: string,
  n: number,
  body = 'Stored earlier.',
): string {
  const parsed = parseImportedRecordFile(
    Buffer.from(recordFile(messageFrontmatter(n), body)),
  );
  if (!parsed.ok) throw new Error('fixture must be valid');
  const path = getImportedRecordFilePath(workLog, slackIdentity(n));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeImportedRecord(parsed.record, parsed.body));
  return path;
}

/**
 * The real filesystem without fsync. Loops that run hundreds of imports use
 * it: durability cannot be observed in-process, and every operation (sync
 * calls included) still goes through the same interface and hooks.
 */
export const fastFs: ImportFs = {
  ...nodeImportFs,
  writeFile: (path, data) => writeFileSync(path, data, { flag: 'wx' }),
  syncDirectory: () => {},
};

/**
 * Fail operation call `first` (1-based, any operation) and then the
 * `then`-th mutating operation after it, so the failure handling itself
 * (rollback, cleanup) meets a second failure. Everything else runs.
 */
export function doubleFaultFs(
  base: ImportFs,
  first: number,
  then: number,
): ImportFs {
  let calls = 0;
  let mutationsAfter = -1;
  return hookedFs(base, (op) => {
    calls++;
    if (calls === first) {
      mutationsAfter = 0;
      throw fsError('EIO');
    }
    if (
      mutationsAfter >= 0 &&
      MUTATING_OPS.has(op) &&
      ++mutationsAfter === then
    ) {
      throw fsError('EIO');
    }
  });
}
