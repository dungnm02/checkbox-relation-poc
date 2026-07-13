import { describe, it, expect } from 'vitest';
import { compileConfig } from '../compileConfig';
import { resolveToggle } from './resolveToggle';
import { INITIAL_REASON, type BackendConfig, type CheckboxState } from '../types';

const R = 'R';
const S = 'S';
const id = (t: string, p: string) => `${R}/${S}/${t}/${p}`;
function cfg(partial: Pick<BackendConfig, 'content'> & Partial<BackendConfig>): BackendConfig {
  return { resourceType: 'T', resourceName: R, statuses: [S], ...partial };
}
const toggle = (st: CheckboxState, leaf: string, checked: boolean, engine: any) =>
  resolveToggle(st, { kind: 'leaf', id: leaf, checked }, engine);

describe('disabled semantics (§4.7)', () => {
  it('DISABLES_ON_CHECK with forceCheckedValue pins + locks its own target', () => {
    const compiled = compileConfig(
      cfg({
        content: [
          {
            status: S,
            action: [
              { id: id('ACTION', 'master'), isChecked: false, isDisabled: false },
              { id: id('ACTION', 'pref'), isChecked: true, isDisabled: false },
            ],
            field: [],
          },
        ],
        relations: [
          {
            sourceId: id('ACTION', 'master'),
            relationships: [
              { id: 'optout', type: 'DISABLES_ON_CHECK', targets: [id('ACTION', 'pref')], forceCheckedValue: false },
            ],
          },
        ],
      }),
    );
    const on = toggle(compiled.initialState, id('ACTION', 'master'), true, compiled.engine);
    expect(on[id('ACTION', 'pref')].checked).toBe(false); // forced
    expect(on[id('ACTION', 'pref')].disabledBy).toContain('optout'); // locked
    const off = toggle(on, id('ACTION', 'master'), false, compiled.engine);
    expect(off[id('ACTION', 'pref')].disabledBy).not.toContain('optout'); // released
    expect(off[id('ACTION', 'pref')].checked).toBe(false); // not restored
  });

  it('two rules lock one target and release independently', () => {
    const compiled = compileConfig(
      cfg({
        content: [
          {
            status: S,
            action: [
              { id: id('ACTION', 'a'), isChecked: false, isDisabled: false },
              { id: id('ACTION', 'b'), isChecked: false, isDisabled: false },
              { id: id('ACTION', 'x'), isChecked: false, isDisabled: false },
            ],
            field: [],
          },
        ],
        relations: [
          { sourceId: id('ACTION', 'a'), relationships: [{ id: 'lockA', type: 'DISABLES_ON_CHECK', targets: [id('ACTION', 'x')] }] },
          { sourceId: id('ACTION', 'b'), relationships: [{ id: 'lockB', type: 'DISABLES_ON_CHECK', targets: [id('ACTION', 'x')] }] },
        ],
      }),
    );
    let s = toggle(compiled.initialState, id('ACTION', 'a'), true, compiled.engine);
    s = toggle(s, id('ACTION', 'b'), true, compiled.engine);
    expect(s[id('ACTION', 'x')].disabledBy).toEqual(expect.arrayContaining(['lockA', 'lockB']));
    s = toggle(s, id('ACTION', 'a'), false, compiled.engine);
    expect(s[id('ACTION', 'x')].disabledBy).toContain('lockB');
    expect(s[id('ACTION', 'x')].disabledBy).not.toContain('lockA');
    expect(s[id('ACTION', 'x')].disabledBy.length).toBeGreaterThan(0); // still disabled
  });

  it('ENABLES cannot release a foreign reason (@initial stays)', () => {
    const compiled = compileConfig(
      cfg({
        content: [
          {
            status: S,
            action: [
              { id: id('ACTION', 'c'), isChecked: false, isDisabled: false },
              { id: id('ACTION', 'x'), isChecked: false, isDisabled: true }, // @initial
            ],
            field: [],
          },
        ],
        relations: [
          { sourceId: id('ACTION', 'c'), relationships: [{ id: 'enab', type: 'ENABLES_ON_CHECK', targets: [id('ACTION', 'x')] }] },
        ],
      }),
    );
    const s = toggle(compiled.initialState, id('ACTION', 'c'), true, compiled.engine);
    expect(s[id('ACTION', 'x')].disabledBy).toContain(INITIAL_REASON); // foreign reason survives
  });
});
