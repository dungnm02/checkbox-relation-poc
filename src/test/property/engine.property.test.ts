// §6 property test: for random configs and random click sequences, the engine terminates
// (never throws the iteration-cap EngineError) and is idempotent (replaying the last event
// changes nothing).

import { describe, it, expect } from 'vitest';
import { compileConfig } from '../../core/compileConfig';
import { resolveToggle } from '../../core/engine/resolveToggle';
import { leafToggleEvent } from '../../core/engine/derive';
import type { BackendConfig, LeafConfig, RelationRule, RelationType } from '../../core/types';

// Small deterministic PRNG (mulberry32) so failures are reproducible.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TYPES: RelationType[] = [
  'CASCADES_CHECK',
  'CASCADES_UNCHECK',
  'CASCADES_BOTH',
  'MUTUAL_EXCLUSIVE',
  'INVERSE',
  'BIDIRECTIONAL',
  'REQUIRES',
  'DISABLES_ON_CHECK',
  'DISABLES_ON_UNCHECK',
  'ENABLES_ON_CHECK',
];

function makeConfig(seed: number): BackendConfig {
  const r = rng(seed);
  const S = 'S';
  const n = 4 + Math.floor(r() * 5); // 4..8 leaves
  const ids = Array.from({ length: n }, (_, i) => `RES/${S}/ACTION/a${i}`);
  const action: LeafConfig[] = ids.map((id) => ({ id, isChecked: r() < 0.4, isDisabled: r() < 0.15 }));

  const relations: RelationRule[] = [];
  const relCount = Math.floor(r() * n);
  for (let i = 0; i < relCount; i++) {
    const srcIdx = Math.floor(r() * n);
    const source = ids[srcIdx];
    const targets = ids.filter((_, j) => j !== srcIdx && r() < 0.4);
    if (targets.length === 0) continue;
    const type = TYPES[Math.floor(r() * TYPES.length)];
    relations.push({
      id: `r${i}`,
      sourceId: source,
      relationships: [{ id: `r${i}`, type, targets, ...(type === 'REQUIRES' ? { restoreCheckedOnSatisfy: r() < 0.5 } : {}) }],
    });
  }

  return { resourceType: 'T', resourceName: 'RES', statuses: [S], content: [{ status: S, action, field: [] }], relations };
}

describe('engine property: termination + idempotence (§6)', () => {
  it('terminates and is idempotent across random configs and click sequences', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const backend = makeConfig(seed);
      const compiled = compileConfig(backend);
      const engine = compiled.engine;
      const ids = Object.keys(compiled.initialState);
      const r = rng(seed * 7 + 1);

      let state = compiled.initialState;
      let lastEvent = null as ReturnType<typeof leafToggleEvent>;
      const steps = 6 + Math.floor(r() * 10);
      for (let i = 0; i < steps; i++) {
        const target = ids[Math.floor(r() * ids.length)];
        const event = leafToggleEvent(state, target);
        if (!event) continue;
        // must not throw (termination backstop) — a throw fails the test
        state = resolveToggle(state, event, engine);
        lastEvent = event;
      }

      if (lastEvent) {
        const replay = resolveToggle(state, lastEvent, engine);
        expect(replay, `idempotence failed for seed ${seed}`).toEqual(state);
      }
    }
  });
});
