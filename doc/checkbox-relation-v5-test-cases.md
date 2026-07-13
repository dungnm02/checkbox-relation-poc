# Checkbox Relation Engine v5 — Test Case Specification

**Audience:** the implementing agent. Every case below is written to be implemented as an automated test (Vitest or equivalent) against the **pure core** — plain objects in, plain objects out, no React, no store — except the few marked `[shell]`.
**Normative reference:** `checkbox-relation-engine-design-v5.md`. Every case cites its section. If a case and the design text seem to disagree, stop and report — do not resolve it yourself.
**Relationship to the traveling test files:** the Class-A test files already implement many of these cases. Before writing new tests, map each case ID to an existing test (record the mapping in a comment or table); implement only the ones with no match. Do not delete or weaken an existing assertion because this spec doesn't mention it.

---

## 0. Conventions used in every case

**Fixture shorthand.** Unless a case says otherwise: one resource `RES`, one status `S1`.

| Shorthand | Meaning |
|---|---|
| `A:x` | ACTION leaf `RES/S1/ACTION/x` |
| `V:p` / `E:p` | VIEW / EDIT leaf `RES/S1/VIEW/p` / `RES/S1/EDIT/p` (a field leaf contributes both) |
| `S2·A:x` | same, in status `S2` (multi-status fixtures list `statuses: [S1, S2]`) |
| `[ ]` / `[x]` | seeded `isChecked: false` / `true` |
| `⛔` | seeded `isDisabled: true` (⇒ `disabledBy: ["@initial"]`) |
| `r1: SRC —TYPE→ [T1, T2]` | one relation rule, relationship id `r1`, of TYPE, from SRC to targets |
| `(if COND)` | `condition` on that relationship |
| `(prio n)` / `(restore)` / `(force=false)` | `priority: n` / `restoreCheckedOnSatisfy: true` / `forceCheckedValue: false` |

**Default seeds:** every leaf `[ ]` and enabled, unless stated.

**Operations.**
- `compile(config)` — full pipeline: parse → seed → merge FE defaults → expand → validate → **settle** (§4.8). Yields `initialState` + engine.
- `toggle(id, on|off)` — one user interaction resolved through the pure engine (`resolveToggle`); returns next state. Never mutate state directly.
- `categoryToggle(cat, column)` — a category-aggregate click, normalized per §4.5.

**Assertions.**
- `X = ✓ / ✗` — `checked` is true / false.
- `X locked(r1)` — `disabledBy` contains `"r1"`. `X unlocked` — `disabledBy` is empty. `X locked(only r1)` — exactly `["r1"]` (order-insensitive; `@restore:*` markers noted explicitly when expected).
- `THROWS <Class>` — `compile` throws; the error message must name the offending rule/id (assert message contains the id, not the exact wording).
- `WARNS` — compile succeeds and the warning list contains an entry naming the id.

**Global invariant (assert in a shared helper, applied after every `toggle` in every case):** the returned state is a new object; the input state is unmutated; every `disabledBy` is an array of strings; no key was added or removed relative to `initialState`.

---

## Suite N — Normal cases: one group per primitive (§4.4)

### N1 · CASCADES_CHECK
Fixture: `A:src [ ]`, `A:t1 [ ]`, `A:t2 [ ]` · `r1: A:src —CASCADES_CHECK→ [A:t1, A:t2]`

| ID | Steps | Expect |
|---|---|---|
| N1.1 fire on check | `toggle(A:src, on)` | `A:t1 = ✓`, `A:t2 = ✓` |
| N1.2 opposite edge is a no-op | N1.1 then `toggle(A:src, off)` | `A:t1 = ✓`, `A:t2 = ✓` (untouched), `A:src = ✗` |
| N1.3 edge-triggered, not re-asserted (§4.4 fact 1) | N1.1 then `toggle(A:t1, off)` | `A:t1 = ✗` and stays — nothing re-checks it |
| N1.4 barrier: locked target skipped (§4.4 fact 2) | seed `A:t2 ⛔`; `toggle(A:src, on)` | `A:t1 = ✓`; `A:t2 = ✗` and still `locked(@initial)` |

### N2 · CASCADES_UNCHECK
Fixture: `A:src [x]`, `A:t1 [x]`, `A:t2 [x]` · `r1: A:src —CASCADES_UNCHECK→ [A:t1, A:t2]`

