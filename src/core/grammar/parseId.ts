// §4.1 Backend ID Grammar
//
//   Id           ::= resourceName "/" status "/" type "/" path
//   resourceName ::= segment                 // constant per page
//   status       ::= segment                 // e.g. IN_PROGRESS
//   type         ::= "ACTION" | "VIEW" | "EDIT"
//   path         ::= <opaque string>         // passthrough payload; MAY contain "/" and "."
//   segment      ::= [A-Za-z0-9_-]+
//
// The ID is parsed by FIXED POSITION: split on the first three "/". Everything after
// the third "/" is `path`, verbatim — so `path` may contain "/" or "." unambiguously.
// The engine treats `path` as an atomic, opaque token: it is data for a downstream
// module, never a hierarchy (hierarchy lives only in the FIELD tree's `children`).
//
// TODO(verify): confirm against 3-5 real backend IDs — (a) `type` is exactly one of
// ACTION|VIEW|EDIT, (b) `path` never needs engine-side splitting, (c) a field leaf's
// VIEW and EDIT ids share resourceName/status/path and differ only in `type`.

export type ColumnType = 'ACTION' | 'VIEW' | 'EDIT';
export type LeafId = string;

export interface ParsedId {
  resourceName: string;
  status: string;
  type: ColumnType;
  /** Opaque, verbatim (may contain "/" and "."). */
  path: string;
  raw: LeafId;
}

const SEGMENT_RE = /^[A-Za-z0-9_-]+$/;
const COLUMN_TYPES: readonly ColumnType[] = ['ACTION', 'VIEW', 'EDIT'];

export class IdParseError extends Error {
  constructor(message: string, readonly raw: string) {
    super(`Invalid checkbox ID "${raw}": ${message}`);
    this.name = 'IdParseError';
  }
}

export function isColumnType(v: string): v is ColumnType {
  return (COLUMN_TYPES as readonly string[]).includes(v);
}

/**
 * Parse a concrete backend ID. Wildcards (`*`) are NOT accepted here — those live only
 * in relation expressions and are handled by the expression compiler (§4.3).
 */
export function parseId(raw: string): ParsedId {
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new IdParseError('empty id', String(raw));
  }

  // Split into at most 4 parts on "/", keeping everything past the third slash as `path`.
  const first = raw.indexOf('/');
  const second = first < 0 ? -1 : raw.indexOf('/', first + 1);
  const third = second < 0 ? -1 : raw.indexOf('/', second + 1);
  if (first < 0 || second < 0 || third < 0) {
    throw new IdParseError('expected RESOURCE/STATUS/TYPE/PATH (need 3 "/" separators)', raw);
  }

  const resourceName = raw.slice(0, first);
  const status = raw.slice(first + 1, second);
  const type = raw.slice(second + 1, third);
  const path = raw.slice(third + 1);

  if (!SEGMENT_RE.test(resourceName)) {
    throw new IdParseError(`resourceName "${resourceName}" is not a valid segment`, raw);
  }
  if (!SEGMENT_RE.test(status)) {
    throw new IdParseError(`status "${status}" is not a valid segment`, raw);
  }
  if (!isColumnType(type)) {
    throw new IdParseError(`type "${type}" must be one of ACTION|VIEW|EDIT`, raw);
  }
  if (path.length === 0) {
    throw new IdParseError('path must be non-empty', raw);
  }

  return { resourceName, status, type, path, raw };
}

export function isValidId(raw: string): boolean {
  try {
    parseId(raw);
    return true;
  } catch {
    return false;
  }
}

export function formatId(parts: {
  resourceName: string;
  status: string;
  type: ColumnType;
  path: string;
}): LeafId {
  return `${parts.resourceName}/${parts.status}/${parts.type}/${parts.path}`;
}

/**
 * Return the sibling ID in a different column, holding resourceName/status/path constant.
 * This is the pivot the "EDIT ⇒ VIEW (same path)" invariant turns on (§4.4a).
 */
export function withType(id: ParsedId | LeafId, type: ColumnType): LeafId {
  const p = typeof id === 'string' ? parseId(id) : id;
  return formatId({ resourceName: p.resourceName, status: p.status, type, path: p.path });
}
