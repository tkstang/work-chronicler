import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';

import {
  type FsFile,
  type ImportFs,
  nodeImportFs,
} from '@core/import/import-fs';
import { describeFsError, errorCode } from '@core/import/issues';
import { type Document, parseDocument } from 'yaml';

/** Largest config file the CLI will rewrite */
export const MAX_CONFIG_BYTES = 1024 * 1024;

/**
 * A config change was refused. The config file was not changed.
 */
export class ConfigUpdateError extends Error {
  override readonly name = 'ConfigUpdateError';
}

export interface ConfigUpdate {
  /** The config file to change */
  path: string;
  /**
   * Make the change in the parsed document, so comments, key order and
   * settings the CLI does not know about are kept. Receives a copy of the
   * file's current value; returns the value the whole file must hold after
   * the change. Throw {@link ConfigUpdateError} to refuse.
   */
  edit: (doc: Document, current: unknown) => unknown;
  /** Check a whole config value; returns problems (empty when valid) */
  validate: (value: unknown) => string[];
  /** Filesystem (defaults to the real one; tests inject failures) */
  fs?: ImportFs;
  randomId?: () => string;
}

export interface ConfigUpdateResult {
  /** False when the file already held the change (nothing was written) */
  changed: boolean;
  /** Problems after the file was replaced (the change itself was made) */
  warnings: string[];
}

interface ConfigRead {
  file: FsFile;
  /** Permission bits, kept on the replacement */
  mode: number;
}

function refuse(path: string, why: string): never {
  throw new ConfigUpdateError(`${why}. ${path} was not changed.`);
}

/** Read the config file, which must be a regular file (not a symlink) */
function readConfig(fs: ImportFs, path: string): ConfigRead {
  let kind: string;
  let mode: number;
  let file: FsFile;
  try {
    const entry = fs.lstat(path);
    kind = entry.kind;
    mode = entry.mode;
    if (kind !== 'file') {
      refuse(
        path,
        kind === 'symlink'
          ? 'The config is a symbolic link; edit the file it points to by hand'
          : 'The config is not a regular file',
      );
    }
    file = fs.readFile(path, MAX_CONFIG_BYTES);
    if (file.dev !== entry.dev || file.ino !== entry.ino) {
      refuse(path, 'The config was replaced while it was being read');
    }
  } catch (error) {
    if (error instanceof ConfigUpdateError) throw error;
    refuse(
      path,
      errorCode(error) === 'EFBIG'
        ? `The config is larger than ${MAX_CONFIG_BYTES} bytes`
        : `The config could not be read (${describeFsError(error)})`,
    );
  }
  return { file, mode };
}

function decode(path: string, data: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    refuse(path, 'The config is not valid UTF-8');
  }
}

/** Parse YAML, refusing anything the parser is unsure about */
function parseStrict(path: string, text: string, what: string): Document {
  const doc = parseDocument(text);
  if (doc.errors.length > 0 || doc.warnings.length > 0) {
    refuse(path, what);
  }
  return doc;
}

function removeQuietly(fs: ImportFs, path: string): void {
  try {
    fs.unlink(path);
  } catch {
    // A leftover temporary file is harmless; it is never read
  }
}

/**
 * Change a YAML config file without losing or corrupting it.
 *
 * The file is read once (it must be a regular UTF-8 YAML file that passes
 * `validate`), changed in its parsed form, and the result is checked before
 * anything is written: it must parse cleanly, pass `validate`, and hold
 * exactly the value `edit` promised, so every other setting is unchanged.
 * The new contents are written to a new file beside the config (same
 * permissions, flushed to disk), the config is read again and must still be
 * the same file with the same bytes, and only then is the new file renamed
 * over it. A reader sees the old file or the new one, never a mix; any
 * doubt before the rename leaves the config untouched.
 *
 * Residual window: a writer that changes the config between the final check
 * and the rename is overwritten (its change is lost, the file stays valid).
 *
 * @param update - File, edit and validation
 * @returns Whether the file changed, and warnings
 * @throws {ConfigUpdateError} When the change is refused (nothing written)
 */
export function updateConfigFile(update: ConfigUpdate): ConfigUpdateResult {
  const fs = update.fs ?? nodeImportFs;
  const randomId = update.randomId ?? (() => randomBytes(8).toString('hex'));
  const { path } = update;

  const original = readConfig(fs, path);
  const text = decode(path, original.file.data);
  const doc = parseStrict(path, text, 'The config is not valid YAML');
  const current = doc.toJS() as unknown;
  const problems = update.validate(current);
  if (problems.length > 0) {
    refuse(
      path,
      `The config is not valid (${problems.join('; ')}); fix it first`,
    );
  }

  const expected = update.edit(doc, structuredClone(current));
  const next = doc.toString();
  if (next === text) return { changed: false, warnings: [] };

  const written = parseStrict(
    path,
    next,
    'The change could not be written as valid YAML',
  ).toJS() as unknown;
  if (!isDeepStrictEqual(written, expected)) {
    refuse(path, 'The change would alter other settings in the config');
  }
  const after = update.validate(written);
  if (after.length > 0) {
    refuse(
      path,
      `The change would make the config invalid (${after.join('; ')})`,
    );
  }

  const data = Buffer.from(next, 'utf-8');
  const dir = dirname(path);
  const temp = join(dir, `.${basename(path)}.tmp-${randomId()}`);
  try {
    fs.writeFile(temp, data, original.mode);
  } catch (error) {
    removeQuietly(fs, temp);
    refuse(path, `A new copy could not be written (${describeFsError(error)})`);
  }
  try {
    const again = readConfig(fs, path);
    if (
      again.file.dev !== original.file.dev ||
      again.file.ino !== original.file.ino ||
      !again.file.data.equals(original.file.data)
    ) {
      refuse(path, 'The config changed while it was being updated; try again');
    }
    fs.rename(temp, path);
  } catch (error) {
    removeQuietly(fs, temp);
    if (error instanceof ConfigUpdateError) throw error;
    refuse(
      path,
      `The config could not be replaced (${describeFsError(error)})`,
    );
  }

  const warnings: string[] = [];
  try {
    fs.syncDirectory(dir);
  } catch (error) {
    warnings.push(
      `The change was made but may not survive a power failure (${describeFsError(error)})`,
    );
  }
  try {
    if (!fs.readFile(path, MAX_CONFIG_BYTES).data.equals(data)) {
      warnings.push(
        `${path} was changed again right after this update; check it`,
      );
    }
  } catch (error) {
    warnings.push(
      `${path} could not be read back (${describeFsError(error)}); check it`,
    );
  }
  return { changed: true, warnings };
}
