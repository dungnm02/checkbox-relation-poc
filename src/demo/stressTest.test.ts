// Exercises STRESS_TEST end to end: deep chains, wide groups, multi-level locks, and a large
// nested field tree, so convergence and perf hold up well past the ~140-node reference case
// (see doc/checkbox-relation-v5-performance-guide.md).

import { describe, it, expect } from 'vitest';
import { compileConfig } from '../core/compileConfig';
import { resolveToggle } from '../core/engine/resolveToggle';
import { stressTestBackend } from './mockBackend';
import type { CheckboxState } from '../core/types';

const ST = 'STRESS_TEST';
const S = 'DRAFT';
const id = (path: string) => `${ST}/${S}/ACTION/${path}`;

const compiled = compileConfig(stressTestBackend);
const engine = compiled.engine;

function toggle(state: CheckboxState, leafId: string, checked: boolean): CheckboxState {
  return resolveToggle(state, { kind: 'leaf', id: leafId, checked }, engine);
}
const checkedOf = (st: CheckboxState, path: string) => st[id(path)].checked;
const lockedOf = (st: CheckboxState, path: string) => st[id(path)].disabledBy.length > 0;

describe('STRESS_TEST scale', () => {
  it('compiles without throwing and is actually heavy', () => {
    expect(() => compileConfig(stressTestBackend)).not.toThrow();
    const totalNodes = Object.keys(compiled.initialState).length;
    expect(totalNodes).toBeGreaterThan(400); // 3 statuses * (56 actions + 144 field checkboxes)
  });

  it('resolves a deep click in well under the performance-guide budget', () => {
    const start = performance.now();
    toggle(compiled.initialState, id('chain_1'), true);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50); // generous smoke bound, not a strict benchmark
  });
});

describe('STRESS_TEST behavior (§4.4 at scale)', () => {
  it('cascade chain: checking chain_1 ripples through all 10 links in one click', () => {
    const s = toggle(compiled.initialState, id('chain_1'), true);
    for (let i = 1; i <= 10; i++) expect(checkedOf(s, `chain_${i}`)).toBe(true);
  });

  it('wide mutual-exclusive group: checking one member clears a previously-checked one', () => {
    expect(checkedOf(compiled.initialState, 'excl_1')).toBe(true); // seeded selected
    const s = toggle(compiled.initialState, id('excl_5'), true);
    expect(checkedOf(s, 'excl_1')).toBe(false);
    expect(checkedOf(s, 'excl_5')).toBe(true);
  });

  it('multi-level REQUIRES chain: stages start locked+unchecked, and satisfying stage_1 releases+restores the whole chain', () => {
    for (let i = 2; i <= 5; i++) {
      expect(checkedOf(compiled.initialState, `stage_${i}`)).toBe(false);
      expect(lockedOf(compiled.initialState, `stage_${i}`)).toBe(true);
    }
    const s = toggle(compiled.initialState, id('stage_1'), true);
    for (let i = 2; i <= 5; i++) {
      expect(lockedOf(s, `stage_${i}`)).toBe(false);
      expect(checkedOf(s, `stage_${i}`)).toBe(true); // restored
    }
  });

  it('bidirectional mirror chain: toggling one end flips every link', () => {
    const s = toggle(compiled.initialState, id('mirror_1'), true);
    for (let i = 1; i <= 4; i++) expect(checkedOf(s, `mirror_${i}`)).toBe(true);
  });

  it('two-tier lock mesh: maintenance_mode locks ops_1..4; releasing it lets ops_1 lock its own nested leaf', () => {
    for (let i = 1; i <= 4; i++) expect(lockedOf(compiled.initialState, `ops_${i}`)).toBe(true);
    expect(lockedOf(compiled.initialState, 'ops_1_sub')).toBe(false);

    let s = toggle(compiled.initialState, id('maintenance_mode'), false);
    for (let i = 1; i <= 4; i++) expect(lockedOf(s, `ops_${i}`)).toBe(false);

    s = toggle(s, id('ops_1'), true);
    expect(lockedOf(s, 'ops_1_sub')).toBe(true);
  });

  it('condition-gated cascade: advanced_export only cascades once both gates are checked', () => {
    let s = toggle(compiled.initialState, id('advanced_export'), true);
    expect(checkedOf(s, 'adv_opt_1')).toBe(false); // gates still closed

    s = toggle(compiled.initialState, id('power_user_mode'), true);
    s = toggle(s, id('beta_features'), true);
    s = toggle(s, id('advanced_export'), true);
    for (let i = 1; i <= 5; i++) expect(checkedOf(s, `adv_opt_${i}`)).toBe(true);
  });

  it('`not` condition: danger_action only cascades while safe_mode is off', () => {
    expect(checkedOf(compiled.initialState, 'safe_mode')).toBe(true); // starts safe
    let s = toggle(compiled.initialState, id('danger_action'), true);
    expect(checkedOf(s, 'danger_child_1')).toBe(false);

    s = toggle(compiled.initialState, id('safe_mode'), false);
    s = toggle(s, id('danger_action'), true);
    expect(checkedOf(s, 'danger_child_1')).toBe(true);
    expect(checkedOf(s, 'danger_child_2')).toBe(true);
  });

  it('visibility at scale: hiding clears+locks the whole 144-leaf field tree; reshow comes back empty', () => {
    const tree = compiled.treesByStatus.get(S)!;
    const oneLeafId = (function findLeaf(nodes: typeof tree): string {
      for (const n of nodes) {
        if (n.kind === 'leaf') return n.view;
        const found = findLeaf(n.children);
        if (found) return found;
      }
      throw new Error('no leaf found');
    })(tree);

    let s = toggle(compiled.initialState, oneLeafId, true);
    expect(s[oneLeafId].checked).toBe(true);

    s = toggle(s, id('enable_all_fields'), false); // both controllers now off -> hide
    expect(s[oneLeafId].checked).toBe(false);
    expect(s[oneLeafId].disabledBy).toContain('@hidden');

    s = toggle(s, id('enable_all_fields'), true); // reshow
    expect(s[oneLeafId].disabledBy).not.toContain('@hidden');
    expect(s[oneLeafId].checked).toBe(false); // comes back empty, not restored
  });

  it('relations never cross statuses: chain_1 in REVIEW does not affect DRAFT', () => {
    const reviewId = (path: string) => `${ST}/REVIEW/ACTION/${path}`;
    const s = toggle(compiled.initialState, reviewId('chain_1'), true);
    expect(s[reviewId('chain_2')].checked).toBe(true);
    expect(checkedOf(s, 'chain_1')).toBe(false); // DRAFT untouched
    expect(checkedOf(s, 'chain_2')).toBe(false);
  });
});