| ID | Steps | Expect |
|---|---|---|
| N2.1 fire on uncheck | `toggle(A:src, off)` | `A:t1 = ✗`, `A:t2 = ✗` |
| N2.2 opposite edge no-op | N2.1 then `toggle(A:src, on)` | `A:t1 = ✗`, `A:t2 = ✗` (untouched) |

### N3 · CASCADES_BOTH — N3.1: from all-unchecked, `toggle(src, on)` checks both targets; `toggle(src, off)` unchecks both. Same fixture shape as N1.

### N4 · GROUP_ALL (alias)
N4.1: identical fixture to N3 but `type: GROUP_ALL` — behavior must be **indistinguishable** from N3.1. (If the implementation compiles the alias away, assert behavior, not internals.)

### N5 · MUTUAL_EXCLUSIVE
Fixture (full group, per-member declarations — §4.4-A card): `A:a`, `A:b`, `A:c`, with `ra: A:a —ME→ [A:b, A:c]`, `rb: A:b —ME→ [A:a, A:c]`, `rc: A:c —ME→ [A:a, A:b]`

| ID | Steps | Expect |
|---|---|---|
| N5.1 at most one | `toggle(A:a, on)` then `toggle(A:b, on)` | `A:b = ✓`, `A:a = ✗`, `A:c = ✗` |
| N5.2 group may empty | N5.1 then `toggle(A:b, off)` | all three `✗` — nobody is auto-elected |
| N5.3 uncheck edge is a no-op | from all-✗, `toggle(A:a, on)`, `toggle(A:a, off)` | `A:b`, `A:c` untouched throughout |
| N5.4 hub-only declaration is asymmetric (§4.11 case 9) | only `ra` declared; `toggle(A:b, on)` after `toggle(A:a, on)` | `A:a` **stays ✓** — b has no rule; both checked. This asymmetry is *correct*; the test documents it |

### N6 · INVERSE
Fixture: `A:src [ ]`, `A:t [x]` · `r1: A:src —INVERSE→ [A:t]`

| ID | Steps | Expect |
|---|---|---|
| N6.1 both edges | `toggle(A:src, on)` ⇒ `A:t = ✗`; then `toggle(A:src, off)` ⇒ `A:t = ✓` |
| N6.2 directional: target does not drive source | `toggle(A:t, off)` | `A:src = ✗` unchanged (still `✗`) — no mirror |
| N6.3 two-way pair is stable | add `r2: A:t —INVERSE→ [A:src]`; `toggle(A:src, on)` | `A:t = ✗`, `A:src = ✓`, terminates (no oscillation), and `toggle(A:t, on)` ⇒ `A:src = ✗` |

### N7 · BIDIRECTIONAL
Fixture: `A:a [ ]`, `A:b [ ]` · `r1: A:a —BIDIRECTIONAL→ [A:b]` (one declaration only)

| ID | Steps | Expect |
|---|---|---|
| N7.1 source drives target | `toggle(A:a, on)` | `A:b = ✓` |
| N7.2 target drives source (auto-mirror) | `toggle(A:b, off)` after N7.1 | `A:a = ✗` |

### N8 · REQUIRES
Fixture: `A:pub [x]` (note: seeded checked), `A:rev [ ]`, `A:qa [ ]` · `r1: A:pub —REQUIRES→ [A:rev, A:qa] (restore)`

| ID | Steps | Expect |
|---|---|---|
| N8.1 settle locks at load (§4.8) | `compile` only | `initialState`: `A:pub = ✗`, `locked(r1)`, and `disabledBy` contains `@restore:r1` (it was seeded checked + restore) |
| N8.2 partial satisfaction keeps lock | `toggle(A:rev, on)` | `A:pub` still `✗ locked(r1)` |
| N8.3 full satisfaction releases + restores | N8.2 then `toggle(A:qa, on)` | `A:pub = ✓`, `unlocked`, no `@restore:*` residue |
| N8.4 order independence | same as N8.2–3 but satisfy `A:qa` first, then `A:rev` | identical final state to N8.3 |
| N8.5 re-lock on regression | N8.3 then `toggle(A:rev, off)` | `A:pub = ✗ locked(r1)` again (with marker — it was checked) |
| N8.6 restore=false variant | same fixture, no `(restore)` | N8.1: locked, **no marker**; after satisfying both: `A:pub unlocked` but **`= ✗`** — released empty, not restored |
| N8.7 user cannot toggle while locked | in N8.1 state, `toggle(A:pub, on)` | no-op (state deep-equal) |

