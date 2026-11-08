import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  type BigIntStats,
  type Stats,
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { hostname } from 'node:os';

/**
 * The shared filesystem and process seam. The import engine, the work-log
 * lock, the filtered subset, config updates and `skills install` reach the
 * disk and the process only through these types and helpers, so each can be
 * run against injected failures (permissions, interruption, concurrent
 * changes) without relying on the current user's privileges. A component
 * that needs fewer operations picks them from {@link ImportFs}; one that
 * needs other semantics adds only those (`SubsetFs`, `SkillInstallFs`).
 */

/**
 * The `code` of a Node.js filesystem error, if it has one.
 *
 * @param error - Any caught value
 */
export function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

/**
 * An error carrying a filesystem-style `code`, for conditions the platform
 * does not report itself.
 *
 * @param code - Error code, such as `ENOTREG`
 */
export function codedError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

/**
 * Remove something whose removal must never fail the caller. Any failure is
 * passed to `onFailure` (and otherwise ignored), except ENOENT: what is
 * already gone needs no removing.
 *
 * @param remove - The removal
 * @param onFailure - Told about any other failure
 */
export function removeQuietly(
  remove: () => void,
  onFailure?: (error: unknown) => void,
): void {
  try {
    remove();
  } catch (error) {
    if (errorCode(error) !== 'ENOENT') onFailure?.(error);
  }
}

/** What is at a path, without following a final symlink */
export interface FsEntry {
  kind: 'file' | 'directory' | 'symlink' | 'other';
  dev: bigint;
  ino: bigint;
  size: bigint;
  /** Permission bits (`0o644`) */
  mode: number;
  /** Number of hard links to the entry */
  nlink: number;
  /** Modification time, in milliseconds */
  mtimeMs: number;
}

/** A file's contents and the identity of the file they were read from */
export interface FsFile {
  data: Buffer;
  dev: bigint;
  ino: bigint;
}

export interface ImportFs {
  realpath: (path: string) => string;
  lstat: (path: string) => FsEntry;
  readdir: (path: string) => string[];
  /**
   * Read a regular file without following a symlink at the final component.
   * Throws `ENOTREG` for anything else and `EFBIG` past `maxBytes`.
   */
  readFile: (path: string, maxBytes: number) => FsFile;
  /**
   * Create a new file (never replacing anything), write it and flush it.
   * Without `mode`, the file gets `0o666` narrowed by the process umask.
   * With it, the file gets exactly those permission bits (`0o777` at most),
   * so a replacement keeps the permissions of the file it replaces; where
   * the filesystem cannot set them, the umask-narrowed mode stays.
   */
  writeFile: (path: string, data: Uint8Array, mode?: number) => void;
  /** Create one directory (not recursive) */
  mkdir: (path: string) => void;
  rename: (from: string, to: string) => void;
  /** Create a hard link; fails with EEXIST if `to` exists */
  link: (from: string, to: string) => void;
  unlink: (path: string) => void;
  /** Remove an empty directory */
  rmdir: (path: string) => void;
  /** Remove a directory tree the engine created (symlinks are not followed) */
  removeTree: (path: string) => void;
  /** Flush a directory's entries to disk where the platform supports it */
  syncDirectory: (path: string) => void;
}

/**
 * This process and machine, as the work-log lock, the filtered subset and
 * the import engine see them. Tests replace members.
 */
export interface ProcessEnv {
  pid: number;
  hostname: string;
  /** Current time in milliseconds */
  now: () => number;
  /**
   * An ID unique to this boot of this machine, or null when the platform
   * gives none. Never derived from the wall clock.
   */
  bootId: () => string | null;
  /** Whether a process is running; true when that cannot be determined */
  isProcessAlive: (pid: number) => boolean;
  /** A short random string for unique temporary names */
  randomId: () => string;
}

/**
 * The process facts plus the filesystem: what the import engine (and a
 * `filter` run that finishes an interrupted import) works with.
 */
export interface ImportEnv extends ProcessEnv {
  fs: ImportFs;
}

function entryKind(stat: {
  isFile(): boolean;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
}): FsEntry['kind'] {
  if (stat.isSymbolicLink()) return 'symlink';
  if (stat.isFile()) return 'file';
  if (stat.isDirectory()) return 'directory';
  return 'other';
}

/**
 * Describe a stat result as an {@link FsEntry}.
 *
 * @param stat - A stat result (`bigint` keeps large inode numbers exact)
 */
export function fsEntry(stat: BigIntStats | Stats): FsEntry {
  return {
    kind: entryKind(stat),
    dev: BigInt(stat.dev),
    ino: BigInt(stat.ino),
    size: BigInt(stat.size),
    mode: Number(stat.mode) & 0o7777,
    nlink: Number(stat.nlink),
    mtimeMs: Number(stat.mtimeMs),
  };
}

/**
 * What is at `path` (not following a final symlink), or null only when it
 * is proven absent (ENOENT); any other error is thrown.
 *
 * @param fs - Filesystem
 * @param path - Path to check
 */
export function entryAt(
  fs: Pick<ImportFs, 'lstat'>,
  path: string,
): FsEntry | null {
  try {
    return fs.lstat(path);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  }
}

