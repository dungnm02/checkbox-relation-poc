import { describe, it, expect } from 'vitest';
import { selectCategoryState } from './selectors';
import type { RootState } from './store';
import type { CheckboxState, CheckboxValue } from '../core/types';

const val = (checked: boolean, disabledBy: string[] = []): CheckboxValue => ({ checked, disabledBy });
const rs = (checkboxes: CheckboxState): RootState => ({ checkboxes } as unknown as RootState);

const descendants = { viewLeafIds: ['a', 'b'], editLeafIds: ['c'] };

describe('selectCategoryState (§4.5, §6 memoization)', () => {
  it('derives per-column tri-state', () => {
    const a = val(true), b = val(false), c = val(true);
    const out = selectCategoryState(descendants)(rs({ a, b, c }));
    expect(out.view).toMatchObject({ checked: false, indeterminate: true }); // a on, b off
    expect(out.edit).toMatchObject({ checked: true, indeterminate: false }); // c on
  });

  it('holds its memo when the slice is replaced but its own leaves are unchanged', () => {
    const sel = selectCategoryState(descendants);
    const a = val(true), b = val(false), c = val(true);
    const first = sel(rs({ a, b, c }));
    // New slice object (as every dispatch produces), same leaf refs + an unrelated new leaf.
    const second = sel(rs({ a, b, c, z: val(true) }));
    expect(second).toBe(first); // stable reference → AggregateCell does not re-render
  });

  it('recomputes when one of its own descendant leaves changes reference', () => {
    const sel = selectCategoryState(descendants);
    const a = val(true), b = val(false), c = val(true);
    const first = sel(rs({ a, b, c }));
    const second = sel(rs({ a, b, c: val(false) })); // c toggled → new value object
    expect(second).not.toBe(first);
    expect(second.edit).toMatchObject({ checked: false, indeterminate: false });
  });
});