### N9/N10 · DISABLES_ON_CHECK / DISABLES_ON_UNCHECK
Fixture N9: `A:ro [ ]`, `A:edit [x]` · `r1: A:ro —DISABLES_ON_CHECK→ [A:edit] (force=false)`

| ID | Steps | Expect |
|---|---|---|
| N9.1 lock + force | `toggle(A:ro, on)` | `A:edit = ✗` (forced through its own lock) and `locked(r1)` |
| N9.2 level release | N9.1 then `toggle(A:ro, off)` | `A:edit unlocked`, still `✗` (force is not undone — no restore semantics on DISABLES) |
| N9.3 settle: seeded-active level | seed `A:ro [x]` instead; `compile` | `initialState`: `A:edit = ✗ locked(r1)` before any interaction |
| N9.4 no force variant | drop `(force=false)`; `toggle(A:ro, on)` | `A:edit locked(r1)` but keeps `✓` — lock without value pin |
| N10.1 mirror polarity | `r1: A:active —DISABLES_ON_UNCHECK→ [A:notify]`, `A:active [x]`; `toggle(A:active, off)` | `A:notify locked(r1)`; re-check releases |

### N11/N12 · ENABLES_ON_CHECK / ENABLES_ON_UNCHECK
Fixture N11: `A:unlock [ ]`, `A:area [ ]` · `r1: A:unlock —ENABLES_ON_CHECK→ [A:area]`

| ID | Steps | Expect |
|---|---|---|
| N11.1 starts locked via settle (§4.8) | `compile` | `initialState`: `A:area locked(r1)` — the enabling condition is unmet from frame one |
| N11.2 trigger releases | `toggle(A:unlock, on)` | `A:area unlocked` |
| N11.3 re-lock on reverse | N11.2 then `toggle(A:unlock, off)` | `A:area locked(r1)` again |
| N11.4 **equivalence (normative, §4.4-C)** | build twin fixtures: `ENABLES_ON_CHECK` vs `DISABLES_ON_UNCHECK`, same ids/targets; drive both through the same toggle sequence | state sequences are **identical** except the reason string. Repeat for `ENABLES_ON_UNCHECK` ≡ `DISABLES_ON_CHECK` (N12.1) |

### N13 · Universal `condition`
Fixture: `A:send [ ]`, `A:charts [ ]`, `A:enabled [ ]` · `r1: A:send —CASCADES_CHECK→ [A:charts] (if A:enabled)`

| ID | Steps | Expect |
|---|---|---|
| N13.1 gate closed ⇒ no-op | `toggle(A:send, on)` | `A:charts = ✗` |
| N13.2 condition input change re-fires (§4.4) | N13.1 then `toggle(A:enabled, on)` | `A:charts = ✓` — the rule re-evaluated against `A:send`'s *current* state |
| N13.3 order independence | enable first, then send | same final state as N13.2 |
| N13.4 `any` / `not` forms | repeat N13.1–2 with `(if any:[A:e1, A:e2])` (either input opens the gate) and `(if not A:blocked)` (checking `A:blocked` closes it) | gate semantics per §4.4; closing a `not` gate does not *undo* past effects — it only stops future fires |
| N13.5 condition on a level rule | `r1: A:m —DISABLES_ON_CHECK→ [A:t] (if A:g)`; with `A:m [x]`: toggling `A:g` on/off | lock present only while gate open AND level active |

### N14 · FE default layer (EDIT ⇒ VIEW, §4.4a) — needs a FIELD fixture
Fixture: field leaves `p1`, `p2` (so `V:p1`,`E:p1`,`V:p2`,`E:p2`), **no incoming relations**.

