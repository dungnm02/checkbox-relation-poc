# Checkbox Relation Engine — Developer Guide

**A 5-minute read for humans.** This guide is *non-normative*: it explains the engine's mental
model, the vocabulary, and the recipes you'll actually use. The full specification is
[`checkbox-relation-engine-design-v5.md`](./checkbox-relation-engine-design-v5.md) — **if this
guide and v5 ever disagree, v5 wins.** Agents implementing or auditing the engine should read v5
and the test-case spec, not this.

---

## The mental model in 60 seconds

Two checkbox surfaces — a flat **ACTION** table and a **FIELD** tree with VIEW/EDIT columns —
where checking one box can check, uncheck, lock, or unlock others. All of that coupling is **data**
(a relation config), never `if`-statements in components.

```
config ──▶ compile once (validate, expand wildcards, settle) ──▶ initial state
click  ──▶ one pure function resolves the whole ripple        ──▶ one store dispatch
```

Three things carry the whole design:

1. **Every checkbox has a 4-part id** — `RESOURCE/STATUS/TYPE/PATH` — and state is one flat map
   keyed by it. Statuses never share or affect each other's state.
2. **`resolveToggle` is pure.** One click → one call → the complete next state (every cascade,
   lock, and visibility change already applied) → one dispatch, one render. Nothing else may
   write to the slice, ever. That single-writer rule is what makes the invariants trustworthy.
3. **"Disabled" is a list of reasons, not a boolean.** `disabledBy: string[]` — each rule adds and
   removes only *its own* id; a box re-enables when the list is empty. That's why two rules can
   lock the same box without fighting.

## Vocabulary (read once, saves you an hour)

| Term | Meaning |
|---|---|
| **Leaf** | One actual checkbox (ACTION, or the VIEW/EDIT half of a field row). The only thing that has state |
| **Category** | A grouping row in the FIELD tree. Has **no** state — its tri-state cell is derived from its leaves; clicking it just toggles its leaves |
| **`path`** | The 4th id segment. Opaque payload for a downstream module — the engine never looks inside it |
| **Edge-triggered** | Fires once when the source *changes* (all cascades, MUTUAL_EXCLUSIVE…). It does **not** keep re-asserting afterwards |
| **Level-held** | A lock that is present *while* a condition holds (REQUIRES, DISABLES/ENABLES). Correct even on first render |
| **Barrier** | A locked leaf blocks cascades — chains stop there. Only the rule that owns the lock can write through it |
| **Settle** | The compile-time pass that runs every rule to a fixed point, so locks/visibility are right before the first paint |
| **Region / controller** | The FIELD table is a *region*; the ACTION checkboxes that show/hide it are its *controllers* (visible ⟺ any checked) |
| **`fe.*` rules** | Frontend-shipped default relations (the EDIT⇒VIEW invariant), merged into every config; override one by reusing its exact id |

## The primitives at a glance

*Full contract cards with every edge case: v5 §4.4.*

| You want… | Use | Plain-language behavior |
|---|---|---|
| "Checking A also checks B, C" | `CASCADES_CHECK` | Fires when A becomes checked. Unchecking A touches nothing |
| "Unchecking A clears B, C" | `CASCADES_UNCHECK` | Mirror of the above |
| "B, C follow A both ways" | `CASCADES_BOTH` / `GROUP_ALL` | Select-all behavior (`GROUP_ALL` is just a nicer name) |
| "At most one of A, B, C" | `MUTUAL_EXCLUSIVE` | ⚠️ Declare it **per member** — a single `A → [B,C]` rule doesn't clear A when B is checked |
| "B is always the opposite of A" | `INVERSE` | Directional: A drives B; clicking B doesn't touch A (declare both ways if you need that) |
| "A and B mirror each other" | `BIDIRECTIONAL` | Either side drives the other; declare once, the mirror is automatic |
| "A can't be on until B and C are" | `REQUIRES` | A is *locked + unchecked* until all prerequisites hold; `restoreCheckedOnSatisfy` brings A's old ✓ back |
| "While A is on, B is locked (and cleared)" | `DISABLES_ON_CHECK` (+ `forceCheckedValue: false`) | Lock held while A is checked, released when unchecked |
| "A unlocks B" | `ENABLES_ON_CHECK` | B starts locked; checking A releases it. (Internally the mirror of `DISABLES_ON_UNCHECK` — same machinery, its own reason id) |
| "…but only when X is on" | `condition` on any rule | Gates the rule; re-evaluates automatically when X changes |

