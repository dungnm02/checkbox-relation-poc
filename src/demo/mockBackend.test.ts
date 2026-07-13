// Exercises the RELATION_TYPES demo config end-to-end — one status per primitive — so the
// demo doubles as a regression-checked example of every relation type in §4.4.

import { describe, it, expect } from 'vitest';
import { compileConfig } from '../core/compileConfig';
import { resolveToggle } from '../core/engine/resolveToggle';
import { relationTypesBackend, aiFeatureBackend, reportBackend } from './mockBackend';
import type { CheckboxState } from '../core/types';

const id = (status: string, path: string) => `RELATION_TYPES/${status}/ACTION/${path}`;
const compiled = compileConfig(relationTypesBackend);
const engine = compiled.engine;

function toggle(state: CheckboxState, leafId: string, checked: boolean): CheckboxState {
  return resolveToggle(state, { kind: 'leaf', id: leafId, checked }, engine);
}
const checkedOf = (st: CheckboxState, leafId: string) => st[leafId].checked;
const lockedOf = (st: CheckboxState, leafId: string) => st[leafId].disabledBy.length > 0;

describe('demo configs compile without throwing', () => {
  it('AI_FEATURE, REPORT, and RELATION_TYPES all compile', () => {
    expect(() => compileConfig(aiFeatureBackend)).not.toThrow();
    expect(() => compileConfig(reportBackend)).not.toThrow();
    expect(() => compileConfig(relationTypesBackend)).not.toThrow();
  });
});

