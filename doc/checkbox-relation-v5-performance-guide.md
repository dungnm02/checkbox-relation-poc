# Performance Guide — Checkbox Relation Engine (v5)

**Audience:** the coding agent on the work laptop, implementing or fixing the engine inside the
real project (Redux Toolkit + React).
**Status:** binding for Phase 3 of the work-agent plan. This doc constrains *where work is allowed
to happen*; `checkbox-relation-engine-design-v5.md` constrains *what the behavior is*. Neither
overrides the other — a fast engine with wrong semantics fails, and so does a correct engine that
recompiles per click.
**Standalone:** you do not have the reference implementation's source. Every rule here is stated
with pseudocode and a way to verify it in *this* project.

---

## 0. Why this doc exists (the measured incident)

The legacy implementation was measured at **~70ms of synchronous scripting per checkbox click at
~140 nodes**, with render fan-out already minimal. At that node count, the relation walk itself is
microseconds — so ~70ms means the click handler was doing **work proportional to the whole config**
(recompiling/re-validating/re-settling rules per toggle), not walking a graph. That is a
*phase error*: load-time work leaking into the click path.

### 0.1 The rejected redesign — do not reintroduce it

Three ideas were evaluated and **rejected**. If you find yourself implementing any of them, stop —
you are repeating an analyzed mistake:

1. **Strict two-way relations (`sourceRelation`/`targetRelation` semantics).** Edges are not the
   cost, and symmetric-by-default breaks directional invariants (EDIT⇒VIEW must allow VIEW-only /
   read-only). Keeping a *reverse index* for lookup is fine (§4 below); changing relation
   *semantics* to be symmetric is not.
2. **Rejecting "overlapping" relations at validation.** Multiple rules touching one node is the
   normal case (that is why `disabledBy` is a `string[]` with a conflict order, v5 §4.7/§4.9.4).
   Only *unsatisfiable* configs are rejected, at compile (v5 §5).
3. **A static precomputed `{checked, unchecked}` result map.** It can only represent the
   edge-triggered primitives; it cannot express locks-as-barriers, `condition`, or `REQUIRES`,
   whose outcomes depend on *runtime state*, not topology. The thing you precompute is the
   **graph** (adjacency), once, at load — the click stays an incremental walk against live state.

Note the one idea from that episode that *was* correct and is already in v5: the "reverse rule"
`uncheck VIEW ⇒ uncheck EDIT` is the **contrapositive** of `check EDIT ⇒ check VIEW` — the same
invariant enforced from the other end. It ships as two directional rules (`fe.edit-checks-view`,
`fe.view-unchecks-edit`, v5 §4.4a). Keep them as two directional rules.

## 1. The cost model: three phases, one ledger

Every piece of work belongs to exactly one phase. The entire performance design is refusing to let
work migrate rightward.

| Phase | When | Allowed complexity | Budget (140 nodes / ~280 leaves) |
|---|---|---|---|
| **LOAD** | once per config (page/resource/status-set load) | O(config): full scans fine | tens of ms — acceptable |
| **CLICK** | per user toggle | O(affected subgraph) only | **< 5ms** scripting |
| **RENDER** | per dispatch | O(cells whose value changed) + O(subscribers) cheap `===` checks | **< 8ms** commit |

**The phase ledger.** When you write or review any function, place it:

| Work | Phase | Never in |
|---|---|---|
| Payload validation, id parsing, wildcard/alias expansion (v5 §4.1–§4.3) | LOAD | CLICK |
| FE-default merge (v5 §4.4a) | LOAD | CLICK |
| Building the trigger/adjacency index (v5 §4.9.1) | LOAD | CLICK |
| `settleState` — whole-graph fixed point (v5 §4.8) | LOAD | CLICK ← *the classic leak* |
| Tree normalization, category→descendant-leaf index (v5 §4.5) | LOAD | CLICK |
| `resolveToggle` — BFS from the clicked node | CLICK | RENDER (never in a selector/effect) |
| Category tri-state aggregation | RENDER (memoized per category, per §6.2) | CLICK handler |
| Reason-label formatting, tooltips | RENDER (memoized) | CLICK |

