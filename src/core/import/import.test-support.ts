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
import { join } from 'node:path';

import { stringify } from 'yaml';

import type { ImportFs } from './import-fs';

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