describe('RELATION_TYPES examples (§4.4)', () => {
  it('CASCADES_CHECK: checking the source checks targets; unchecking it does not uncheck them', () => {
    let s = toggle(compiled.initialState, id('CASCADES_CHECK', 'select_all'), true);
    expect(checkedOf(s, id('CASCADES_CHECK', 'item_a'))).toBe(true);
    expect(checkedOf(s, id('CASCADES_CHECK', 'item_b'))).toBe(true);
    s = toggle(s, id('CASCADES_CHECK', 'select_all'), false);
    expect(checkedOf(s, id('CASCADES_CHECK', 'item_a'))).toBe(true); // untouched
  });

  it('CASCADES_UNCHECK: unchecking the source unchecks targets; checking it does not check them', () => {
    let s = toggle(compiled.initialState, id('CASCADES_UNCHECK', 'clear_all'), false);
    expect(checkedOf(s, id('CASCADES_UNCHECK', 'item_a'))).toBe(false);
    expect(checkedOf(s, id('CASCADES_UNCHECK', 'item_b'))).toBe(false);
    s = toggle(s, id('CASCADES_UNCHECK', 'clear_all'), true);
    expect(checkedOf(s, id('CASCADES_UNCHECK', 'item_a'))).toBe(false); // untouched
  });

  it('CASCADES_BOTH: the source drives targets in both directions', () => {
    let s = toggle(compiled.initialState, id('CASCADES_BOTH', 'group_all'), true);
    expect(checkedOf(s, id('CASCADES_BOTH', 'member_a'))).toBe(true);
    s = toggle(s, id('CASCADES_BOTH', 'group_all'), false);
    expect(checkedOf(s, id('CASCADES_BOTH', 'member_a'))).toBe(false);
  });

  it('GROUP_ALL: compiles to identical behavior as CASCADES_BOTH', () => {
    const s = toggle(compiled.initialState, id('GROUP_ALL', 'toggle_all'), true);
    expect(checkedOf(s, id('GROUP_ALL', 'row_1'))).toBe(true);
    expect(checkedOf(s, id('GROUP_ALL', 'row_2'))).toBe(true);
  });

  it('MUTUAL_EXCLUSIVE: checking the source unchecks the group (at most one)', () => {
    const s = toggle(compiled.initialState, id('MUTUAL_EXCLUSIVE', 'option_a'), true);
    expect(checkedOf(s, id('MUTUAL_EXCLUSIVE', 'option_b'))).toBe(false);
    expect(checkedOf(s, id('MUTUAL_EXCLUSIVE', 'option_c'))).toBe(false);
  });

  it('INVERSE: target always holds the opposite of the source', () => {
    let s = toggle(compiled.initialState, id('INVERSE', 'dark_mode'), true);
    expect(checkedOf(s, id('INVERSE', 'light_mode_active'))).toBe(false);
    s = toggle(s, id('INVERSE', 'dark_mode'), false);
    expect(checkedOf(s, id('INVERSE', 'light_mode_active'))).toBe(true);
  });

  it('BIDIRECTIONAL: toggling either side mirrors the other', () => {
    const s = toggle(compiled.initialState, id('BIDIRECTIONAL', 'switch_a'), true);
    expect(checkedOf(s, id('BIDIRECTIONAL', 'switch_b'))).toBe(true);
    const s2 = toggle(compiled.initialState, id('BIDIRECTIONAL', 'switch_b'), true);
    expect(checkedOf(s2, id('BIDIRECTIONAL', 'switch_a'))).toBe(true);
  });

  it('REQUIRES: source starts locked+unchecked; satisfying the target releases and restores it', () => {
    expect(checkedOf(compiled.initialState, id('REQUIRES', 'publish'))).toBe(false);
    expect(lockedOf(compiled.initialState, id('REQUIRES', 'publish'))).toBe(true);
    const s = toggle(compiled.initialState, id('REQUIRES', 'reviewed'), true);
    expect(lockedOf(s, id('REQUIRES', 'publish'))).toBe(false);
    expect(checkedOf(s, id('REQUIRES', 'publish'))).toBe(true); // restored
  });

  it('DISABLES_ON_CHECK: checking the source locks + force-unchecks the target', () => {
    expect(checkedOf(compiled.initialState, id('DISABLES_ON_CHECK', 'edit_content'))).toBe(true);
    const s = toggle(compiled.initialState, id('DISABLES_ON_CHECK', 'read_only'), true);
    expect(lockedOf(s, id('DISABLES_ON_CHECK', 'edit_content'))).toBe(true);
    expect(checkedOf(s, id('DISABLES_ON_CHECK', 'edit_content'))).toBe(false);
  });

  it('DISABLES_ON_UNCHECK: unchecking the source locks the target', () => {
    expect(lockedOf(compiled.initialState, id('DISABLES_ON_UNCHECK', 'send_notifications'))).toBe(false);
    const s = toggle(compiled.initialState, id('DISABLES_ON_UNCHECK', 'account_active'), false);
    expect(lockedOf(s, id('DISABLES_ON_UNCHECK', 'send_notifications'))).toBe(true);
  });

  it('ENABLES_ON_CHECK: target starts locked; checking the source releases it', () => {
    expect(lockedOf(compiled.initialState, id('ENABLES_ON_CHECK', 'restricted_area'))).toBe(true);
    const s = toggle(compiled.initialState, id('ENABLES_ON_CHECK', 'unlock_access'), true);
    expect(lockedOf(s, id('ENABLES_ON_CHECK', 'restricted_area'))).toBe(false);
  });

  it('ENABLES_ON_UNCHECK: target starts locked; unchecking the source releases it', () => {
    expect(lockedOf(compiled.initialState, id('ENABLES_ON_UNCHECK', 'user_actions'))).toBe(true);
    const s = toggle(compiled.initialState, id('ENABLES_ON_UNCHECK', 'maintenance_mode'), false);
    expect(lockedOf(s, id('ENABLES_ON_UNCHECK', 'user_actions'))).toBe(false);
  });

  it('condition: the cascade only fires while the condition holds, and re-fires when it changes', () => {
    // Reports Enabled is off: checking Send Report does nothing to Include Charts.
    let s = toggle(compiled.initialState, id('CONDITION', 'send_report'), true);
    expect(checkedOf(s, id('CONDITION', 'include_charts'))).toBe(false);
    // Now flip the condition input — the rule re-evaluates against Send Report's current state.
    s = toggle(s, id('CONDITION', 'reports_enabled'), true);
    expect(checkedOf(s, id('CONDITION', 'include_charts'))).toBe(true);
  });
});
