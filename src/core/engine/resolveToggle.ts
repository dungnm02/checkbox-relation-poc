// §4.9 / §6 — the pure engine. resolveToggle is a pure function of (state, event, config):
// no store access, no dispatch, no side effects. It runs a change-detection BFS (a node is
// re-enqueued only when its CheckboxValue actually changes, comparing checked AND disabledBy),
// resolves write conflicts by priority → BFS depth → declaration order, then runs the
// visibility reconciliation pass (§4.6) once the BFS has settled.
//
// `settleState` shares the same core: it evaluates every rule against a seeded state to reach
// a consistent fixed point at load time, establishing invariant locks (REQUIRES / DISABLES /
// visibility) so the very first render is coherent.

import { EngineError } from '../errors';
import type { CheckboxState, LeafId } from '../types';
import type { AdjacencyIndex } from './adjacency';
import { computeEffect } from './effects';
import { reconcileVisibility, type CompiledVisibility } from './visibility';

export type ToggleEvent =
  | { kind: 'leaf'; id: LeafId; checked: boolean }
  // Category aggregate click, normalized to a cascade over its column leaves (§4.5).
  | { kind: 'category'; leafIds: LeafId[]; checked: boolean };

export interface EngineConfig {
  adjacency: AdjacencyIndex;
  visibility: CompiledVisibility;
  leafCount: number;
}

interface Precedence {
  priority: number;
  depth: number;
  order: number;
}

/** Does write `a` beat incumbent `b`? priority ↑, then depth ↓ (closer to origin), then order ↓. */
function beats(a: Precedence, b: Precedence): boolean {
  if (a.priority !== b.priority) return a.priority > b.priority;
  if (a.depth !== b.depth) return a.depth < b.depth;
  return a.order < b.order;
}

function seedsOf(event: ToggleEvent): { id: LeafId; checked: boolean }[] {
  return event.kind === 'leaf'
    ? [{ id: event.id, checked: event.checked }]
    : event.leafIds.map((id) => ({ id, checked: event.checked }));
}

function propagate(
  state: CheckboxState,
  config: EngineConfig,
  seeds: { id: LeafId; checked: boolean }[],
  primeQueue: LeafId[],
): CheckboxState {
  const draft: CheckboxState = { ...state };
  const meta = new Map<LeafId, Precedence>();
  const queue: { node: LeafId; depth: number }[] = [];
  const cap = Math.max(1000, 10 * config.leafCount);
  let iterations = 0;

  const enqueue = (node: LeafId, depth: number) => queue.push({ node, depth });

  const applyChecked = (node: LeafId, value: boolean, owner: boolean, prec: Precedence): void => {
    const cur = draft[node];
    if (!cur) return;
    if (!owner && cur.disabledBy.length > 0) return; // cascades skip locked leaves (§4.7)
    if (cur.checked === value) return; // no change
    const incumbent = meta.get(node);
    if (incumbent && !beats(prec, incumbent)) return; // incumbent write wins
    draft[node] = { checked: value, disabledBy: cur.disabledBy };
    meta.set(node, prec);
    enqueue(node, prec.depth);
  };

  const applyReason = (node: LeafId, reason: string, op: 'add' | 'remove', depth: number): void => {
    const cur = draft[node];
    if (!cur) return;
    const has = cur.disabledBy.includes(reason);
    if (op === 'add' && has) return;
    if (op === 'remove' && !has) return;
    const disabledBy =
      op === 'add' ? [...cur.disabledBy, reason] : cur.disabledBy.filter((r) => r !== reason);
    draft[node] = { checked: cur.checked, disabledBy };
    enqueue(node, depth);
  };

  // Seed: direct user writes (priority 0, depth 0, earliest order). Disabled leaves resist.
  for (const seed of seeds) {
    applyChecked(seed.id, seed.checked, false, { priority: 0, depth: 0, order: -1 });
  }
  // Prime: nodes to evaluate without a user write (used by settleState).
  for (const node of primeQueue) enqueue(node, 0);

  while (queue.length > 0) {
    if (++iterations > cap) {
      throw new EngineError(
        `relation cascade did not converge after ${cap} iterations; likely a conflicting cycle. ` +
          `Recent nodes: ${queue.slice(0, 8).map((q) => q.node).join(', ')}`,
      );
    }
    const { node, depth } = queue.shift()!;
    const entries = config.adjacency.byTrigger.get(node);
    if (!entries) continue;
    for (const entry of entries) {
      const eff = computeEffect(entry.rel, entry.sourceId, node, draft);
      const prec: Precedence = { priority: entry.rel.priority, depth: depth + 1, order: entry.order };
      // Reasons first: a REQUIRES release must strip its lock before its restore write, or the
      // "skip disabled" guard would drop the restore. Forced writes use owner-bypass, so this
      // ordering is safe for DISABLES/REQUIRES-engage too.
      for (const r of eff.reasons) applyReason(r.node, r.reason, r.op, depth + 1);
      for (const w of eff.checked) applyChecked(w.node, w.checked, w.owner, prec);
    }
  }

  // §4.6 visibility runs once after the BFS fixed point (terminal writes, no re-BFS needed).
  reconcileVisibility(draft, config.visibility);

  return draft;
}

export function resolveToggle(
  state: CheckboxState,
  event: ToggleEvent,
  config: EngineConfig,
): CheckboxState {
  return propagate(state, config, seedsOf(event), []);
}

/** Evaluate every rule against a seeded state to establish initial invariant locks (load time). */
export function settleState(state: CheckboxState, config: EngineConfig): CheckboxState {
  return propagate(state, config, [], Object.keys(state));
}