| ID | Steps | Expect |
|---|---|---|
| N14.1 check EDIT pulls VIEW | `toggle(E:p1, on)` | `V:p1 = ✓`; `V:p2`, `E:p2` untouched (binding is per-path) |
| N14.2 uncheck VIEW drops EDIT | N14.1 then `toggle(V:p1, off)` | `E:p1 = ✗` |
| N14.3 the two inert directions | `toggle(E:p1, off)` leaves `V:p1`; `toggle(V:p2, on)` leaves `E:p2` |
| N14.4 override by exact id | incoming rule with id `fe.edit-checks-view`, same source, `targets: []`… use a benign variant: same id but `CASCADES_CHECK → [V:p1]` only | default replaced: `toggle(E:p2, on)` no longer checks `V:p2` |
| N14.5 zero-leaf skip | config with `field: []` (ACTION-only resource) | `compile` succeeds; no error from the `fe.*` defaults |

---

## Suite C — Chaining & propagation edge cases (§4.9)

### C1 · Cross-category chain, depth 3
Fixture: `A:a [ ]`, `A:b [ ]`, `A:c [x]`, `A:d [x]` ·
`r1: A:a —CASCADES_CHECK→ [A:b]` · `r2: A:b —DISABLES_ON_CHECK→ [A:c] (force=false)` · `r3: A:c —CASCADES_UNCHECK→ [A:d]`
**Steps:** `toggle(A:a, on)`. **Expect:** `A:b = ✓` → `A:c = ✗ locked(r2)` → **`A:d = ✗`** — the owner-bypass force on `A:c` still *propagates* (§4.11 case 3). One toggle, full chain, and (shell variant `[shell]` C1s) exactly **one dispatch**.

### C2 · Chain stops at a foreign lock (§4.9.5)
Same as C1 but `A:c ⛔` (seeded `@initial`). **Expect:** `A:b = ✓`; `A:c` untouched (`✓… actually seeded [x] ⛔` — stays `✓ locked(@initial)`, r2's force may add its reason but must NOT change checked); `A:d = ✓` — **the chain did not pass through `A:c`**. (Precision: r2's own reason may stack on `A:c` — locked-by-two — but `@initial` blocks the checked-write since r2 does not own `@initial`.)

### C3 · Diamond conflict — priority wins (§4.9.4 rung 1)
Fixture: `A:a`, `A:b [ ]`, `A:c [ ]`, `A:d [ ]` ·
`r1: A:a —CASCADES_CHECK→ [A:b, A:c]` · `r2: A:b —CASCADES_CHECK→ [A:d] (prio 0)` · `r3: A:c —MUTUAL_EXCLUSIVE→ [A:d] (prio 5)`
**Steps:** `toggle(A:a, on)`. **Expect:** both `r2` (write ✓) and `r3` (write ✗) fire against `A:d` in one pass; **`A:d = ✗`** (higher priority). Then swap priorities and assert `A:d = ✓`.

### C4 · Diamond tie — BFS depth wins (rung 2)
`r1: A:a —CASCADES_CHECK→ [A:d]` (depth 1) vs `r2: A:a —CASCADES_CHECK→ [A:b]`, `r3: A:b —MUTUAL_EXCLUSIVE→ [A:d]` (depth 2), equal priority. **Steps:** `toggle(A:a, on)`. **Expect:** `A:d = ✓` — the shallower write (direct from the event) wins.

### C5 · Full tie — declaration order wins (rung 3)
Two equal-priority, equal-depth rules from the same source writing opposite values to `A:d`. **Expect:** the **earlier-declared** rule's value; then swap array order in config and assert the outcome flips. (This test intentionally documents hazard H10 — the flip IS the assertion.)

### C6 · Convergence of the intentionally circular pairs
| ID | Fixture | Assert |
|---|---|---|
| C6.1 | EDIT⇒VIEW defaults on a 3-field tree | `toggle(E:p1, on)`: terminates; second hop writes an already-held value; no further growth |
| C6.2 | `BIDIRECTIONAL` A↔B | `toggle(A, on)`: exactly converges; queue empties |
| C6.3 | fighting pair (H1): `r1: A:a —CASCADES_CHECK→ [A:b]`, `r2: A:b —CASCADES_UNCHECK→ [A:a]` | `toggle(A:a, on)` **terminates** with a deterministic result (assert the exact final state, whatever the tie-break yields — then pin it) |