**The two facts people trip on:** cascades are *one-shot* (after "select all," the user can still
uncheck an item — nothing re-checks it), and *locked boxes stop chains* (a cascade quietly skips
any leaf another rule has locked). Both are by design — v5 §4.4, hazards H12/H13.

## Five rules you must never break

1. **Never write checkbox state outside the engine hook.** No extra dispatch, no "quick fix" in a
   component. Every guarantee in the system assumes the single write path.
2. **Never parse or split `path`.** It belongs to another module. Hierarchy comes from the tree
   structure in the payload, never from the id.
3. **Never persist or transmit `disabledBy`.** Save emits `{ id, isChecked }` only. Locks are
   always recomputed from config + checked values on the next load.
4. **Never author a relation across statuses.** The compiler rejects it; don't look for a way around.
5. **Never target a category in a rule.** Categories aren't checkboxes. "All fields in a column"
   is `$VIEW` / `$EDIT` or a wildcard.

## Recipes

**Select-all header** — `GROUP_ALL` from the header ACTION to the members. Done.

**A real exclusive group (A/B/C):** three rules, one per member:
```json
{ "id": "ex.a", "sourceId": ".../ACTION/a", "relationships": [{ "id": "ex.a", "type": "MUTUAL_EXCLUSIVE", "targets": [".../ACTION/b", ".../ACTION/c"] }] }
// …and the same shape for ex.b (targets a,c) and ex.c (targets a,b)
```

**"Publish needs Review + QA, and remembers it was on":**
```json
{ "id": "req.publish", "sourceId": ".../ACTION/publish", "relationships": [
  { "id": "req.publish", "type": "REQUIRES", "targets": [".../ACTION/reviewed", ".../ACTION/qa_passed"], "restoreCheckedOnSatisfy": true } ] }
```

**Hide the whole FIELD table unless one of several actions is on:** not a relation — a visibility binding:
```json
{ "region": "FIELD", "controlledBy": ["RES/*/ACTION/enable_fields", "RES/*/ACTION/advanced"], "showWhen": "anyChecked", "whenHidden": "clearAndLock" }
```
Hiding clears + locks every field checkbox; re-showing brings them back **empty** on purpose.

**Turn off EDIT⇒VIEW for one resource:** ship a rule with the exact id `fe.edit-checks-view`
(and/or `fe.view-unchecks-edit`) in that resource's config — same-id rules replace the FE default.

**Write a rule once for every status:** use `*` in the status position
(`RES/*/ACTION/export`) — it expands to one independent rule per status and can never cross them.

## Debugging FAQ

- **"Why is this checkbox disabled?"** Look at its `disabledBy` in the store. Each entry is a rule
  id (or `@initial` = backend default, `@hidden` = its section is hidden). Ignore `@restore:*` —
  that's internal bookkeeping. It re-enables when the array is empty, so find who still holds a reason.
- **"My cascade stopped halfway."** Something in the chain is locked — locks are barriers. Check
  `disabledBy` on the leaf where it stopped.
- **"I checked the box and its dependents didn't update."** Almost always: the value didn't
  actually *change* (already checked), or a `condition` on the rule is false right now.
- **"Two rules want different values for the same box — who wins?"** Higher `priority`; tie →
  the rule nearer the clicked box; tie → declaration order. If you're relying on declaration
  order, set an explicit `priority` instead (v5 §4.9.4).
- **"The page loads with things already locked/hidden — is that a bug?"** No — the settle pass
  applies every rule before first render. If it's locked at load, some rule genuinely locks it.
- **"My config change crashed the page at load."** Intentional. Compile validates everything and
  throws with the offending rule id — fix the config; the engine never limps along on a bad one.

## Where to go deeper

| You need… | Go to |
|---|---|
| Exact semantics of any primitive or edge case | v5 §4.4, §4.11 (special-cases table) |
| The id grammar / config payload shape | v5 §4.1–§4.2 (adapters: §4.0) |
| How propagation, chaining, and conflicts really work | v5 §4.9 |
| What can break the product and what guards it | v5 §8 (hazard register) |
| Ready-made test cases (IDs N/C/VIS/D/L/H/E) | [`checkbox-relation-v5-test-cases.md`](./checkbox-relation-v5-test-cases.md) |
| A live demo of every primitive | run the app → resource `DEMO · RELATION_TYPES`, one status tab per primitive |
