import { describe, it, expect } from 'vitest';
import { collectLeaves, seedInitialState } from './seed';
import { ConfigError } from '../errors';
import { INITIAL_REASON, type StatusContent } from '../types';
import { aiFeatureConfig } from '../../test/fixtures/aiFeature';

describe('collectLeaves / seedInitialState (§4.2)', () => {
  it('collects every checkbox across all statuses', () => {
    const leaves = collectLeaves(aiFeatureConfig.content);
    // per status: 2 ACTION + 3 fields × (VIEW+EDIT) = 2 + 6 = 8; × 2 statuses = 16
    expect(leaves).toHaveLength(16);
  });

  it('seeds checked + @initial lock from defaults', () => {
    const state = seedInitialState(aiFeatureConfig.content);
    expect(state['AI_FEATURE/IN_PROGRESS/ACTION/enable_fields']).toEqual({
      checked: true,
      disabledBy: [],
    });
    expect(state['AI_FEATURE/IN_PROGRESS/VIEW/properties.owner']).toEqual({
      checked: true,
      disabledBy: [],
    });
    // owner EDIT is isDisabled: true → @initial lock
    expect(state['AI_FEATURE/IN_PROGRESS/EDIT/properties.owner']).toEqual({
      checked: false,
      disabledBy: [INITIAL_REASON],
    });
  });

  it('keeps statuses namespaced by full id', () => {
    const state = seedInitialState(aiFeatureConfig.content);
    expect(state['AI_FEATURE/IN_PROGRESS/VIEW/description']).toBeDefined();
    expect(state['AI_FEATURE/IN_REVIEW/VIEW/description']).toBeDefined();
  });

  it('rejects a leaf whose type segment contradicts its slot', () => {
    const bad: StatusContent[] = [
      {
        status: 'S',
        action: [],
        field: [
          {
            isCategory: false,
            name: 'X',
            // VIEW slot holds an EDIT id
            view: { id: 'R/S/EDIT/x', isChecked: false, isDisabled: false },
            edit: { id: 'R/S/EDIT/x2', isChecked: false, isDisabled: false },
          },
        ],
      },
    ];
    expect(() => collectLeaves(bad)).toThrow(ConfigError);
    expect(() => collectLeaves(bad)).toThrow(/VIEW slot/);
  });

  it('rejects a status mismatch between id and content', () => {
    const bad: StatusContent[] = [
      { status: 'S', action: [{ id: 'R/OTHER/ACTION/x', isChecked: false, isDisabled: false }], field: [] },
    ];
    expect(() => collectLeaves(bad)).toThrow(/appears under status "S"/);
  });

  it('rejects duplicate ids', () => {
    const bad: StatusContent[] = [
      {
        status: 'S',
        action: [
          { id: 'R/S/ACTION/x', isChecked: false, isDisabled: false },
          { id: 'R/S/ACTION/x', isChecked: false, isDisabled: false },
        ],
        field: [],
      },
    ];
    expect(() => collectLeaves(bad)).toThrow(/duplicate/);
  });
});
