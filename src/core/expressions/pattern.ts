// §4.3 — positional patterns over the 4-segment id space [resource, status, type, path].
// `*` is the per-position wildcard; for `path` it matches the WHOLE opaque path (never a
// sub-part). Aliases and $SELECTOR(name) desugar to patterns here.

import { ConfigError } from '../errors';
import { isColumnType, type ParsedId } from '../grammar/parseId';
import type { LeafId, NamedSelector, TargetRef } from '../types';

export const WILD = '*';
export const R = 0;
export const S = 1;
export const T = 2;
export const P = 3;
/** [resource, status, type, path]; each entry is a literal or `*`. */
export type Pattern = [string, string, string, string];

const SEGMENT_OR_WILD = /^(\*|[A-Za-z0-9_-]+)$/;

function parsePatternString(raw: string): Pattern {
  const first = raw.indexOf('/');
  const second = first < 0 ? -1 : raw.indexOf('/', first + 1);
  const third = second < 0 ? -1 : raw.indexOf('/', second + 1);
  if (first < 0 || second < 0 || third < 0) {
    throw new ConfigError(`expression "${raw}" must have shape RESOURCE/STATUS/TYPE/PATH`);
  }
  const seg: Pattern = [
    raw.slice(0, first),
    raw.slice(first + 1, second),
    raw.slice(second + 1, third),
    raw.slice(third + 1),
  ];
  if (!SEGMENT_OR_WILD.test(seg[R])) throw new ConfigError(`expression "${raw}": bad resource segment`);
  if (!SEGMENT_OR_WILD.test(seg[S])) throw new ConfigError(`expression "${raw}": bad status segment`);
  if (seg[T] !== WILD && !isColumnType(seg[T])) {
    throw new ConfigError(`expression "${raw}": type must be ACTION|VIEW|EDIT or *`);
  }
  if (seg[P].length === 0) throw new ConfigError(`expression "${raw}": empty path`);
  return seg;
}

const SELECTOR_RE = /^\$SELECTOR\(([^)]+)\)$/;

/** Desugar a TargetRef into a positional pattern. Selectors may not reference selectors. */
export function desugar(
  ref: TargetRef,
  selectors: Map<string, NamedSelector>,
  fromSelector = false,
): Pattern {
  if (ref.startsWith('$')) {
    switch (ref) {
      case '$ACTION':
        return [WILD, WILD, 'ACTION', WILD];
      case '$VIEW':
        return [WILD, WILD, 'VIEW', WILD];
      case '$EDIT':
        return [WILD, WILD, 'EDIT', WILD];
    }
    const m = SELECTOR_RE.exec(ref);
    if (m) {
      if (fromSelector) {
        throw new ConfigError(`selector "${ref}" references another selector (not allowed, §4.3)`);
      }
      const named = selectors.get(m[1]);
      if (!named) throw new ConfigError(`unknown $SELECTOR("${m[1]}")`);
      return desugar(named.expression, selectors, true);
    }
    throw new ConfigError(`unknown expression alias "${ref}"`);
  }
  return parsePatternString(ref);
}

/** True if the pattern has no wildcards — a single concrete id. */
export function isConcrete(pat: Pattern): boolean {
  return pat.every((s) => s !== WILD);
}

function segsOf(p: ParsedId): Pattern {
  return [p.resourceName, p.status, p.type, p.path];
}

export function patternMatches(pat: Pattern, id: ParsedId): boolean {
  const s = segsOf(id);
  for (let i = 0; i < 4; i++) {
    if (pat[i] !== WILD && pat[i] !== s[i]) return false;
  }
  return true;
}

/** Concrete ids in the universe matching a standalone pattern. */
export function matchUniverse(pat: Pattern, universe: ParsedId[]): LeafId[] {
  const out: LeafId[] = [];
  for (const id of universe) if (patternMatches(pat, id)) out.push(id.raw);
  return out;
}

export { segsOf };