**Litmus test:** if a function's runtime grows when you add *unrelated* rules or leaves to the
config, it is LOAD-phase work. If it appears in a click flame graph, you have found the bug.

## 2. Diagnose before you touch anything

Record **one click** in the browser Performance tab and one pass with the React Profiler
("Highlight updates" on). Then read this table top-down; fix only the row you actually hit.

| Symptom in the profile | Cause | Fix (section) |
|---|---|---|
| One long scripting frame; its stack contains validate/expand/build/settle-style names | Compile work in the click path | §3 |
| Scripting dominated by a loop visiting every node / every rule regardless of what was clicked | Whole-graph fixed point per click instead of seeded BFS | §5 |
| Many short scripting frames interleaved with renders, one per "hop" of the cascade | `useEffect` chain — each hop is a full render pass | §4 |
| Scripting small, but commit large; most/all checkbox cells highlight on one click | Broken reference stability or coarse subscriptions | §6.1 |
| Leaf cells precise, but every *category/tri-state* row highlights every click | Aggregates memoized on the whole slice | §6.2 |
| Multiple dispatches per click in Redux DevTools | Per-target/per-hop dispatching | §4 |

Do not "fix" rows you did not hit. Each fix below is independently verifiable.

## 3. Rule P1 — Compile exactly once per config

All LOAD-ledger work lives in one function (call it `compileConfig`) producing one immutable
object: `{ engine: { adjacency, visibility, rules }, initialState, categoryIndex, trees }`. The
click path receives this object and **never** calls anything that builds it.

```ts
// The ONLY place compile runs — keyed on config identity:
const compiled = useMemo(() => compileConfig(backendConfig), [backendConfig]);

useEffect(() => {                       // seed once per compile
  dispatch(initializeCheckboxes(compiled.initialState));
}, [compiled, dispatch]);
```

**RTK-specific traps that silently break "once":**

- **Unstable config identity.** If `backendConfig` comes from RTK Query or a selector that maps/
  filters/spreads, it may be a *new object every render*, making `useMemo` worthless — compile
  runs per render, which under a cascade of renders approximates per click. Key on the stable
  query result reference, or on `(resourceType, resourceName, updatedAt)`; never on a derived
  array/object built inline.
- **Compile inside a selector.** Never `createSelector(..., () => compileConfig(...))` over
  anything that changes per dispatch. Compiled config is not store-derived state; it is a
  load-time artifact. Keep it in the hook/memo (or a module-level cache keyed by resource), not
  recomputed from the slice.
- **Settle hiding in an effect.** A `useEffect` that "fixes up" locks/visibility after each state
  change *is* a per-click settle plus an extra render. The fixed point runs inside
  `compileConfig` (producing `initialState`) and nowhere else. First paint is already correct
  (v5 §4.8); nothing needs fixing after clicks because `resolveToggle` returns the complete next
  state.

**Verify:** a dev-mode counter in `compileConfig`. Load the page, click 20 times: the counter must
read the number of config loads (usually 1), **not** 20+. Leave the counter in behind
`import.meta.env.DEV` — this regresses easily.

**Where compile and seeding actually belong: §9.** The most robust way to satisfy this rule is to
compile in the data-fetch layer and seed from the fetch's fulfilled action, so neither compile nor
seeding lives in a component effect at all. Read §9 before wiring the config in.

## 4. Rule P2 — The click path is: one read → one pure call → one dispatch

```ts
function onToggleLeaf(id: LeafId) {
  const state = store.getState().checkboxes;          // 1 read
  const event = leafToggleEvent(state, id);           // null if disabled/unknown → no-op
  if (!event) return;
  dispatch(setAllCheckboxes(
    resolveToggle(state, event, compiled.engine),     // pure; complete next state
  ));                                                 // 1 write
}
```

