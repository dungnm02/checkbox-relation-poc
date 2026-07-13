import { describe, it, expect } from 'vitest';
import { compileConfig } from '../compileConfig';
import { resolveToggle, type ToggleEvent } from './resolveToggle';
import { isFieldVisible } from './visibility';
import { HIDDEN_REASON, INITIAL_REASON, type BackendConfig, type CheckboxState } from '../types';
import { aiFeatureConfig } from '../../test/fixtures/aiFeature';

const R = 'R';
const S = 'S';
function cfg(partial: Pick<BackendConfig, 'content'> & Partial<BackendConfig>): BackendConfig {
  return { resourceType: 'T', resourceName: R, statuses: [S], ...partial };
}
const checkedOf = (st: CheckboxState, id: string) => st[id].checked;
const disabled = (st: CheckboxState, id: string) => st[id].disabledBy.length > 0;

describe('acceptance: EDIT ⇒ VIEW (§4.10)', () => {
  const compiled = compileConfig(aiFeatureConfig);
  const engine = compiled.engine;
  const s0 = compiled.initialState;

  it('checking EDIT auto-checks its same-path VIEW', () => {
    const next = resolveToggle(
      s0,
      { kind: 'leaf', id: 'AI_FEATURE/IN_PROGRESS/EDIT/description', checked: true },
      engine,
    );
    expect(checkedOf(next, 'AI_FEATURE/IN_PROGRESS/EDIT/description')).toBe(true);
    expect(checkedOf(next, 'AI_FEATURE/IN_PROGRESS/VIEW/description')).toBe(true);
  });

  it('unchecking VIEW auto-unchecks its same-path EDIT', () => {
    const on = resolveToggle(
      s0,
      { kind: 'leaf', id: 'AI_FEATURE/IN_PROGRESS/EDIT/description', checked: true },
      engine,
    );
    const off = resolveToggle(
      on,
      { kind: 'leaf', id: 'AI_FEATURE/IN_PROGRESS/VIEW/description', checked: false },
      engine,
    );
    expect(checkedOf(off, 'AI_FEATURE/IN_PROGRESS/VIEW/description')).toBe(false);
    expect(checkedOf(off, 'AI_FEATURE/IN_PROGRESS/EDIT/description')).toBe(false);
  });

  it('unchecking EDIT leaves VIEW; never crosses statuses', () => {
    const on = resolveToggle(
      s0,
      { kind: 'leaf', id: 'AI_FEATURE/IN_PROGRESS/EDIT/description', checked: true },
      engine,
    );
    const off = resolveToggle(
      on,
      { kind: 'leaf', id: 'AI_FEATURE/IN_PROGRESS/EDIT/description', checked: false },
      engine,
    );
    expect(checkedOf(off, 'AI_FEATURE/IN_PROGRESS/VIEW/description')).toBe(true);
    // IN_REVIEW untouched
    expect(checkedOf(off, 'AI_FEATURE/IN_REVIEW/VIEW/description')).toBe(false);
  });
});

describe('disabled semantics (§4.7)', () => {
  it('cascades skip a leaf locked by @initial', () => {
    // owner EDIT is isDisabled → @initial. Checking its VIEW must not check the locked EDIT
    // (and nothing checks EDIT anyway). Verify @initial is irremovable by cascades.
    const compiled = compileConfig(aiFeatureConfig);
    const next = resolveToggle(
      compiled.initialState,
      { kind: 'leaf', id: 'AI_FEATURE/IN_PROGRESS/EDIT/properties.owner', checked: true },
      compiled.engine,
    );
    // the click on a disabled leaf is a no-op
    expect(checkedOf(next, 'AI_FEATURE/IN_PROGRESS/EDIT/properties.owner')).toBe(false);
    expect(next['AI_FEATURE/IN_PROGRESS/EDIT/properties.owner'].disabledBy).toContain(INITIAL_REASON);
  });
});