### C7 · Idempotence (replay)
For every fixture in C1–C6: capture final state, re-apply the **same final toggle event**, assert deep-equal. (Also covered generically by the property suite, C10.)

### C8 · Long chain at depth
Fixture: 12 leaves `A:n1…A:n12` linked `A:n(k) —CASCADES_CHECK→ [A:n(k+1)]`. **Steps:** `toggle(A:n1, on)`. **Expect:** all 12 `✓`; one commit; iterations well under the `10 × leafCount` cap.

### C9 · Level rule flipped mid-chain (§4.9.5)
Fixture: `r1: A:a —CASCADES_CHECK→ [A:m]` · `r2: A:m —DISABLES_ON_CHECK→ [A:t]` with `A:t [x]`. **Steps:** `toggle(A:a, on)`. **Expect:** in the SAME pass, `A:m = ✓` and `A:t locked(r2)` — the level rule was re-evaluated mid-propagation, not deferred to the next click.

### C10 · Property tests (H1 backstop)
Generator: seeded PRNG builds random configs (random leaves across 1–3 statuses, random rules of every type, random conditions/priorities) + random 20-step toggle sequences.
- C10.1 **Termination:** no sequence ever throws the cap `EngineError`.
- C10.2 **Idempotence:** replaying the final event of any sequence changes nothing.
- C10.3 **No key churn:** state keys identical before/after every step.
Use a fixed seed set (≥100 seeds) so failures reproduce.

### C11 · Event-level no-ops
| ID | Steps | Expect |
|---|---|---|
| C11.1 toggle a disabled leaf (§4.11 case 1) | `A:x ⛔`; `toggle(A:x, on)` | deep-equal no-op |
| C11.2 toggle to held value (case 2) | `A:x [x]`; `toggle(A:x, on)` | deep-equal no-op; **no rules fire** (verify a would-be cascade target is untouched) |

### C12 · Category aggregate normalization (§4.5)
Field tree: category `cat` with leaves `p1 [ ]`, `p2 [x]`, `p3 [ ] ⛔(view)`.
| ID | Steps | Expect |
|---|---|---|
| C12.1 mixed → uncheck-all | `categoryToggle(cat, VIEW)` (state is mixed) | `V:p1 = ✗`, `V:p2 = ✗`; `V:p3` untouched (disabled, skipped at normalization) |
| C12.2 unchecked → check-all + cascades still run | from all-✗: `categoryToggle(cat, EDIT)` | every enabled `E:*` = ✓ AND their sibling `V:*` = ✓ (FE default fired per leaf) |
| C12.3 aggregates derived only | assert no state key exists for `cat` in any state object |

---

## Suite VIS — Region visibility (§4.6)

Fixture: 2 statuses `S1`,`S2`; each with controllers `A:c1 [ ]`, `A:c2 [ ]`, binding `region: FIELD, controlledBy: [RES/*/ACTION/c1, RES/*/ACTION/c2], showWhen: anyChecked, whenHidden: clearAndLock`; field leaves `p1 [x]`(view), `p2 [ ]`.