- `resolveToggle` is **pure**: `(state, event, compiledEngine) → nextState`. No store access, no
  dispatch inside, no reading refs. Everything the click causes — every cascade hop, lock,
  release, visibility change — is inside the returned state. **Exactly one dispatch per
  interaction**, therefore one render pass.
- **No `useEffect` relay chains.** The legacy pattern — toggle A, an effect notices and toggles B,
  another effect notices B… — costs a *full React render pass per hop* and is why the old
  hardcoded version already cost 40ms. Cascade hops are loop iterations inside `resolveToggle`,
  not React lifecycles. If any `useEffect` in the checkbox feature dispatches to the checkbox
  slice, that is a defect (single-writer rule, v5 §2).
- **No per-target dispatches.** Dispatching once per affected node re-renders subscribers once per
  node. One `setAllCheckboxes(nextState)` replacing the slice is the contract.
- The reducer does no logic: `setAllCheckboxes: (_s, a) => a.payload`. Do not recompute or
  "sanity-fix" anything in the reducer — that reintroduces hidden per-click work and a second
  writer.

**Verify:** Redux DevTools — one click = one action. A Class-B-style test asserts exactly one
dispatch per interaction (see the traveling `useRelationEngine.test.tsx` intent).

## 5. Rule P3 — Propagation is seeded and change-detected; the fixed point is load-only

The same core loop serves both phases, distinguished *only* by its seeds:

```
propagate(state, engine, seeds, primeQueue):
  draft = { ...state }              # ONE shallow copy — see §6.1 for why this exact shape matters
  queue = seeds ++ primeQueue
  while queue not empty:
    node = dequeue()
    for entry in engine.adjacency.byTrigger.get(node) ?? []:   # precomputed at LOAD
      apply entry's effects onto draft, where every write:
        - reason-writes before checked-writes (v5 §4.9.3)
        - if the value did NOT actually change → return WITHOUT enqueueing   # termination + bound
        - if it changed → reassign draft[target] to a NEW object, enqueue target
  reconcile visibility once, after the fixed point (v5 §4.6)
  return draft

resolveToggle(state, event, engine) = propagate(state, engine, seedsOf(event), [])   # CLICK
settleState(state, engine)          = propagate(state, engine, [], allNodeIds)       # LOAD only
```

Three properties, all load-bearing:

