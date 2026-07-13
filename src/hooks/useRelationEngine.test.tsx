import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Provider } from 'react-redux';
import type { ReactNode } from 'react';
import { configureStore } from '@reduxjs/toolkit';
import { checkboxReducer, initializeCheckboxes } from '../store/checkboxSlice';
import { useRelationEngine } from './useRelationEngine';
import { compileConfig } from '../core/compileConfig';
import { aiFeatureConfig } from '../test/fixtures/aiFeature';

function setup() {
  const compiled = compileConfig(aiFeatureConfig);
  const store = configureStore({ reducer: { checkboxes: checkboxReducer } });
  store.dispatch(initializeCheckboxes(compiled.initialState));
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  const { result } = renderHook(() => useRelationEngine(compiled), { wrapper });
  return { compiled, store, engine: result.current };
}

describe('useRelationEngine (single write path, §2)', () => {
  it('toggleLeaf drives the EDIT⇒VIEW invariant through the store', () => {
    const { store, engine } = setup();
    act(() => engine.toggleLeaf('AI_FEATURE/IN_PROGRESS/EDIT/description'));
    const s = store.getState().checkboxes;
    expect(s['AI_FEATURE/IN_PROGRESS/EDIT/description'].checked).toBe(true);
    expect(s['AI_FEATURE/IN_PROGRESS/VIEW/description'].checked).toBe(true);
  });

  it('toggleLeaf is a no-op on a disabled leaf', () => {
    const { store, engine } = setup();
    const before = store.getState().checkboxes;
    act(() => engine.toggleLeaf('AI_FEATURE/IN_PROGRESS/EDIT/properties.owner')); // @initial disabled
    expect(store.getState().checkboxes).toEqual(before);
  });

  it('toggleCategory cascades to the column leaves', () => {
    const { compiled, store, engine } = setup();
    // Properties category key is IN_PROGRESS#0 (see tree tests)
    const key = [...compiled.categoryIndexByStatus.get('IN_PROGRESS')!.keys()][0];
    act(() => engine.toggleCategory(key, 'IN_PROGRESS', 'VIEW'));
    const s = store.getState().checkboxes;
    // name VIEW was false, owner VIEW was true → indeterminate → uncheck all
    expect(s['AI_FEATURE/IN_PROGRESS/VIEW/properties.name'].checked).toBe(false);
    expect(s['AI_FEATURE/IN_PROGRESS/VIEW/properties.owner'].checked).toBe(false);
  });
});