/** O_NOFOLLOW where the platform has it; O_NONBLOCK so a FIFO cannot hang */
const READ_FLAGS =
  constants.O_RDONLY |
  (constants.O_NOFOLLOW ?? 0) |
  (constants.O_NONBLOCK ?? 0);
const CREATE_FLAGS =
  constants.O_WRONLY |
  constants.O_CREAT |
  constants.O_EXCL |
  (constants.O_NOFOLLOW ?? 0);

/** Directory fsync is unsupported on some platforms and filesystems */
const UNSUPPORTED_DIRECTORY_SYNC = new Set([
  'EINVAL',
  'ENOTSUP',
  'EISDIR',
  'EPERM',
  'EBADF',
]);

/** Permission changes are unsupported on some filesystems (FAT, some shares) */
const UNSUPPORTED_MODE_CHANGE = new Set(['EPERM', 'ENOTSUP', 'EINVAL']);

/**
 * The real filesystem.
 */
export const nodeImportFs: ImportFs = {
  realpath: (path) => realpathSync(path),
  lstat: (path) => fsEntry(lstatSync(path, { bigint: true })),
  readdir: (path) => readdirSync(path),
  readFile: (path, maxBytes) => {
    const fd = openSync(path, READ_FLAGS);
    try {
      const stat = fstatSync(fd, { bigint: true });
      if (!stat.isFile()) throw codedError('ENOTREG');
      if (stat.size > BigInt(maxBytes)) throw codedError('EFBIG');
      const chunks: Buffer[] = [];
      let total = 0;
      for (;;) {
        const chunk = Buffer.alloc(64 * 1024);
        const read = readSync(fd, chunk, 0, chunk.length, null);
        if (read === 0) break;
        total += read;
        if (total > maxBytes) throw codedError('EFBIG');
        chunks.push(chunk.subarray(0, read));
      }
      return { data: Buffer.concat(chunks), dev: stat.dev, ino: stat.ino };
    } finally {
      closeSync(fd);
    }
  },
  writeFile: (path, data, mode) => {
    const fd = openSync(path, CREATE_FLAGS, mode ?? 0o666);
    try {
      // The umask narrows the mode given to open; set it exactly
      if (mode !== undefined) {
        try {
          fchmodSync(fd, mode & 0o777);
        } catch (error) {
          const code = errorCode(error);
          if (!code || !UNSUPPORTED_MODE_CHANGE.has(code)) throw error;
        }
      }
      let offset = 0;
      while (offset < data.length) {
        offset += writeSync(fd, data, offset, data.length - offset);
      }
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
  },
  mkdir: (path) => mkdirSync(path),
  rename: (from, to) => renameSync(from, to),
  link: (from, to) => linkSync(from, to),
  unlink: (path) => unlinkSync(path),
  rmdir: (path) => rmdirSync(path),
  removeTree: (path) => rmSync(path, { recursive: true }),
  syncDirectory: (path) => {
    if (process.platform === 'win32') return;
    let fd: number;
    try {
      fd = openSync(path, constants.O_RDONLY);
    } catch (error) {
      const code = errorCode(error);
      if (code && UNSUPPORTED_DIRECTORY_SYNC.has(code)) return;
      throw error;
    }
    try {
      fsyncSync(fd);
    } catch (error) {
      const code = errorCode(error);
      if (!code || !UNSUPPORTED_DIRECTORY_SYNC.has(code)) throw error;
    } finally {
      closeSync(fd);
    }
  },
};

/**
 * Whether a process is running. A permission error means it exists; any
 * other doubt also counts as running, so a live run is never taken over.
 *
 * @param pid - Process ID
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return errorCode(error) !== 'ESRCH';
  }
}

function readSystemBootId(): string | null {
  try {
    if (process.platform === 'linux') {
      const id = readFileSync('/proc/sys/kernel/random/boot_id', 'utf-8');
      return id.trim() || null;
    }
    if (process.platform === 'darwin') {
      const id = execFileSync(
        '/usr/sbin/sysctl',
        ['-n', 'kern.bootsessionuuid'],
        {
          encoding: 'utf-8',
          timeout: 5_000,
          stdio: ['ignore', 'pipe', 'ignore'],
        },
      );
      return id.trim() || null;
    }
  } catch {
    // No ID: owners are then judged by their process alone
  }
  return null;
}

let systemBootIdCache: string | null | undefined;

/**
 * This boot's ID: Linux's `boot_id`, or macOS's boot session UUID. Null on
 * other platforms or when it cannot be read.
 */
export function systemBootId(): string | null {
  if (systemBootIdCache === undefined) systemBootIdCache = readSystemBootId();
  return systemBootIdCache;
}

/**
 * The real process and machine. Callers may replace any member.
 */
export function createProcessEnv(): ProcessEnv {
  return {
    pid: process.pid,
    hostname: hostname(),
    now: () => Date.now(),
    bootId: systemBootId,
    isProcessAlive,
    randomId: () => randomBytes(8).toString('hex'),
  };
}

/**
 * The real environment: this process, this machine and the real filesystem.
 * Callers may replace any member (tests inject failures this way).
 */
export function createImportEnv(): ImportEnv {
  return { fs: nodeImportFs, ...createProcessEnv() };
}
