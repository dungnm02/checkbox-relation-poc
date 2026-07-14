// Pure UI helpers (no React, no store): derive category aggregate state (§4.5) and normalize
// user clicks into ToggleEvents (§4.4, §4.5). Kept in core so they are unit-testable.

import type { CheckboxState, CheckboxValue, LeafId } from '../types';
import type { ToggleEvent } from './resolveToggle';

export interface AggregateState {
  checked: boolean; // all descendant leaves checked
  indeterminate: boolean; // some (but not all) checked
  disabled: boolean; // all descendant leaves disabled
}

/**
 * Tri-state aggregate over already-resolved leaf values (unknown ids passed as undefined and
 * skipped). Kept value-based so selectors can memoize on the individual leaf references (§6) —
 * the whole-slice-keyed form re-ran every category on every click.
 */
export function aggregateValues(values: (CheckboxValue | undefined)[]): AggregateState {
  const vals = values.filter((v): v is CheckboxValue => Boolean(v));
  if (vals.length === 0) return { checked: false, indeterminate: false, disabled: false };
  const checkedCount = vals.filter((v) => v.checked).length;
  const allChecked = checkedCount === vals.length;
  return {
    checked: allChecked,
    indeterminate: !allChecked && checkedCount > 0,
    disabled: vals.every((v) => v.disabledBy.length > 0),
  };
}

export function aggregate(state: CheckboxState, leafIds: LeafId[]): AggregateState {
  return aggregateValues(leafIds.map((id) => state[id]));
}

/** A leaf click → toggle event, or null if the leaf is disabled / unknown (no-op). */
export function leafToggleEvent(state: CheckboxState, id: LeafId): ToggleEvent | null {
  const v = state[id];
  if (!v || v.disabledBy.length > 0) return null;
  return { kind: 'leaf', id, checked: !v.checked };
}

/**
 * A category aggregate click → cascade event over that column's descendant leaves (§4.5):
 * checked/indeterminate → uncheck all; unchecked → check all. Disabled leaves are excluded
 * from the write set. Returns null if nothing is togglable.
 */
export function categoryToggleEvent(state: CheckboxState, leafIds: LeafId[]): ToggleEvent | null {
  const writable = leafIds.filter((id) => state[id] && state[id].disabledBy.length === 0);
  if (writable.length === 0) return null;
  const anyChecked = leafIds.some((id) => state[id]?.checked === true);
  return { kind: 'category', leafIds: writable, checked: !anyChecked };
}
