// §2 — the ONLY module that writes the checkbox slice. Each interaction: read state once,
// normalize the click into a ToggleEvent, run the pure engine, dispatch a single commit.

import { useCallback, useMemo } from 'react';
import type { CompiledConfig } from '../core/compileConfig';
import type { ColumnType, LeafId } from '../core/types';
import { categoryToggleEvent, leafToggleEvent } from '../core/engine/derive';
import { resolveToggle } from '../core/engine/resolveToggle';
import { setAllCheckboxes } from '../store/checkboxSlice';
import { useAppDispatch, useAppStore } from '../store/hooks';

export interface RelationEngineHandles {
  toggleLeaf: (id: LeafId) => void;
  toggleCategory: (categoryKey: string, status: string, column: Extract<ColumnType, 'VIEW' | 'EDIT'>) => void;
}

export function useRelationEngine(compiled: CompiledConfig): RelationEngineHandles {
  const store = useAppStore();
  const dispatch = useAppDispatch();

  const toggleLeaf = useCallback(
    (id: LeafId) => {
      const state = store.getState().checkboxes; // single read
      const event = leafToggleEvent(state, id);
      if (!event) return; // disabled / unknown → no-op
      dispatch(setAllCheckboxes(resolveToggle(state, event, compiled.engine))); // single write
    },
    [store, dispatch, compiled],
  );

  const toggleCategory = useCallback(
    (categoryKey: string, status: string, column: 'VIEW' | 'EDIT') => {
      const state = store.getState().checkboxes;
      const descendants = compiled.categoryIndexByStatus.get(status)?.get(categoryKey);
      if (!descendants) return;
      const leafIds = column === 'VIEW' ? descendants.viewLeafIds : descendants.editLeafIds;
      const event = categoryToggleEvent(state, leafIds);
      if (!event) return;
      dispatch(setAllCheckboxes(resolveToggle(state, event, compiled.engine)));
    },
    [store, dispatch, compiled],
  );

  return useMemo(() => ({ toggleLeaf, toggleCategory }), [toggleLeaf, toggleCategory]);
}
