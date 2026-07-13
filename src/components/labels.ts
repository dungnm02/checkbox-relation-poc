import { parseId } from '../core/grammar/parseId';
import type { LeafId } from '../core/types';

/** Derive a readable label from a leaf id's opaque path (demo-only; a real BE may send names). */
export function labelFor(id: LeafId): string {
  try {
    const { path } = parseId(id);
    const last = path.split(/[./]/).pop() ?? path;
    return last.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  } catch {
    return id;
  }
}

/** Column-aware label so a field leaf's VIEW and EDIT cells are distinguishable to AT. */
export function cellLabel(id: LeafId): string {
  try {
    const { type } = parseId(id);
    return `${labelFor(id)} ${type.toLowerCase()}`;
  } catch {
    return labelFor(id);
  }
}

/** Map reserved reasons + rule ids to friendlier text for tooltips. */
export function reasonLabel(reason: string): string {
  if (reason === '@initial') return 'required by default';
  if (reason === '@hidden') return 'section hidden';
  if (reason.startsWith('@restore:')) return 'pending restore';
  return reason;
}
