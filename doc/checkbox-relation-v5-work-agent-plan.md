# Work-Agent Plan — Gap Analysis & Implementation of the Checkbox Relation Engine (v5)

**Audience:** the coding agent on the work laptop, operating inside the real project.
**Inputs you have:** (1) this plan, (2) `checkbox-relation-engine-design-v5.md` (the target design — normative), (3) a set of test files (the executable specification — listed in §0.2), (4) `checkbox-relation-v5-test-cases.md` (the readable test-case specification: every case has an ID, fixture, steps, and expected result — implement it per its own checklist, mapping case IDs to the traveling test files before writing new ones), (5) `checkbox-relation-v5-performance-guide.md` (**binding for Phase 3** — constrains where work may happen: compile-once, seeded propagation, render discipline; its §8 acceptance gates are part of Gate 3), (6) real backend payloads / API access, which the operator will provide.
**Inputs you do NOT have:** the reference implementation's source code. Do not ask for it, do not try to reconstruct file-by-file — you are reimplementing from the design + tests, in this project's own idioms.

Work the phases **in order**. Each phase ends with a **gate** — concrete evidence you must produce before moving on. If a gate fails, stop and report; do not improvise around it.

---

## 0. Ground rules

### 0.1 Precedence when sources disagree

1. **Real backend payloads** (observed data beats every document).
2. **v5 design, normative sections** — §4.1–§4.11 define exact behavior; §4.11 (special cases) and §4.9.3 (write ordering) are non-negotiable.
3. **The test files** — they encode v5; if a test and the v5 text seem to disagree, flag it in your report rather than "fixing" either.
4. **The legacy implementation** — it is the thing being replaced. Where legacy behavior differs from v5, that is a *finding to report*, not something to silently preserve — EXCEPT during the parity audit (§2.3), where legacy behavior defines the acceptance list.

### 0.2 The test files and how to use them

Two classes — treat them differently:

