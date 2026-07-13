// §2 — the checkbox slice: Record<LeafId, CheckboxValue>, keyed by full id (STATUS namespaces
// itself). The ONLY writer is `setAllCheckboxes`, dispatched once per interaction by
// useRelationEngine — the single write path that makes invariant relations hold.

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CheckboxState } from '../core/types';

const initialState: CheckboxState = {};

const checkboxSlice = createSlice({
  name: 'checkboxes',
  initialState,
  reducers: {
    /** Seed the slice from a compiled config's initial (settled) state. */
    initializeCheckboxes: (_state, action: PayloadAction<CheckboxState>) => action.payload,
    /** Replace the whole slice with the engine's computed next state (single commit). */
    setAllCheckboxes: (_state, action: PayloadAction<CheckboxState>) => action.payload,
  },
});

export const { initializeCheckboxes, setAllCheckboxes } = checkboxSlice.actions;
export const checkboxReducer = checkboxSlice.reducer;
