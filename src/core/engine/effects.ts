// §4.4 — per-relationship effects. Given the current draft state, a relationship produces
// a set of desired writes (to `checked` and/or to `disabledBy` reasons). Effects are
// recomputed idempotently whenever a trigger node changes; the BFS in resolveToggle applies
// the writes with change-detection so circular relations converge (§6).

import type { Condition, LeafId } from '../types';
import type { ResolvedRelationship } from '../expressions/expand';
import type { CheckboxValue } from '../types';

export type DraftState = Record<LeafId, CheckboxValue>;

/** A desired write to a node's `checked`. `owner` bypasses the "skip disabled" rule (§4.7). */
export interface CheckedWrite {
  node: LeafId;
  checked: boolean;
  owner: boolean;
}
export interface ReasonWrite {
  node: LeafId;
  reason: string;
  op: 'add' | 'remove';
}
export interface Effect {
  checked: CheckedWrite[];
  reasons: ReasonWrite[];
}

const EMPTY: Effect = { checked: [], reasons: [] };

export function evalCondition(c: Condition, draft: DraftState): boolean {
  if (typeof c === 'string') return draft[c]?.checked === true;
  if ('all' in c) return c.all.every((id) => draft[id]?.checked === true);
  if ('any' in c) return c.any.some((id) => draft[id]?.checked === true);
  return !evalCondition(c.not, draft);
}

/** Ids referenced by a condition (so the rule can be re-triggered when they change). */
export function conditionIds(c: Condition | undefined): LeafId[] {
  if (!c) return [];
  if (typeof c === 'string') return [c];
  if ('all' in c) return c.all;
  if ('any' in c) return c.any;
  return conditionIds(c.not);
}

/** Restore marker paired with a REQUIRES lock (§4.4a restoreCheckedOnSatisfy). */
export function restoreMarker(ruleId: string): string {
  return `@restore:${ruleId}`;
}

function checked(node: LeafId, value: boolean, owner = false): CheckedWrite {
  return { node, checked: value, owner };
}

/**
 * Compute a relationship's writes. `triggerNode` matters only for BIDIRECTIONAL (which
 * mirrors the changed node's value onto the rest of the group).
 */
export function computeEffect(
  rel: ResolvedRelationship,
  sourceId: LeafId,
  triggerNode: LeafId,
  draft: DraftState,
): Effect {
  const conditionOk = rel.condition === undefined || evalCondition(rel.condition, draft);
  const src = draft[sourceId];
  if (!src) return EMPTY;

  switch (rel.type) {
    case 'CASCADES_CHECK':
      if (!conditionOk || !src.checked) return EMPTY;
      return { checked: rel.targetIds.map((t) => checked(t, true)), reasons: [] };

    case 'CASCADES_UNCHECK':
      if (!conditionOk || src.checked) return EMPTY;
      return { checked: rel.targetIds.map((t) => checked(t, false)), reasons: [] };

    case 'CASCADES_BOTH':
    case 'GROUP_ALL':
      if (!conditionOk) return EMPTY;
      return { checked: rel.targetIds.map((t) => checked(t, src.checked)), reasons: [] };

    case 'MUTUAL_EXCLUSIVE':
      if (!conditionOk || !src.checked) return EMPTY;
      return { checked: rel.targetIds.map((t) => checked(t, false)), reasons: [] };

    case 'INVERSE':
      if (!conditionOk) return EMPTY;
      return { checked: rel.targetIds.map((t) => checked(t, !src.checked)), reasons: [] };

    case 'BIDIRECTIONAL': {
      if (!conditionOk) return EMPTY;
      const value = draft[triggerNode]?.checked ?? src.checked;
      const group = [sourceId, ...rel.targetIds];
      return { checked: group.filter((n) => n !== triggerNode).map((n) => checked(n, value)), reasons: [] };
    }

    case 'REQUIRES':
      return requiresEffect(rel, sourceId, draft, conditionOk);

    case 'DISABLES_ON_CHECK':
      return disableEffect(rel, src.checked, conditionOk);
    case 'DISABLES_ON_UNCHECK':
      return disableEffect(rel, !src.checked, conditionOk);
    // ENABLES_* own their reason with mirrored polarity: the reason is REMOVED (enabled) on
    // the trigger and ADDED (locked) otherwise — the inverse of the matching DISABLES.
    case 'ENABLES_ON_CHECK':
      return disableEffect(rel, !src.checked, conditionOk);
    case 'ENABLES_ON_UNCHECK':
      return disableEffect(rel, src.checked, conditionOk);
  }
}

function requiresEffect(
  rel: ResolvedRelationship,
  sourceId: LeafId,
  draft: DraftState,
  conditionOk: boolean,
): Effect {
  const src = draft[sourceId];
  const held = src.disabledBy.includes(rel.id);
  const anyUnchecked = rel.targetIds.some((t) => draft[t]?.checked !== true);
  const marker = restoreMarker(rel.id);

  // Condition false OR all-satisfied → release the lock.
  if (!conditionOk || !anyUnchecked) {
    if (!held) return EMPTY;
    const reasons: ReasonWrite[] = [
      { node: sourceId, reason: rel.id, op: 'remove' },
      { node: sourceId, reason: marker, op: 'remove' },
    ];
    const restore =
      rel.restoreCheckedOnSatisfy && src.disabledBy.includes(marker)
        ? [checked(sourceId, true, false)]
        : [];
    return { checked: restore, reasons };
  }

  // A target is unchecked → engage/hold the lock: source unchecked + disabled.
  const reasons: ReasonWrite[] = [{ node: sourceId, reason: rel.id, op: 'add' }];
  if (!held && src.checked) reasons.push({ node: sourceId, reason: marker, op: 'add' });
  return { checked: [checked(sourceId, false, true)], reasons };
}

function disableEffect(rel: ResolvedRelationship, locked: boolean, conditionOk: boolean): Effect {
  const active = locked && conditionOk;
  const op: 'add' | 'remove' = active ? 'add' : 'remove';
  const reasons: ReasonWrite[] = rel.targetIds.map((node) => ({ node, reason: rel.id, op }));
  const checkedWrites: CheckedWrite[] =
    active && rel.forceCheckedValue !== undefined
      ? rel.targetIds.map((node) => checked(node, rel.forceCheckedValue!, true))
      : [];
  return { checked: checkedWrites, reasons };
}
