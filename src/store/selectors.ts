// §2/§4.5 — read-side derivations. selectCategoryState/selectFieldTableVisible source their
// leaf-id lists from the compiled config (a stable reference), never a caller-supplied array,
// so memoization at the component level holds.

import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './store';
import type { CheckboxValue, LeafId } from '../core/types';
import { aggregateValues, type AggregateState } from '../core/engine/derive';
import { isFieldVisible, type CompiledVisibility } from '../core/engine/visibility';
import type { CategoryDescendants } from '../core/config/tree';

export const selectCheckboxes = (s: RootState) => s.checkboxes;

export const selectCheckboxById = (id: LeafId) => (s: RootState) => s.checkboxes[id];

export interface CategoryColumnState {
  view: AggregateState;
  edit: AggregateState;
}

/**
 * Aggregate (tri-state) state for a category's VIEW and EDIT columns. Input selectors are one
 * per descendant leaf, so the memo recomputes only when *this* category's own leaves change
 * reference — not on every dispatch (the whole slice is replaced each click, so keying off it
 * re-ran every category's aggregate; see design v5 §6). Unchanged leaves keep their value-object
 * identity across the engine's `{...state}` copy, which is what makes this hold. The caller
 * builds one selector instance per category key via useMemo, preserving the memoization (§2, §6).
 */
export const selectCategoryState = (descendants: CategoryDescendants) => {
  const viewCount = descendants.viewLeafIds.length;
  const leafSelectors = [...descendants.viewLeafIds, ...descendants.editLeafIds].map(
    (id) => (s: RootState) => s.checkboxes[id],
  );
  return createSelector(
    leafSelectors,
    (...vals: (CheckboxValue | undefined)[]): CategoryColumnState => ({
      view: aggregateValues(vals.slice(0, viewCount)),
      edit: aggregateValues(vals.slice(viewCount)),
    }),
  );
};

export const selectFieldTableVisible =
  (visibility: CompiledVisibility, status: string) =>
  (s: RootState): boolean =>
    isFieldVisible(visibility, status, s.checkboxes);