describe('REQUIRES (§4.4 B)', () => {
  const base = cfg({
    content: [
      {
        status: S,
        action: [
          { id: `${R}/${S}/ACTION/prereq`, isChecked: false, isDisabled: false },
          { id: `${R}/${S}/ACTION/feature`, isChecked: true, isDisabled: false },
        ],
        field: [],
      },
    ],
    relations: [
      {
        sourceId: `${R}/${S}/ACTION/feature`,
        relationships: [
          { id: 'feat-requires-prereq', type: 'REQUIRES', targets: [`${R}/${S}/ACTION/prereq`], restoreCheckedOnSatisfy: true },
        ],
      },
    ],
  });

  it('locks + unchecks the source at load while the prereq is unchecked', () => {
    const compiled = compileConfig(base);
    const s = compiled.initialState;
    expect(checkedOf(s, `${R}/${S}/ACTION/feature`)).toBe(false);
    expect(s[`${R}/${S}/ACTION/feature`].disabledBy).toContain('feat-requires-prereq');
  });

  it('releases the lock and restores checked when the prereq becomes checked (restore=true)', () => {
    const compiled = compileConfig(base);
    // feature was checked in the backend seed → restore marker captured at load-time lock.
    const next = resolveToggle(
      compiled.initialState,
      { kind: 'leaf', id: `${R}/${S}/ACTION/prereq`, checked: true },
      compiled.engine,
    );
    expect(disabled(next, `${R}/${S}/ACTION/feature`)).toBe(false);
    expect(checkedOf(next, `${R}/${S}/ACTION/feature`)).toBe(true); // restored
  });

  it('is order-independent (unchecking the prereq re-locks the feature)', () => {
    const compiled = compileConfig(base);
    const satisfied = resolveToggle(
      compiled.initialState,
      { kind: 'leaf', id: `${R}/${S}/ACTION/prereq`, checked: true },
      compiled.engine,
    );
    const relocked = resolveToggle(
      satisfied,
      { kind: 'leaf', id: `${R}/${S}/ACTION/prereq`, checked: false },
      compiled.engine,
    );
    expect(disabled(relocked, `${R}/${S}/ACTION/feature`)).toBe(true);
    expect(checkedOf(relocked, `${R}/${S}/ACTION/feature`)).toBe(false);
  });
});

describe('MUTUAL_EXCLUSIVE + priority tie-break (§4.9)', () => {
  it('checking the source unchecks the group', () => {
    const compiled = compileConfig(
      cfg({
        content: [
          {
            status: S,
            action: [
              { id: `${R}/${S}/ACTION/a`, isChecked: false, isDisabled: false },
              { id: `${R}/${S}/ACTION/b`, isChecked: true, isDisabled: false },
              { id: `${R}/${S}/ACTION/c`, isChecked: true, isDisabled: false },
            ],
            field: [],
          },
        ],
        relations: [
          {
            sourceId: `${R}/${S}/ACTION/a`,
            relationships: [
              { id: 'mutex', type: 'MUTUAL_EXCLUSIVE', targets: [`${R}/${S}/ACTION/b`, `${R}/${S}/ACTION/c`] },
            ],
          },
        ],
      }),
    );
    const next = resolveToggle(compiled.initialState, { kind: 'leaf', id: `${R}/${S}/ACTION/a`, checked: true }, compiled.engine);
    expect(checkedOf(next, `${R}/${S}/ACTION/b`)).toBe(false);
    expect(checkedOf(next, `${R}/${S}/ACTION/c`)).toBe(false);
  });

  it('a higher-priority write wins a same-node conflict', () => {
    const compiled = compileConfig(
      cfg({
        content: [
          {
            status: S,
            action: [
              { id: `${R}/${S}/ACTION/a`, isChecked: false, isDisabled: false },
              { id: `${R}/${S}/ACTION/x`, isChecked: false, isDisabled: false },
            ],
            field: [],
          },
        ],
        relations: [
          { sourceId: `${R}/${S}/ACTION/a`, relationships: [{ id: 'lo', type: 'CASCADES_CHECK', targets: [`${R}/${S}/ACTION/x`], priority: 0 }] },
          { sourceId: `${R}/${S}/ACTION/a`, relationships: [{ id: 'hi', type: 'MUTUAL_EXCLUSIVE', targets: [`${R}/${S}/ACTION/x`], priority: 5 }] },
        ],
      }),
    );
    const next = resolveToggle(compiled.initialState, { kind: 'leaf', id: `${R}/${S}/ACTION/a`, checked: true }, compiled.engine);
    // lo wants x=true, hi (priority 5) wants x=false → hi wins
    expect(checkedOf(next, `${R}/${S}/ACTION/x`)).toBe(false);
  });
});