1. **Seeded start.** A click enqueues only the clicked leaf (or the category's writable leaves).
   Work is bounded by the affected subgraph — clicking an isolated checkbox costs O(1) regardless
   of config size.
2. **Enqueue only on real change.** This is simultaneously the termination proof (v5 §4.9.2) and
   the performance bound. Any "always enqueue targets" shortcut turns cycles into hangs and quiet
   configs into full-graph walks.
3. **Whole-graph priming exists in exactly one call site: `settleState`, called from
   `compileConfig`.** Grep for it: if the prime-everything form is reachable from any click
   handler, effect, or selector, that is the 70ms bug.

**Verify:** the traveling property test (termination + idempotence) plus a dev counter of nodes
dequeued per click — for a leaf with no relations it must be 1.

## 6. Rule P4 — Render discipline

This section assumes a **selector-based store** (the reference uses react-redux). The property it
protects — one toggle wakes only the changed cells — is a *requirement*, not a Redux feature; §10
covers how it holds under other state containers (`useReducer`, Zustand, Jotai) and which ones fail it.

### 6.1 Reference stability is a *contract between the engine and the UI*

The engine's `{ ...state }` copy reassigns **only the nodes whose value changed**; every unchanged
leaf keeps its exact `CheckboxValue` object identity across the dispatch. That identity is what
lets react-redux's default `===` equality bail out every untouched cell. Treat it as an invariant:

- In the engine: never `map`/rebuild all values, never `JSON.parse(JSON.stringify(...))`, never
  produce a fresh object for an unchanged node (e.g. do **not** write `draft[n] = { ...cur }`
  before checking whether anything changes).
- In the UI: **one subscription per cell**, selecting only that cell's value object:

```ts
const selectCheckboxById = (id) => (s) => s.checkboxes[id];       // per-cell
function LeafCell({ id }) { const value = useAppSelector(selectCheckboxById(id)); ... }
```

- Never subscribe a row/table component to the whole slice and pass values down — one click then
  re-renders the world regardless of engine precision.
- Derived props built in render (`disabledBy.map(label)`, inline `onToggle={() => ...}`) are fine
  *inside* the cell that re-renders anyway; they are memo-busters only if passed into memoized
  children. If rows are `React.memo`'d, callbacks passed to them must be stable
  (`useCallback`/stable handler object).

**Verify (this test travels — implement it):** dispatch a state where the slice object is
replaced but a given leaf's value object is reference-identical → that leaf's selector output is
`===`-stable and the cell does not re-render.

### 6.2 Category / tri-state aggregates: memoize on *their own leaves*, not the slice

The subtle second cost. Since every dispatch replaces the slice object, any
`createSelector([selectWholeSlice], ...)` has its input change *every click* — so **every**
category row recomputes and re-renders on every toggle, even when none of its descendants moved.
On a deep tree this rivals the handler cost.

Correct shape — one input selector **per descendant leaf**, so the memo key is the tuple of that
category's own leaf-value references:

```ts
const selectCategoryState = (descendants: CategoryDescendants) => {
  const viewCount = descendants.viewLeafIds.length;
  const leafSelectors = [...descendants.viewLeafIds, ...descendants.editLeafIds]
    .map((id) => (s: RootState) => s.checkboxes[id]);
  return createSelector(leafSelectors, (...vals) => ({
    view: aggregateValues(vals.slice(0, viewCount)),
    edit: aggregateValues(vals.slice(viewCount)),
  }));
};
```

This works *because of* §6.1: unchanged leaves keep identity, so the input tuple is `===`-stable
unless one of **this** category's leaves changed.

- **Reselect v5 note (RTK ≥ 2.0):** the default memoizer is `weakMapMemoize`; the old
  `equalityCheck` option of v4 is ignored. Per-leaf input selectors (pure reference identity) work
  under both — prefer them over custom equality.
- **Selector instances must be stable per category.** A factory selector recreated on every render
  has empty memo state each time. Create it in `useMemo(() => selectCategoryState(desc), [desc])`
  with `desc` itself stable (from the compiled config's category index — a LOAD artifact — not an
  inline object literal).
- The descendant-leaf lists come from the **precomputed category index** (LOAD phase). Never walk
  the tree inside a selector or render to collect leaf ids.

**Verify (travels):** (a) slice replaced + unrelated leaf added + own leaves untouched → aggregate
result is reference-identical (`toBe`); (b) one own leaf toggled → recomputes. Plus React Profiler:
clicking a leaf under category X highlights X's ancestors only, not sibling categories.

## 7. Anti-pattern table (grep-able review checklist)

| # | Anti-pattern | Why it is the bug | Replace with |
|---|---|---|---|
| A1 | `compileConfig`/expand/validate/settle reachable from a click handler or effect | The measured 70ms | §3 memoized compile |
| A2 | `useEffect` that dispatches to the checkbox slice | Render-pass-per-hop cascades; second writer | §4 single hook |
| A3 | More than one dispatch per interaction | O(targets) render passes | one `setAllCheckboxes` |
| A4 | Propagation loop primed with all nodes on click | Full fixed point per click | §5 seeded BFS |
| A5 | Enqueue without a did-it-change check | Hangs on cycles; unbounded work | §5 change detection |
| A6 | Rebuilding all value objects (`map`, deep clone, stringify-compare) | Destroys reference stability → whole-table re-render | §6.1 single shallow copy, reassign changed only |
| A7 | Component subscribed to the whole slice | O(N) re-render per click | §6.1 per-cell selectors |
| A8 | `createSelector([wholeSlice], ...)` for aggregates | Every category recomputes every click | §6.2 per-leaf inputs |
| A9 | Selector factory called in render without `useMemo` | Memo never hits | §6.2 stable instance |
| A10 | Deriving leaf lists / walking the tree inside selectors or render | LOAD work at RENDER | precomputed category index |
| A11 | Storing derived state (aggregates, visibility booleans) in the slice | Second writer + sync bugs + extra dispatches | derive via memoized selectors |
| A12 | Logic in the reducer beyond `payload` replacement | Hidden per-click work; splits the single write path | pure `resolveToggle` before dispatch |
| A13 | `useEffect` copying the fetch cache into the working slice (seed-on-`data`) | Empty-state frame + StrictMode double-fire + re-seeds on any refetch → the `initialRender`/`hasSeeded` ref pile | §9 seed from the fulfilled action |
| A14 | Compile in a component/hook keyed on the raw fetched `data` reference | Any refetch (focus/reconnect/invalidate) hands a new reference → recompile | §9 compile in `transformResponse`; cache owns the memo |
| A15 | Cells read checkbox state through **Context** (`useContext`) | Context has no selector bailout → every cell re-renders every toggle (the §6 storm) | §10 selector store or props+`memo` |
| A16 | Keeping a Redux-based fetch store (RTK Query) but moving client state to a separate `useReducer` | Two stores that can't talk → config→state seed regresses to a component effect (A13) | §10 one store when a fetch store already exists |

## 8. Acceptance gates (all must pass before Phase-3 sign-off)

1. **Compile counter:** page load + 20 clicks ⇒ compile count = config loads, not clicks.
2. **Dispatch count:** 1 per interaction (Redux DevTools / traveling hook-test intent).
3. **Dequeue counter:** isolated leaf click ⇒ 1 node dequeued; cascade click ⇒ nodes dequeued ≈
   affected subgraph, never ≈ total node count.
4. **Reference stability tests** (§6.1, §6.2) green.
5. **Profiler:** one click at the real ~140-node config ⇒ scripting **< 5ms**, commit **< 8ms**;
   only changed cells + their ancestor category rows highlight.
6. **Semantics unchanged:** full traveling suite green (order per the test-case spec: L → N → D →
   C → VIS → H → E) — a perf fix that flips any behavior test is rejected.
7. **No sync effects:** grep the checkbox feature — no `useEffect` dispatches to the checkbox
   slice, and no `hasSeeded`/`initialRender`-style refs exist (§9). First paint already shows
   seeded, settled state (no empty→populated flash on a throttled network).
8. **Container discipline:** whatever state container is chosen (§10), one toggle wakes only the
   changed cells (gate 5), there is exactly one write path (§4), and no cell reads the whole
   checkbox state through Context.

If gate 5 fails *after* gates 1–4 pass, profile again and return to the §2 table — do not start
"optimizing" speculatively.

---

## 9. BE ↔ Engine sync: don't mirror the fetch cache with effects

The engine consumes a config from an external system (the backend). The tempting shape — fetch the
config, then `useEffect` it into the working state — is the single most common source of the
"weird effects + `initialRender` refs" tangle, and it quietly feeds the compile/render costs above.
This section is the prescribed way to get server config **into** the engine.

### 9.1 The downfall (what to stop doing)

```ts
const { data } = useGetConfigQuery(resource);
useEffect(() => { if (data) dispatch(seed(compileConfig(data))); }, [data]); // ← the trap
// …plus a hasSeeded/isFirstRender ref to stop it re-running
```

Why it hurts — note the order of severity: the extra render itself is cheap; the real damage is the
first two rows, which reach back into §3–§6.

- **It can re-trigger compile (§3, A14).** Keying compile on the raw `data` reference means *any*
  refetch — focus, reconnect, cache invalidation — hands you a new reference and recompiles the
  whole config. This is the load-work-in-the-hot-path leak wearing a different hat.
- **Empty-state frame.** Effects run *after* render, so there is a frame where `data` exists but the
  working state is still empty → a flash, and often a guard bolted on to hide it.
- **StrictMode double-invoke** (dev) re-runs the effect → a ref gets added to dedupe.
- **`initialRender`/`hasSeeded` refs are the smell.** They mean you are re-seeding when you should
  not, and fighting the effect lifecycle around what is really a **single idempotent operation**.
- **Effect chains.** One effect seeds, another watches the seeded state and derives, a third guards
  the initial value — each is a full render pass, each with its own ref.

### 9.2 The principle

> An effect is for continuously synchronizing with a system **outside** React. Your data-fetching
> layer is already that boundary. Copying its cache into your own slice with an effect is syncing on
> top of syncing.

There are only two legitimate shapes, and neither is an effect:

- **Config *arrives* → seed.** That is a *reaction to an action* → handle it in the store
  (reducer matcher / listener middleware), where it runs synchronously with the data landing.
- **User *does something* (reset-to-defaults, save-then-reload-as-baseline) → re-seed.** That is an
  *event* → dispatch from the handler.

Seeding the initial **settled** state (§4.8) is **idempotent** — same payload in, same state out,
and it happens before the user has touched anything — so it needs **no guard at all**.

### 9.3 Proposed design (host-agnostic, then the RTK realization)

Three moves, no component effect, no ref:

1. **Compile in the fetch layer**, so the cache stores the *compiled* config (engine + settled
   `initialState`), not the raw payload. You get compile-once and a stable reference for free
   (satisfies §3), and an invalid payload becomes a clean *error state* instead of a render crash.
2. **Seed the working slice from the "fetch fulfilled" action**, in the store — synchronous with
   data arrival, so no empty-state frame, no effect, no ref.
3. **The hook only reads**: the compiled config for the click-time engine, the slice for current
   values.

Host-agnostic shape:

```
fetchLayer.getConfig(resource):
   raw = GET /config/:resource
   return compileConfig(raw)          # cache stores the compiled result → stable ref, compiled once

store, on "getConfig fulfilled" action:
   checkboxSlice = payload.initialState    # seed synchronously; idempotent, no guard

hook:
   compiled = useConfig(resource)     # from cache; stable
   click:  next = resolveToggle(getState().checkboxes, event, compiled.engine); dispatch(next)
```

RTK / RTK Query realization:

```ts
// endpoint — compile (and the payload adapter) live in transformResponse:
getConfig: builder.query<CompiledConfig, string>({
  query: (resource) => `/config/${resource}`,
  transformResponse: (raw: BackendConfig) => compileConfig(toEngineConfig(raw)),
}),

// checkbox slice — seeds itself from the fulfilled action; no component ever seeds it:
extraReducers: (builder) => {
  builder.addMatcher(
    api.endpoints.getConfig.matchFulfilled,
    (_state, { payload }) => payload.initialState, // already settled
  );
},

// hook — read only:
const { data: compiled, isLoading, isError } = useGetConfigQuery(resource);
```

(If you cannot compile in the fetch layer, the fallback is **one** idempotent seed effect keyed on
the memoized compiled config, with the ref deleted:
`useEffect(() => { if (compiled) dispatch(seed(compiled.initialState)); }, [compiled, dispatch])`.
Prefer the fetch-layer version — it is the one that also hands §3 its stable, compiled-once
reference.)

### 9.4 The re-seed escape hatch

Genuine re-initialization — a "reset to defaults" button, or reloading the server's copy as a new
baseline after save — is an **event**, so dispatch the seed straight from the handler
(`dispatch(seed(compiled.initialState))`). Still no effect.

### 9.5 The one case this does NOT cover — flag it, do not guess

Everything above assumes the config is effectively **static for the duration of an edit session**
(fetched, then the user edits, then saves). If instead the backend config can **change under the
user mid-edit** — polling, refetch-on-focus, or collaborative editing — and you must fold those
server changes into in-progress edits, that is a **different problem** (last-write-wins vs.
merge/reconciliation), and **blindly re-seeding would destroy the user's edits**. Do not solve it
with a seed effect. Raise it with the operator as its own design task; the idempotent-seed
assumption is void. For a create/edit page the correct default is to **fetch once and disable
refetch-on-focus/reconnect for this endpoint**, so the case never arises.

### 9.6 Verify

- Grep: no `useEffect` in the checkbox feature dispatches to the checkbox slice; no
  `hasSeeded`/`initialRender` refs exist.
- Seeding happens in a reducer matcher / listener / event handler — never a component effect.
- On a throttled network, first paint already shows seeded, settled state (no empty→populated flash).
- The §3 compile counter still reads "once per distinct config fetched," unaffected by re-renders or
  (if refetch is enabled at all) by refetches of the same config.

---

## 10. Choosing the state container (Redux / `useReducer` / other)

Expect this to come up as "the store is unnecessary — this state isn't used anywhere else, use a
plain `useReducer`." That reasoning is half-right and half-dangerous. This section is the analysis
to run and the rule to apply.

### 10.1 First: the engine does not care

`resolveToggle`, `compileConfig`, the whole pure core is **store-agnostic** — `(state, event,
config) → nextState` over plain objects. Swapping Redux for `useReducer`, Zustand, Jotai, or a
hand-rolled store touches **zero** engine code and breaks **zero** Class-A tests. The container is a
*shell* decision. So nothing here is sacred — but the choice is constrained by two hard
requirements that come straight from §6 and §9.

### 10.2 The two requirements any container MUST meet

- **R1 — fine-grained subscription (§6).** One toggle re-renders only the cells whose value
  actually changed (a handful), never all ~N. This is the entire performance thesis of this guide.
- **R2 — effect-free seeding (§9).** The container can be seeded from the *config-arrived event*
  without a component `useEffect` — otherwise you reintroduce the §9 sync tangle.

The question is **not** "global vs. local." It is: *does the container meet R1 and R2, and does the
choice avoid running two state systems that can't talk to each other?*

### 10.3 What actually decides R1: the read path

R1 is determined by **how a cell reads its value**, not by which reducer produces it:

| Read path | R1? | Cost profile |
|---|---|---|
| Selector store — Redux `useSelector` / Zustand selector / **Jotai atom-per-leaf** | ✅ | Container does **not** re-render; only changed cells wake. Best. |
| `useReducer`/`useState` + **props + `React.memo`** + identity-preserving reducer | ✅ (with care) | Container re-renders and re-creates ~N elements each click (memo'd children bail); needs **stable callback props** (`useCallback`) or `memo` silently breaks. Fine at this scale. |
| Any state read through **Context** (`useContext` in the cell) | ❌ | Context has no selector bailout → **every** consumer re-renders every toggle. The §6 storm. Reject at these cell counts. |

The engine already preserves the identity of unchanged value objects (§6.1), which is what makes
both ✅ rows work. Plain `useReducer` is **not** the problem — *Context as the read path* is.

### 10.4 The "state is local" principle, correctly applied

The principle is legitimate, but it is about **colocation and lifetime**, not about which container
holds the state. Honor it *inside whatever store you use*: keep the slice in the feature folder,
scope it to the feature, tear it down on unmount. Locality is a code-organization property.

Note the consistency check: if you fetch config with a store-based data layer (e.g. RTK Query), the
**server config is already feature-local state living in a store**. Splitting only the *client* half
of the same feature out into a different system is the *less* consistent choice, not the cleaner one.

### 10.5 The trap: two stores that can't talk (R2 regression)

This is the failure mode to catch. If a store is **already mounted for data fetching** (RTK Query is
a Redux store) and you move the client checkbox state to a separate `useReducer`, the two systems
cannot communicate in-store. So the §9 seed — normally a synchronous `matchFulfilled` reducer —
has nowhere to live and falls back to a **component bridge**: either the `useEffect(seed, [data])`
from §9.1 (A13), or a gate-and-key remount (workable but more moving parts). You pay §9's problem
back to remove a store you are keeping anyway. Keeping the fetch store and splitting the client
state is the one combination worse than either pure option.

### 10.6 Decision procedure

1. **Is a store already mounted for data fetching** (RTK Query, or any Redux-based layer)?
   - **Yes → put the checkbox state in that store, as one feature-scoped slice.** It satisfies R1
     (selectors) and R2 (`matchFulfilled` seed, §9) at ~zero marginal cost, and keeps all of a
     *permissions* feature's state in one inspectable place. **Stop here — this is the default.**
   - No → step 2.
2. **Are you removing the fetch store too** (a fully local stack, e.g. TanStack Query / manual
   fetch + local state)? Then `useReducer` (or a small selector store) is coherent, provided:
   - the **read path is a selector store or props+`memo`, never Context** (R1); and
   - §9 seeding is **re-homed onto the fetch layer's success path**, kept effect-free — a
     gate-and-key initializer (`<Editor key={configId} initialState={compiled.initialState}>` with
     `useReducer(r, initialState)`), or the query lib's `select`/`onSuccess`, not a `useEffect`.
3. **Never** keep a fetch store and split the client state into a Context-read `useReducer` (§10.5:
   fails both R1 and R2).

### 10.7 Summary table

| Container | R1 (fine-grained) | R2 with an existing fetch store | Verdict |
|---|---|---|---|
| Redux slice (alongside RTK Query) | ✅ selectors | ✅ `matchFulfilled` | **Default when a fetch store exists** |
| Zustand / Jotai (atom-per-leaf) | ✅ | seed from query success, effect-free | Fine — lighter selector store if Redux ceremony is the real objection |
| `useReducer` + props + `memo` (no fetch store) | ✅ with care | gate+key / `select` seed | Fine for a fully-local stack |
| `useReducer` + Context read | ❌ | — | **Rejected** — render storm |
| `useReducer` while keeping RTK Query | (depends on read path) | ❌ regresses to a seed effect | **Rejected** — the §10.5 split trap |

### 10.8 Store-agnostic invariants (hold whatever you pick)

- **One write path (§4):** exactly one reducer action / dispatch per interaction, carrying the full
  `resolveToggle` result. No second writer, no per-target writes.
- **Identity-preserving updates (§6.1):** reassign only changed entries; unchanged values keep their
  reference. This is what every ✅ read path depends on.
- **Seed from an event, never an effect (§9).**
- **Category aggregates memoized on their own leaves (§6.2).**
- **The pure core is untouched** — only the ~1 file that wires state to React changes.

### 10.9 Verify

- Profiler: one toggle wakes only the changed cells regardless of container (this is gate 5, §8).
- Grep: no `useContext` returns raw checkbox state to a cell; no `useEffect` seeds the state
  (unless you are on the fully-local stack and using the documented gate+key/`select` seed).
- Exactly one state system bridges config→state, unless the split was a deliberate, recorded choice.
- If using props+`memo`: cell callback props are `useCallback`-stable (else the memo is a no-op).

---

*Companion docs: `checkbox-relation-engine-design-v5.md` (behavior, normative) ·
`checkbox-relation-v5-work-agent-plan.md` (process) · `checkbox-relation-v5-test-cases.md`
(executable spec). This guide adds the performance constraints those assume.*
