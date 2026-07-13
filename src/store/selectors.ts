// §2/§4.5 — read-side derivations. selectCategoryState/selectFieldTableVisible source their
// leaf-id lists from the compiled config (a stable reference), never a caller-supplied array,
// so memoization at the component level holds.

import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './store';
import type { LeafId } from '../core/types';
import { aggregate, type AggregateState } from '../core/engine/derive';
import { isFieldVisible, type CompiledVisibility } from '../core/engine/visibility';
import type { CategoryDescendants } from '../core/config/tree';

export const selectCheckboxes = (s: RootState) => s.checkboxes;

export const selectCheckboxById = (id: LeafId) => (s: RootState) => s.checkboxes[id];

export interface CategoryColumnState {
  view: AggregateState;
  edit: AggregateState;
}

/**
 * Aggregate (tri-state) state for a category's VIEW and EDIT columns. Memoized per category
 * (createSelector) so it returns a stable reference while state is unchanged — the caller
 * builds one instance per category key via useMemo, preserving that memoization (§2, §6).
 */
export const selectCategoryState = (descendants: CategoryDescendants) =>
  createSelector(
    [selectCheckboxes],
    (checkboxes): CategoryColumnState => ({
      view: aggregate(checkboxes, descendants.viewLeafIds),
      edit: aggregate(checkboxes, descendants.editLeafIds),
    }),
  );

export const selectFieldTableVisible =
  (visibility: CompiledVisibility, status: string) =>
  (s: RootState): boolean =>
    isFieldVisible(visibility, status, s.checkboxes);
