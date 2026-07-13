// §4.6 Region Visibility — several ACTION checkboxes jointly control the FIELD table.
// Visible ⟺ ANY controller checked. Hiding force-unchecks + locks ("@hidden") every FIELD
// leaf. This is NOT a relation primitive; it runs as a reconciliation pass after the BFS
// settles, writing only terminal (unchecked + locked) values so it cannot restart oscillation.

import { ConfigError } from '../errors';
import type { ParsedId } from '../grammar/parseId';
import { HIDDEN_REASON, type LeafId, type NamedSelector, type VisibilityBinding } from '../types';
import { desugar, matchUniverse } from '../expressions/pattern';
import type { DraftState } from './effects';

export interface CompiledVisibilityStatus {
  status: string;
  controllerIds: LeafId[];
  fieldLeafIds: LeafId[];
}

/** Per-status controller + field-leaf sets. Empty when the config declares no visibility. */
export type CompiledVisibility = CompiledVisibilityStatus[];

export function compileVisibility(
  bindings: VisibilityBinding[] | undefined,
  selectors: Map<string, NamedSelector>,
  universe: ParsedId[],
): CompiledVisibility {
  if (!bindings?.length) return [];

  const controllersByStatus = new Map<string, Set<LeafId>>();
  for (const binding of bindings) {
    if (binding.region !== 'FIELD') {
      throw new ConfigError(`visibility region "${binding.region}" is unsupported (v4: FIELD only)`);
    }
    for (const ref of binding.controlledBy) {
      const ids = matchUniverse(desugar(ref, selectors), universe);
      if (ids.length === 0) throw new ConfigError(`visibility controller "${ref}" resolves to zero leaves`);
      for (const id of ids) {
        const parsed = universe.find((p) => p.raw === id)!;
        if (parsed.type !== 'ACTION') {
          throw new ConfigError(`visibility controller "${id}" must be an ACTION checkbox`);
        }
        const set = controllersByStatus.get(parsed.status) ?? new Set<LeafId>();
        set.add(id);
        controllersByStatus.set(parsed.status, set);
      }
    }
  }

  const out: CompiledVisibility = [];
  for (const [status, controllers] of controllersByStatus) {
    const fieldLeafIds = universe
      .filter((p) => p.status === status && (p.type === 'VIEW' || p.type === 'EDIT'))
      .map((p) => p.raw);
    out.push({ status, controllerIds: [...controllers], fieldLeafIds });
  }
  return out;
}

/** Is the FIELD table visible for a status? (No binding for a status ⇒ always visible.) */
export function isFieldVisible(compiled: CompiledVisibility, status: string, draft: DraftState): boolean {
  const entry = compiled.find((e) => e.status === status);
  if (!entry) return true;
  return entry.controllerIds.some((id) => draft[id]?.checked === true);
}

/** Apply the visibility side effect to the draft. Returns true if anything changed. */
export function reconcileVisibility(draft: DraftState, compiled: CompiledVisibility): boolean {
  let changed = false;
  for (const entry of compiled) {
    const visible = entry.controllerIds.some((id) => draft[id]?.checked === true);
    for (const leafId of entry.fieldLeafIds) {
      const value = draft[leafId];
      if (!value) continue;
      const hasHidden = value.disabledBy.includes(HIDDEN_REASON);
      if (!visible) {
        // hide: force-uncheck + lock
        if (value.checked) {
          draft[leafId] = { ...value, checked: false, disabledBy: value.disabledBy };
          changed = true;
        }
        if (!hasHidden) {
          draft[leafId] = { ...draft[leafId], disabledBy: [...draft[leafId].disabledBy, HIDDEN_REASON] };
          changed = true;
        }
      } else if (hasHidden) {
        // show: release the @hidden lock (fields stay as they are — empty)
        draft[leafId] = {
          ...value,
          disabledBy: value.disabledBy.filter((r) => r !== HIDDEN_REASON),
        };
        changed = true;
      }
    }
  }
  return changed;
}