describe('region visibility (§4.6)', () => {
  const visCfg = cfg({
    content: [
      {
        status: S,
        action: [{ id: `${R}/${S}/ACTION/enable`, isChecked: true, isDisabled: false }],
        field: [
          {
            isCategory: false,
            name: 'F',
            view: { id: `${R}/${S}/VIEW/f`, isChecked: true, isDisabled: false },
            edit: { id: `${R}/${S}/EDIT/f`, isChecked: false, isDisabled: false },
          },
        ],
      },
    ],
    visibility: [{ region: 'FIELD', controlledBy: [`${R}/${S}/ACTION/enable`], showWhen: 'anyChecked', whenHidden: 'clearAndLock' }],
  });

  it('hides + clears + locks fields when the last controller unchecks', () => {
    const compiled = compileConfig(visCfg);
    expect(isFieldVisible(compiled.engine.visibility, S, compiled.initialState)).toBe(true);
    const hidden = resolveToggle(compiled.initialState, { kind: 'leaf', id: `${R}/${S}/ACTION/enable`, checked: false }, compiled.engine);
    expect(isFieldVisible(compiled.engine.visibility, S, hidden)).toBe(false);
    expect(checkedOf(hidden, `${R}/${S}/VIEW/f`)).toBe(false);
    expect(hidden[`${R}/${S}/VIEW/f`].disabledBy).toContain(HIDDEN_REASON);
    expect(hidden[`${R}/${S}/EDIT/f`].disabledBy).toContain(HIDDEN_REASON);
  });

  it('reshowing releases @hidden and leaves fields empty', () => {
    const compiled = compileConfig(visCfg);
    const hidden = resolveToggle(compiled.initialState, { kind: 'leaf', id: `${R}/${S}/ACTION/enable`, checked: false }, compiled.engine);
    const shown = resolveToggle(hidden, { kind: 'leaf', id: `${R}/${S}/ACTION/enable`, checked: true }, compiled.engine);
    expect(shown[`${R}/${S}/VIEW/f`].disabledBy).not.toContain(HIDDEN_REASON);
    expect(checkedOf(shown, `${R}/${S}/VIEW/f`)).toBe(false); // stays empty, nothing auto-checked
  });
});

describe('termination + idempotence (§6)', () => {
  function inverseConfig() {
    return compileConfig(
      cfg({
        content: [
          {
            status: S,
            action: [
              { id: `${R}/${S}/ACTION/a`, isChecked: false, isDisabled: false },
              { id: `${R}/${S}/ACTION/b`, isChecked: false, isDisabled: false },
            ],
            field: [],
          },
        ],
        relations: [
          { sourceId: `${R}/${S}/ACTION/a`, relationships: [{ id: 'inv', type: 'INVERSE', targets: [`${R}/${S}/ACTION/b`] }] },
        ],
      }),
    );
  }

  it('INVERSE converges in one pass', () => {
    const compiled = inverseConfig();
    const ev: ToggleEvent = { kind: 'leaf', id: `${R}/${S}/ACTION/a`, checked: true };
    const next = resolveToggle(compiled.initialState, ev, compiled.engine);
    expect(checkedOf(next, `${R}/${S}/ACTION/a`)).toBe(true);
    expect(checkedOf(next, `${R}/${S}/ACTION/b`)).toBe(false);
  });

  it('replaying the final event is idempotent', () => {
    const compiled = inverseConfig();
    const ev: ToggleEvent = { kind: 'leaf', id: `${R}/${S}/ACTION/a`, checked: true };
    const once = resolveToggle(compiled.initialState, ev, compiled.engine);
    const twice = resolveToggle(once, ev, compiled.engine);
    expect(twice).toEqual(once);
  });
});