| ID | Steps | Expect |
|---|---|---|
| VIS1 settle: hidden at load | `compile` (all controllers off) | `initialState`: every `V:*`/`E:*` in both statuses `= ✗` and `locked(@hidden)` — including `p1` which was seeded checked |
| VIS2 show strips, comes back empty | `toggle(A:c1, on)` | all S1 field leaves `unlocked` (no `@hidden`) and **all `✗`** — nothing auto-checks (§4.11 case 6) |
| VIS3 OR semantics | VIS2, then `toggle(A:c2, on)`, then `toggle(A:c1, off)` | still visible (c2 holds it); then `toggle(A:c2, off)` ⇒ hidden + cleared + `@hidden` again |
| VIS4 hide clears live state | show, `toggle(V:p1, on)`, then uncheck all controllers | `V:p1 = ✗ locked(@hidden)` |
| VIS5 cascade cannot resurrect a hidden leaf (§4.11 case 5) | while hidden, add `rz: A:z —CASCADES_CHECK→ [V:p1]`; `toggle(A:z, on)` | `V:p1` stays `✗ locked(@hidden)` |
| VIS6 per-status independence | show S1 (`toggle(A:c1, on)`); S2 controllers untouched | S2 field leaves still `locked(@hidden)`; S1's not |
| VIS7 controller is also a relation source (§4.11 case 12) | add `rk: A:c1 —CASCADES_CHECK→ [V:p2]`; from hidden, `toggle(A:c1, on)` | region becomes visible AND `V:p2` — pin the defined outcome: the cascade fired during BFS while `@hidden` was still held ⇒ blocked; visibility reconciles after ⇒ `V:p2 = ✗`, visible. (Hide-wins ordering; the test's purpose is to freeze this exact behavior) |
| VIS8 hide mid-cascade wins | visible with `V:p2 = ✓`; a single toggle that unchecks the last controller | final: hidden, `V:p2 = ✗ locked(@hidden)` — the post-BFS pass overrides anything the BFS did to field leaves |

---

## Suite D — Disabled semantics & reasons (§4.7)

Fixture: `A:t [x]`, two independent lock rules `r1: A:m1 —DISABLES_ON_CHECK→ [A:t]`, `r2: A:m2 —DISABLES_ON_CHECK→ [A:t]`.

| ID | Steps | Expect |
|---|---|---|
| D1 independent stack & release | `toggle(A:m1, on)`, `toggle(A:m2, on)`, then `toggle(A:m1, off)` | after both: `locked(r1 ∧ r2)`; after release: `locked(only r2)` — still disabled until `disabledBy` empties |
| D2 foreign-reason immunity | add `r3: A:e —ENABLES_ON_CHECK→ [A:t]`; hold `r1`'s lock; `toggle(A:e, on)` | `r3`'s own reason released; **`r1`'s remains** — `A:t` still disabled |
| D3 `@initial` irrevocable (§4.11 case 13) | `A:t ⛔` + any ENABLES/DISABLES-release sequence you can construct | `@initial` never leaves `disabledBy`; checked never changes via rules (barrier) though rule reasons may stack/release on top |
| D4 force pierces only its own lock | `A:t` locked by `r1`; `r2` has `(force=false)` and fires | `A:t.checked` unchanged — `r2` owns `r2`'s lock, not `r1`'s |
| D5 marker hygiene | any N8 restore state | `@restore:r1` appears only alongside `r1`; and `[shell]` the reason-display helper filters `@restore:*` out of user-facing text |

---

## Suite L — Load-time validation (§4.3, §4.4a, §4.11)

Each row: build a minimal config with exactly one defect; assert `THROWS` (message names the offender) or `WARNS`. One defect per test — never combine.

| ID | Defect | Expect |
|---|---|---|
| L1 | id with < 3 slashes (`RES/S1/ACTION`) | THROWS parse error |
| L2 | `type` segment not in `ACTION\|VIEW\|EDIT` (e.g. `RES/S1/ADMIN/x`) | THROWS |
| L3 | leaf id whose `status` segment ≠ the `StatusContent.status` it sits in | THROWS (§4.2) |
| L4 | duplicate leaf id across the payload | THROWS |
| L5 | field leaf whose `view.path ≠ edit.path` | THROWS (§4.1) |
| L6 | relation source expression matching **zero** leaves (non-`fe.*`) | THROWS (§4.11 case 7) |
| L7 | `fe.*` default with zero-leaf source (`field: []`) | compiles — **skipped**, no throw |
| L8 | cascade with source ∈ targets (self-loop) | THROWS (§4.11 case 8) |
| L9 | concrete source in `S1`, target pinned to `S2` | THROWS cross-status (§4.3) |
| L10 | `condition` referencing a nonexistent id | THROWS (§4.11 case 15) |
| L11 | `condition` referencing an id in another status | THROWS (case 16) |
| L12 | duplicate relationship ids in incoming relations | THROWS (case 17) |
| L13 | unknown relation `type: "CASCADES_MAYBE"` | THROWS — **never silently ignored** (case 14 / H6) |
| L14 | unknown alias `$ADMIN` / unknown `$SELECTOR(nope)` / selector referencing another selector | THROWS (each its own test) |
| L15 | visibility `controlledBy` resolving to a VIEW leaf | THROWS (§4.6) |
| L16 | visibility `controlledBy` resolving to zero leaves | THROWS |
| L17 | `statuses` lists `S2` but `content` has no `S2` entry (and the reverse) | THROWS (case 19) |
| L18 | non-default rule with id `fe.custom-thing` (namespace squat) | **WARNS**, compiles (H11) |
| L19 | `BIDIRECTIONAL` declared in both directions | **WARNS**, behavior unchanged (case 10) |
| L20 | incoming rule with id exactly `fe.edit-checks-view` | compiles, **overrides** the default (sanctioned; see N14.4) |
| L21 | category name used as `sourceId` or target | THROWS (§4.5) |
| L22 | `path` containing `/` and `.` (`RES/S1/VIEW/a/b.c`) | **compiles** — parsed as one opaque path; positive grammar test (§4.1) |

---

## Suite H — Hazard-register cases (§8) not already covered above

Coverage map first — most hazards are tested elsewhere: H1→C6.3/C10 · H4→L9/L11 · H6→L13 · H7→N8.1/N9.3/N11.1/VIS1 · H10→C5 · H11→L18 · H12→N1.3 · H13→below · H14→parity-audit checklist item (not unit-testable).

| ID | Hazard | Test |
|---|---|---|
| H2.1 | Locks never persisted | `serializeForSave(state)` output contains **only** `{ id, isChecked }` pairs — assert no `disabledBy`, no `@` strings anywhere in the serialized output, for a state containing `@initial`, `@hidden`, rule locks, and a `@restore` marker simultaneously |
| H2.2 | Locks re-derived, not restored | serialize a settled state → build a fresh config whose seeds are the serialized checked values → `compile` → locks match what the rules dictate for those values (not what the old state had) |
| H3.1 | Save/UI consistency under hide | state with hidden region (VIS4) → `serializeForSave` | every hidden field leaf serializes `isChecked: false` — what the user sees (cleared) is what saves |
| H5.1 | Fan-out is real and intentional-only | rule `sourceId: A:one` (concrete), `targets: ["*/*/ACTION/*"]` on a 5-action fixture | expands to 5 edges (minus self if excluded by type rules); assert the expanded edge count is exposed/loggable so review can see it |
| H9.1 | Grammar drift caught at the door | feed the adapter/compile a payload id in a foreign format (dot-delimited) | THROWS at load, never mis-keys state |
| H13.1 | **Write-ordering regression (the big one)** | exactly fixture N8 (REQUIRES + restore), asserting N8.3 | this test **must fail** on an implementation that applies checked-writes before reason-writes (§4.9.3). After your engine passes it, temporarily invert the ordering locally and confirm the test goes red — proving the test has teeth — then revert |
| H15.1 | Cascade budget | 1,000-leaf single-status fixture, one `$ACTION`-wide `GROUP_ALL`; `toggle` the header source | engine (pure function only, no DOM) completes < 16 ms; assert with a generous CI multiplier (e.g. < 50 ms) to avoid flakes, but record the real number |

---

## Suite E — End-to-end acceptance (§4.12)

E1: Compile a realistic two-status config (statuses `IN_PROGRESS`, `IN_REVIEW`; 1 visibility controller; 4 field paths; one backend `MUTUAL_EXCLUSIVE` group; FE defaults active). Script, in order, asserting after each step: show region → check `E:name` (VIEW follows) → uncheck `V:name` (EDIT follows) → check both ME options in sequence (at most one holds) → hide region (fields clear + lock) → re-show (empty) → **switch status and verify `IN_REVIEW` state was never touched by any of it** → serialize and assert the exact `{id, isChecked}` list.

---

## Implementation checklist for the agent

1. Build the fixture helpers **first** (`makeConfig`, shorthand id builders, the global-invariant helper) — every suite reuses them; do not inline raw config JSON in 60 tests.
2. Implement suites in this order: **L → N → D → C → VIS → H → E** (validation first — every later suite silently depends on compile being trustworthy).
3. One `it()` per case ID; name it `"<ID> — <title>"` so failures map straight back to this document.
4. After all suites pass, produce the mapping table (case ID → test file/name → pre-existing or new) and attach it to the Phase-3 closing report described in `checkbox-relation-v5-work-agent-plan.md`.
5. Any case you cannot implement because the design seems ambiguous: **stop, quote the case ID and the v5 section, and report** — the two documents are supposed to be sufficient; a gap between them is a finding, not something to patch over.
