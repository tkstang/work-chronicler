import {
  type ImportedRecord,
  ImportedRecordSchema,
} from '@wc-types/imported-record';
import { isMap, parseDocument, stringify, visit } from 'yaml';
import type { z } from 'zod';

import { type ImportIssue, importIssue } from './issues';

/**
 * The imported record file format, shared by staging files and stored
 * records: UTF-8 markdown that starts with a `---` line, then YAML
 * frontmatter, a closing `---` line, and the record body.
 *
 * Parsing is strict so a record means exactly one thing: one YAML document,
 * no duplicate keys, no aliases, no explicit tags, and no keys the schema
 * does not define. Problems are reported by code and position only; no text
 * from the file is ever copied into a message.
 */

export type ParsedRecordFile =
  | { ok: true; record: ImportedRecord; body: string }
  | { ok: false; issues: ImportIssue[] };

const decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Split a file into frontmatter text and body.
 */
function splitFrontmatter(
  text: string,
): { yaml: string; body: string } | undefined {
  const opening = /^---\r?\n/.exec(text);
  if (!opening) return undefined;
  let offset = opening[0].length;
  const lines: string[] = [];
  while (offset <= text.length) {
    const end = text.indexOf('\n', offset);
    const lineEnd = end === -1 ? text.length : end;
    const line = text.slice(offset, lineEnd).replace(/\r$/, '');
    if (line === '---') {
      const rest = end === -1 ? '' : text.slice(end + 1);
      // The writer puts one blank line before the body and one newline after
      const body = rest.replace(/^\r?\n/, '').replace(/\r?\n$/, '');
      return { yaml: lines.join('\n'), body };
    }
    if (end === -1) return undefined;
    lines.push(line);
    offset = end + 1;
  }
  return undefined;
}

/** A key name safe to print: short and plain, or a placeholder */
function printableKey(key: unknown): string {
  return typeof key === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(key)
    ? key
    : '<unprintable key>';
}

/** The value at a path, used only to tell a missing field from a wrong one */
function valueAt(data: unknown, path: readonly PropertyKey[]): unknown {
  let current: unknown = data;
  for (const key of path) {
    if (typeof current !== 'object' || current === null) return undefined;
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}

function isDateTimeUnion(issue: z.core.$ZodIssue): boolean {
  if (issue.code !== 'invalid_union') return false;
  const nested = issue.errors.flat();
  return (
    nested.length > 0 &&
    nested.every((e) => e.code === 'invalid_format' && e.format === 'datetime')
  );
}

/**
 * A fixed message for a schema issue. Built from the issue's code and the
 * schema's own limits, never from the record's values.
 */
function describeSchemaIssue(issue: z.core.$ZodIssue, data: unknown): string {
  switch (issue.code) {
    case 'invalid_type':
      return valueAt(data, issue.path) === undefined
        ? 'is required'
        : `must be ${issue.expected}`;
    case 'too_big':
      return `is too ${issue.origin === 'number' ? 'large' : 'long'} (maximum ${String(issue.maximum)})`;
    case 'too_small':
      return `is too ${issue.origin === 'number' ? 'small' : 'short'} (minimum ${String(issue.minimum)})`;
    case 'invalid_format':
      // Regex checks in the schema carry their own fixed messages
      return issue.format === 'regex'
        ? issue.message
        : `must be a valid ${issue.format}`;
    case 'invalid_value':
      return `must be one of: ${issue.values.map((v) => JSON.stringify(v)).join(', ')}`;
    case 'unrecognized_keys':
      return `has unrecognized key(s): ${issue.keys.map(printableKey).join(', ')}`;
    case 'invalid_union':
      return isDateTimeUnion(issue)
        ? 'must be an ISO 8601 date-time'
        : 'has no accepted value';
    case 'custom':
      // Only this codebase's refinements raise custom issues
      return issue.message;
    default:
      return 'is invalid';
  }
}

/** Frontmatter field path as text */
function fieldPath(path: readonly PropertyKey[]): string {
  return path.map((key) => String(key)).join('.') || '(frontmatter)';
}

/**
 * Parse and validate an imported record file.
 *
 * @param bytes - Raw file bytes
 * @param file - File name to attach to issues
 * @returns The validated record and body, or the issues that reject it
 */
export function parseImportedRecordFile(
  bytes: Uint8Array,
  file?: string,
): ParsedRecordFile {
  const where = file === undefined ? {} : { file };
  let text: string;
  try {
    text = decoder.decode(bytes);
  } catch {
    return {
      ok: false,
      issues: [importIssue('INVALID_ENCODING', 'is not valid UTF-8', where)],
    };
  }

  const parts = splitFrontmatter(text);
  if (!parts) {
    return {
      ok: false,
      issues: [
        importIssue(
          'FRONTMATTER_MISSING',
          'must start with a "---" line and close its frontmatter with another "---" line',
          where,
        ),
      ],
    };
  }

  const doc = parseDocument(parts.yaml, {
    uniqueKeys: true,
    prettyErrors: true,
  });
  const yamlProblem = [...doc.errors, ...doc.warnings][0];
  if (yamlProblem) {
    const position = yamlProblem.linePos?.[0];
    return {
      ok: false,
      issues: [
        importIssue(
          'YAML_INVALID',
          `frontmatter is not valid YAML (${yamlProblem.code})`,
          {
            ...where,
            // +1: the opening "---" line precedes the frontmatter
            ...(position
              ? { line: position.line + 1, column: position.col }
              : {}),
          },
        ),
      ],
    };
  }

  let forbidden: string | undefined;
  visit(doc, {
    Alias() {
      forbidden = 'aliases are not allowed';
      return visit.BREAK;
    },
    Node(_, node) {
      if (node.tag) {
        forbidden = 'explicit YAML tags are not allowed';
        return visit.BREAK;
      }
      return undefined;
    },
  });
  if (forbidden) {
    return {
      ok: false,
      issues: [importIssue('YAML_INVALID', `frontmatter: ${forbidden}`, where)],
    };
  }
  if (!isMap(doc.contents)) {
    return {
      ok: false,
      issues: [
        importIssue('SCHEMA_INVALID', 'frontmatter must be a mapping', where),
      ],
    };
  }

  let data: unknown;
  try {
    data = doc.toJS({ maxAliasCount: 0 });
  } catch {
    return {
      ok: false,
      issues: [
        importIssue('YAML_INVALID', 'frontmatter could not be read', where),
      ],
    };
  }

  const result = ImportedRecordSchema.safeParse(data);
  if (!result.success) {
    return {
      ok: false,
      issues: result.error.issues.map((issue) =>
        importIssue('SCHEMA_INVALID', describeSchemaIssue(issue, data), {
          ...where,
          field: fieldPath(issue.path),
        }),
      ),
    };
  }
  return { ok: true, record: result.data, body: parts.body };
}

/**
 * Serialize a validated record in the stored form. The same record and body
 * always produce the same bytes, so a repeated import can tell an unchanged
 * record from a changed one by comparing bytes.
 *
 * @param record - Validated record
 * @param body - Record body
 * @returns File contents
 */
export function serializeImportedRecord(
  record: ImportedRecord,
  body: string,
): Buffer {
  const yaml = stringify(record, {
    lineWidth: 0,
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  });
  return Buffer.from(`---\n${yaml}---\n\n${body}\n`, 'utf-8');
}
