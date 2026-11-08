import { randomBytes } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { hostname, uptime } from 'node:os';

/**
 * The filesystem and process operations the import engine uses. Everything
 * the engine does to disk goes through one of these, so the engine can be
 * run against injected failures (permissions, interruption, concurrent
 * changes) without relying on the current user's privileges.
 */

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
   * `mode` (default `0o666`) is narrowed by the process umask.
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
 * The process facts the import lock needs, plus the filesystem.
 */
export interface ImportEnv {
  fs: ImportFs;
  pid: number;
  hostname: string;
  /** Current time in milliseconds */
  now: () => number;
  /** When this machine last booted, in milliseconds */
  bootTime: () => number;
  /** Whether a process is running; true when that cannot be determined */
  isProcessAlive: (pid: number) => boolean;
  /** A short random string for unique temporary names */
  randomId: () => string;
}

function codedError(code: string): Error {
  return Object.assign(new Error(code), { code });
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

/**
 * The real filesystem.
 */
export const nodeImportFs: ImportFs = {
  realpath: (path) => realpathSync(path),
  lstat: (path) => {
    const stat = lstatSync(path, { bigint: true });
    return {
      kind: entryKind(stat),
      dev: stat.dev,
      ino: stat.ino,
      size: stat.size,
      mode: Number(stat.mode & 0o7777n),
      nlink: Number(stat.nlink),
      mtimeMs: Number(stat.mtimeMs),
    };
  },
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
  writeFile: (path, data, mode = 0o666) => {
    const fd = openSync(path, CREATE_FLAGS, mode);
    try {
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
      const code = (error as { code?: string }).code;
      if (code && UNSUPPORTED_DIRECTORY_SYNC.has(code)) return;
      throw error;
    }
    try {
      fsyncSync(fd);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (!code || !UNSUPPORTED_DIRECTORY_SYNC.has(code)) throw error;
    } finally {
      closeSync(fd);
    }
  },
};

/**
 * Whether a process is running. A permission error means it exists; any
 * other doubt also counts as running, so a live import is never taken over.
 *
 * @param pid - Process ID
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as { code?: string }).code !== 'ESRCH';
  }
}

/**
 * The real environment: this process, this machine and the real filesystem.
 * Callers may replace any member (tests inject failures this way).
 */
export function createImportEnv(): ImportEnv {
  return {
    fs: nodeImportFs,
    pid: process.pid,
    hostname: hostname(),
    now: () => Date.now(),
    bootTime: () => Date.now() - uptime() * 1000,
    isProcessAlive,
    randomId: () => randomBytes(8).toString('hex'),
  };
}
