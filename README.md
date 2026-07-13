# Checkbox Relation Engine

The interactive core of the **rule-set** module's *create* page. Two backend-driven tables —
a flat **ACTION** table and a hierarchical **FIELD** tree (VIEW/EDIT columns) — whose checkboxes
drive each other through a declarative relation config. Implements
[design v4](./checkbox-relation-engine-design-v4.md).

Stack: Vite · React 18 · TypeScript · Redux Toolkit · Vitest.

## Quick start

```bash
npm install
npm run dev        # runnable demo (three mock resources) at http://localhost:5173
npm test           # 82 unit/integration/property tests
npm run typecheck  # tsc --noEmit
npm run build      # production build
```

## Architecture

A strict **pure-core / React-shell** split. Everything in `src/core/**` is framework-free and
unit-tested over plain objects; React and Redux only wrap it.

```
Backend config ─▶ useCheckboxConfig ─▶ compileConfig ──▶ CompiledConfig
   (per page)      (compile once)        (throws on            │
                                          invalid config)      ▼
User click ─▶ useRelationEngine ─▶ resolveToggle(state,event,config) ─▶ single dispatch
             (sole store writer)     (pure BFS + visibility pass)        (one commit / click)
```

- **`resolveToggle` is pure** — `(state, event, config) → nextState`, no store access, no side
  effects. This is what makes the engine testable and guarantees exactly one React render per click.
- **`useRelationEngine` is the only writer** to the checkbox slice (one read, one dispatch per
  interaction). Invariant relations only hold because every mutation flows through it.
- **State is keyed by the full id** `RESOURCE/STATUS/TYPE/PATH`, so STATUS namespaces itself and
  every status's state coexists in one slice (the whole rule set saves together).

## Project structure

```
src/core/
  grammar/parseId.ts        §4.1 positional id parser (opaque PATH)
  config/                   §4.2 seeding · §4.5 tree normalization · §4.4a FE defaults + merge
  expressions/              §4.3 wildcard patterns + relative binding + validation
  engine/                   §4.4/4.6/4.9/6 effects · adjacency · resolveToggle · visibility · derive
  compileConfig.ts          orchestrator: BackendConfig → CompiledConfig
src/store/                  slice (single write path) · typed hooks · memoized selectors
src/hooks/                  useCheckboxConfig · useRelationEngine
src/components/             CheckboxPageContainer · StatusSelector · ActionTable · FieldTreeTable · CheckboxCell
src/demo/                   mock backend payloads for the runnable demo
```

## The backend config

One payload per Resource Type + Name, carrying every status's content:

```ts
interface BackendConfig {
  resourceType: string;
  resourceName: string;
  statuses: string[];                 // [] or length 1 ⇒ no status selector
  content: StatusContent[];           // one per status: { status, action[], field-tree }
  relations?: RelationRule[];         // authored with wildcards; expanded per status at load
  visibility?: VisibilityBinding[];   // ACTION checkboxes that show/hide the FIELD table
  selectors?: NamedSelector[];
}
```

Each checkbox is `{ id, isChecked, isDisabled }`. `isDisabled: true` seeds an irremovable
`"@initial"` lock. Field leaves carry both a `view` and an `edit` checkbox sharing everything but
the TYPE segment.

## Relation examples (one per primitive)

`src/demo/mockBackend.ts` exports **`relationTypesBackend`** (`DEMO · RELATION_TYPES` in the
resource dropdown) — one STATUS tab per primitive, each an isolated, self-contained scenario built
from ACTION checkboxes only:

| Status tab | Primitive | Try it |
|---|---|---|
| `CASCADES_CHECK` | `CASCADES_CHECK` | check "Select All" → both items check; uncheck it → they stay |
| `CASCADES_UNCHECK` | `CASCADES_UNCHECK` | uncheck "Clear All" → both items uncheck; check it → they stay |
| `CASCADES_BOTH` | `CASCADES_BOTH` | toggle "Group All" either way → both members follow |
| `GROUP_ALL` | `GROUP_ALL` (alias) | identical to `CASCADES_BOTH`, framed as a select-all header |
| `MUTUAL_EXCLUSIVE` | `MUTUAL_EXCLUSIVE` | check "Option A" → B and C uncheck (at-most-one) |
| `INVERSE` | `INVERSE` | "Light Mode Active" always holds the opposite of "Dark Mode" |
| `BIDIRECTIONAL` | `BIDIRECTIONAL` | toggling either switch flips both |
| `REQUIRES` | `REQUIRES` | "Publish" starts locked+unchecked; check "Reviewed" to release + restore it |
| `DISABLES_ON_CHECK` | `DISABLES_ON_CHECK` | check "Read-Only Mode" → "Edit Content" locks + force-unchecks |
| `DISABLES_ON_UNCHECK` | `DISABLES_ON_UNCHECK` | uncheck "Account Active" → "Send Notifications" locks |
| `ENABLES_ON_CHECK` | `ENABLES_ON_CHECK` | "Restricted Area" starts locked; check "Unlock Access" to release |
| `ENABLES_ON_UNCHECK` | `ENABLES_ON_UNCHECK` | "User Actions" starts locked; uncheck "Maintenance Mode" to release |
| `CONDITION` | universal `condition` field | "Send Report" only cascades to "Include Charts" while "Reports Enabled" is checked |

Each example is also asserted in `src/demo/mockBackend.test.ts`, so it doubles as a
regression-checked reference rather than a demo that can silently drift from the engine's actual
behavior. The FIELD-tree-based `EDIT ⇒ VIEW` invariant (§4.4a) is demoed separately, live, in the
`AI_FEATURE` resource.

## Relations at a glance

Rules target checkboxes by **concrete id**, **positional wildcard** (`AI_FEATURE/*/EDIT/*` — any
segment `*`, PATH matched whole), or **column alias** (`$ACTION` / `$VIEW` / `$EDIT`). Relative
binding pairs a wildcard source with same-position targets: `$EDIT → $VIEW` wires each EDIT to the
VIEW at the identical status + path. **Relations never cross statuses.**

The 12 primitives (§4.4): `CASCADES_CHECK/UNCHECK/BOTH`, `GROUP_ALL`, `MUTUAL_EXCLUSIVE`,
`INVERSE`, `BIDIRECTIONAL`, `REQUIRES`, `DISABLES_ON_CHECK/UNCHECK`, `ENABLES_ON_CHECK/UNCHECK`,
plus a universal `condition` field.

**EDIT ⇒ VIEW** ships as declarative FE default config (`src/core/config/defaults.ts`), merged at
load so it costs zero backend payload and stays overridable per resource by reusing its rule id.

**Region visibility** (§4.6): several ACTION checkboxes jointly control the FIELD table — visible
iff *any* is checked; hiding force-unchecks and locks (`"@hidden"`) every field leaf.

## Status of the two verification gates

Two design assumptions could not be validated against a live backend and are marked
`TODO(verify)` in code:

1. **ID grammar** (§4.1) — that `type` is exactly `ACTION|VIEW|EDIT`, `path` is opaque, and
   VIEW/EDIT siblings share a path. See `src/core/grammar/parseId.ts`.
2. **Payload shape** (§4.2) — the keyed-by-status structure. If the BE sends one flat structure
   with STATUS baked into each id, only the loader changes; the engine is identical.

Confirm both against a real payload before production hardening.