**Class A — binding executable spec (pure core).** These test framework-free functions over plain objects. Your reimplementation must make every one of them pass, changing **only import paths** (and, if this project's naming conventions demand it, identifier names — never assertions, never expected values):

```
src/core/grammar/parseId.test.ts        → ID grammar (§4.1)
src/core/config/seed.test.ts            → state seeding + payload validation (§4.2)
src/core/config/tree.test.ts            → FIELD tree normalization (§4.5)
src/core/config/merge.test.ts           → FE-default merge + override + fe.* warning (§4.4a)
src/core/expressions/expand.test.ts     → wildcard binding, aliases, per-status expansion, all load errors (§4.3)
src/core/engine/engine.test.ts          → primitives, chaining, priority, settle (§4.4, §4.8, §4.9)
src/core/engine/disabled.test.ts        → reasons, barriers, owner-bypass, reserved reasons (§4.7)
src/core/engine/derive.test.ts          → category aggregation + event normalization (§4.5)
src/demo/mockBackend.test.ts            → one behavior test per primitive, end to end (§4.4)
src/test/property/engine.property.test.ts → termination + idempotence under random configs (§4.9.2)
```

**Class B — reference spec (React shell).** These assume the reference app's component structure and will not run as-is against your components. Read them, extract every *assertion's intent*, and rewrite equivalent tests against this project's components:

```
src/hooks/useRelationEngine.test.tsx     → single read + single dispatch per interaction
src/components/CheckboxPageContainer.test.tsx → status switching, visibility show/hide + a11y announcements
src/smoke.test.ts                        → trivial harness check; recreate or skip
```

The tests infer the pure core's public API (function names, signatures, module boundaries). Match that API — it keeps Class A portable and the spec authoritative.

### 0.3 Known traps — read before writing any engine code

Each of these was a real bug or ambiguity during the reference build. A naive implementation reintroduces them. The design section is normative; the named test will catch you.

| Trap | The wrong (naive) version | Normative | Caught by |
|---|---|---|---|
| Write ordering | Apply checked-writes, then reasons | **Reasons before checked** per fired entry, else the `REQUIRES` restore is dropped by the disabled-skip guard | §4.9.3 · `engine.test.ts` (restore case) |
| First render | Seed state straight from `isChecked`/`isDisabled` | Run **`settleState`** (all rules to a fixed point) at compile; locks/visibility correct on frame one | §4.8 · `engine.test.ts`, `mockBackend.test.ts` (initial-lock assertions) |
| `ENABLES_*` semantics | "Enable" = remove disabled flag once | Level-held inverse of `DISABLES_*`: **hold own reason while inactive, release on trigger** (`ENABLES_ON_CHECK` ≡ `DISABLES_ON_UNCHECK`) | §4.4-C · `engine.test.ts`, `mockBackend.test.ts` |
| Restore bookkeeping | New field on `CheckboxValue` | Marker string **`@restore:<ruleId>`** inside `disabledBy`, paired with the lock reason, stripped together, filtered from user-facing reason display | §4.4-B, §4.7 · `disabled.test.ts` |
| Edge vs. level | Cascades continuously re-assert (targets can never be unchecked) | Category-A rules are **edge-triggered**: fire on source *change* only | §4.4 fact 1 · `engine.test.ts`, `mockBackend.test.ts` |
| Barrier rule | Cascades write through disabled targets | Checked-writes **skip** any leaf with non-empty `disabledBy`; only the lock-owning rule bypasses its own lock | §4.4 fact 2, §4.7 · `disabled.test.ts` |
| `fe.*` on empty resources | Zero-leaf source ⇒ error, always | `fe.*`-prefixed rules **skip** on zero-leaf expansion; every other rule errors | §4.4a · `merge.test.ts`, `expand.test.ts` |
| Visibility as a relation | Model show/hide as a relation primitive | First-class binding; **reconciled once, after** the BFS fixed point; hide writes terminal cleared+`@hidden` | §4.6 · `mockBackend`-style visibility tests, Class B container tests |
| `REQUIRES` indexing | Trigger on source clicks | Indexed by **targets** (prerequisites) + condition ids; order-independent | §4.9.1 · `engine.test.ts` |
| Categories in state | Store category checkbox values | Categories/headers are **derived only** — no state key, no adjacency node; clicks normalize to multi-leaf events | §4.5 · `derive.test.ts` |

### 0.4 Conduct

- Never modify legacy behavior in-place during Phases 1–2 (analysis only).
- Every claim in your gap report cites a file+line (legacy) or section (v5).
- If a legacy behavior cannot be expressed by any §4.4 primitive + §4.6 visibility + `condition`, that is a **cutover blocker** — record it prominently; do not invent a new primitive or an inline hack.

---

## Phase 1 — Discovery: inventory the legacy implementation

**Goal:** know exactly what exists before comparing anything.

1. Locate the legacy checkbox/relation code. Search for the UI (the ACTION table / FIELD tree screens), then trace to handlers. Record: entry components, state shape, every place that writes checkbox state, and any existing design/requirement docs for it.
2. Build the **legacy behavior inventory** — one row per distinct behavior, per resource and status if they differ:
   - the trigger (what the user does),
   - the observed effect (what changes: checked values, disabled flags, visibility),
   - where it is implemented (file:line),
   - whether it is data-driven or hardcoded.
   Cover at minimum: any check/uncheck coupling between checkboxes, EDIT/VIEW-style implications, exclusivity groups, anything that disables/enables other checkboxes, anything that hides/shows sections and what happens to hidden values, initial disabled/checked defaults, and what exactly is submitted on save.
3. Record how legacy handles the cases in v5 §4.11 (special-cases catalogue) — for each row of that table, note legacy's actual behavior or "not applicable / never occurs."
4. Inventory the store integration: which slice(s), who writes, whether writes are centralized or scattered (this determines the migration risk for the single-write-path rule, v5 §2).

**Gate 1:** a `legacy-inventory.md` containing the behavior table, the §4.11 comparison, the writer inventory, and a list of every resource/status combination in scope. No code changes made.

## Phase 2 — Contract verification & gap analysis

**Goal:** verify v5's canonical contract against real data, then produce the definitive diff between legacy and v5.

### 2.1 Payload verification (operator provides payloads/API access)

For 3–5 real payloads across different resources (include at least one with statuses and one without):

- **ID grammar (v5 §4.1):** confirm (a) IDs are slash-delimited four-position — or record the real delimiter/positions; (b) `type` is exactly `ACTION|VIEW|EDIT` — or record the real values; (c) the tail segment (`path`) is never something the FE must split; (d) VIEW/EDIT siblings share an identical path.
- **Packaging (v5 §4.2):** keyed-by-status (`content: StatusContent[]`) vs. one flat list with STATUS baked into ids — record which, plus field names that differ from the canonical contract.
- **Relations/visibility in the payload:** does the real backend already send relation/visibility data? In what shape? With stable ids (v5 §8 H14)?
- Write the **adapter decision record**: for every observed difference, the exact mapping `toEngineConfig()` will perform, and the reverse mapping for `serializeForSave()`. The engine contract does not bend (v5 §4.0) — all differences are absorbed here.

### 2.2 Doc-vs-doc comparison (if a legacy design doc exists)

Table: each legacy-doc claim → the corresponding v5 section → verdict (`same` / `differs` / `absent in v5` / `absent in legacy doc`) → whether the legacy *code* actually follows the legacy doc (docs lie; the inventory from Phase 1 is the truth).

### 2.3 Parity audit (the core deliverable)

For **every row** of the Phase-1 behavior inventory, classify:

- `EXPRESSIBLE` — maps to a v5 primitive/feature; name it (e.g. "maps to `MUTUAL_EXCLUSIVE`, per-member declarations, §4.4-A") and draft the actual `RelationRule`/`VisibilityBinding` JSON for it.
- `EXPRESSIBLE-WITH-CHANGE` — v5 can express it but the user-visible behavior will differ (e.g. legacy re-asserts a cascade continuously; v5 is edge-triggered, §4.4 fact 1). Describe the visible difference precisely.
- `BLOCKER` — no v5 construct expresses it. Quote the legacy code and state why each candidate primitive fails.

Also run the reverse direction: v5 features with **no legacy counterpart** (settle pass, reason-based multi-lock, `condition`, priority, `@hidden` clearing on hide, restore-on-satisfy…) — these are new behaviors the product team should knowingly accept, not surprises.

**Gate 2 — STOP AND WAIT.** Produce `gap-report.md` containing: the adapter decision record (2.1), the doc comparison (2.2), the parity audit (2.3) with the drafted config JSON, all `BLOCKER`s and `EXPRESSIBLE-WITH-CHANGE`s at the top, and your recommended cut of the implementation phases below. **Present it to the operator for review before writing any implementation code.** Only proceed on approval.

## Phase 3 — Implementation (after gap-report approval)

Mirror v5 §5, in this project's idioms. The store is **Redux Toolkit** — the shell design ports conceptually as-is: one slice `Record<LeafId, CheckboxValue>` keyed by the full four-segment ID, `createSelector` for every derived value (category aggregates and region visibility MUST be memoized — a fresh object per call breaks react-redux and floods warnings), and one hook that is the sole writer (one `getState`-equivalent read, one dispatch per interaction).

**Read `checkbox-relation-v5-performance-guide.md` before writing any Phase-3 code and keep its
phase ledger (§1) open while you work.** The legacy engine's measured failure was per-click
compile/settle work (~70ms at 140 nodes); the guide's anti-pattern table (§7) is a review
checklist for every file you touch, and its acceptance gates (§8) — compile counter, one dispatch
per click, seeded-BFS dequeue counts, reference-stability tests, profiler budgets — are **part of
Gate 3** below.

Each step = implement + make its Class-A tests pass + typecheck clean, before the next:

1. **Adapter** — `toEngineConfig()` / `serializeForSave()` per the approved decision record, with fixture tests built from the real payloads. This is the only step where real-payload shape appears. **Wire config in per performance-guide §9: compile in the fetch layer (RTK Query `transformResponse`) and seed the working slice from the fulfilled action — never mirror the fetch cache into the slice with a `useEffect`.** This is also where you decide the BE→engine sync shape; if the config can change mid-edit (§9.5), stop and raise it with the operator rather than re-seeding over edits.
2. **ID parser** (§4.1) → `parseId.test.ts` green.
3. **Seeding + tree normalization** (§4.2, §4.5) → `seed.test.ts`, `tree.test.ts` green.
4. **Expression compiler + validation** (§4.3) → `expand.test.ts` green. Every load-error class throws with an actionable message.
5. **FE-default merge** (§4.4a) → `merge.test.ts` green.
6. **Pure engine** — effects for all 12 primitives + condition, adjacency index, `resolveToggle` BFS with the §4.9.3 ordering and §4.9.4 tie-breaks, visibility reconciliation, `settleState` (§4.4, §4.6, §4.8, §4.9) → `engine.test.ts`, `disabled.test.ts`, `derive.test.ts`, `mockBackend.test.ts`, property test green. Re-read §0.3 before this step.
   Then implement `checkbox-relation-v5-test-cases.md` in full (suite order L → N → D → C → VIS → H → E per its checklist) — the traveling files cover many of its cases already; map IDs first, add only the missing ones.
7. **State-container + shell** — decide the container per performance-guide §10 before writing it: **because this project keeps RTK Query, the store already exists → put the checkbox state in one feature-scoped RTK slice** (selectors satisfy fine-grained re-render; `matchFulfilled` satisfies effect-free seeding). Do **not** split it into a separate `useReducer` (§10.5 trap) and never read cell state through Context (§10.3). Then: memoized selectors, single-writer hook; rewrite Class-B tests against your components (preserve every assertion's intent, especially: exactly one dispatch per click; hide clears + announces; reshow comes back empty). If the operator later decides to drop RTK Query too, re-run the §10.6 procedure — the container answer changes.
8. **UI** — reuse/restyle the project's existing table components where possible; categories tri-state derived, never stored; disabled cells expose a reason (reserved markers filtered, §4.7).
9. **Parity cutover** — encode the approved parity-audit config JSON as the real per-resource configs; add one behavior test per legacy inventory row; run legacy and new side-by-side on at least one resource if the project's feature-flag infrastructure allows; remove legacy writers only after the single-write-path check (grep: no dispatch to the slice outside the engine hook).

**Gate 3 (final):** all Class-A tests pass unmodified (imports aside) · rewritten Class-B equivalents pass · every parity row has a passing test or a signed-off `EXPRESSIBLE-WITH-CHANGE` note · typecheck + build clean · **performance-guide §8 acceptance gates pass** (compile-count, dispatch-count, dequeue-bound, reference-stability tests, profiler budgets — include the numbers as evidence) · a closing report mapping each gap-report item to its resolution.

---

*Normative reference: `checkbox-relation-engine-design-v5.md`. When in doubt, the precedence order in §0.1 decides. When still in doubt, stop and ask the operator — a wrong guess about relation semantics ships a permissions bug.*
