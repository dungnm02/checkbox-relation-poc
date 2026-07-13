# Checkbox Relation Engine — Design Decision Log

**What this is:** a retrospective of how the design got to v5 — every significant challenge, the
reasoning at the moment it was faced, the options weighed, and how the winner was evaluated.
It is a *learning document*, not a spec: nothing here is normative
(that's [v5](./checkbox-relation-engine-design-v5.md)), and it deliberately includes the two
outright mistakes, because the recovery from them is more instructive than the decisions that
went smoothly.

---

## Part 0 — The recurring toolkit

Ten principles were applied over and over. Every decision record below cites the ones it used,
so this list is the actual "how to learn from this" part:

1. **Rank every choice by cost of reversal, not by preference.** A one-way door (contract shape,
   state ownership, ID grammar) gets days of scrutiny; a two-way door (naming, file layout) gets
   seconds. Most arguments about software are people applying blocker-level energy to
   afternoon-fixable choices.
2. **Constraint by construction > validation > convention.** Best: make the illegal state
   *inexpressible* (statuses can't cross because the status position always binds source→target).
   Second best: reject it loudly at load. Worst: write a comment asking people not to.
3. **Data over code for anything a non-owner must inspect, dispute, or override.** A rule shipped
   as config can be printed, diffed, and overridden per resource; the same rule hardcoded in a
   hook is invisible and non-negotiable.
4. **Optimize for the config author's failure modes, not the engine's elegance.** The engine is
   written once by people who read specs; configs are written forever by people who don't. Every
   trade between "smaller primitive set" and "harder to author wrongly" went to the author.
5. **When a requirement is ambiguous: ask.** When the answer genuinely can't be had yet: pick the
   most likely option, mark it `TODO(verify)`, and *build a boundary so being wrong is cheap*
   (the adapter). Never silently guess on a one-way door.
6. **The default path must be the safe path.** Cascades skip locked leaves *by default*;
   piercing a lock would be an explicit per-rule opt-in. Escape hatches are fine; weakened
   defaults are not.
7. **One mechanism, zero special cases.** First render, user clicks, and category clicks all run
   the *same* propagation core. Every special-cased path is a place where semantics silently fork.
8. **Ambiguity discovered late is decided once, written down as normative, and backed by a test.**
   Not "clarified in a comment" — promoted to the spec so the next implementer can't re-litigate it.
9. **Fail fast and loud at load; never a silent runtime no-op.** A config typo that quietly
   disables a business rule is how bad data gets *saved*; a boot error is annoying and harmless.
10. **A test that cannot fail is decoration.** For the highest-stakes regression, we deliberately
    inverted the implementation to watch the test go red before trusting it.

---

## Part A — Requirements & scoping decisions

### D1 · The requirement contradicted the existing design — reconcile or rewrite?

- **Challenge:** the updated requirement arrived with a different ID grammar, a different table
  structure (2 tables → ACTION + FIELD-tree-with-two-columns), a new STATUS dimension, and a
  "special behavior" (hide the whole FIELD table) that v3 had no concept for.
- **Mental state at the time:** strong temptation to patch v3 incrementally — each individual
  difference looked absorbable. The red flag was that *the ID grammar itself* had changed:
  when the atoms change, every structure built on the atoms is suspect.
- **Options:** (a) patch v3 piecewise; (b) rewrite immediately from the new requirement;
  (c) interrogate the requirement first, then rewrite once.
- **Decision:** (c). Several rounds of pointed questions (is the tree still hierarchical? do
  statuses share state? do disabled boxes participate in relations? can multiple checkboxes hide
  the table?) *before* writing a line of the new design.
- **Evaluation:** every answer invalidated a plausible guess. E.g., "the ID is for another
  module" single-handedly killed the entire v3 path-expression DSL (D2). Patching first would
  have produced a design correct in its prose and wrong in its foundations.
- **Lesson (toolkit #5):** the cost of asking is one conversation; the cost of guessing on
  foundations is a rewrite that arrives *after* implementation. Also: write the new version as a
  new document (v4 superseding v3) — preserving the old one keeps the diff of *decisions* visible.

### D2 · Is the ID a hierarchy or an opaque token?

- **Challenge:** IDs like `AI_FEATURE/IN_PROGRESS/VIEW/properties.name` look hierarchical
  (`properties.name` begs to be split on the dot). v3 had a whole expression DSL
  (`$SUBTREE`, `$CHILDREN`, globs) that assumed path hierarchy.
- **Mental state:** loss aversion — the DSL was designed, documented, and *nice*. The question
  that broke the spell: *whose data is the path?* Answer (from D1's grilling): it belongs to a
  downstream module; this module just transports it.
- **Decision:** `path` is atomic and opaque; the engine never splits it; hierarchy comes only
  from the tree structure in the payload. The path-scoped DSL was deleted, not deprecated.
- **Evaluation:** matching sub-parts of another module's data couples this module to a shape it
  doesn't own — a classic one-way door (toolkit #1). If their format changes, we'd break without
  any contract being violated. The replacement (positional wildcards over the four segments,
  matched whole) covers every real use case that survived the questioning.
- **Lesson:** sunk design is sunk. The hardest features to delete are the well-crafted ones.

### D3 · Where does STATUS live?

- **Challenge:** content varies per status, statuses save together, relations must never cross
  statuses. Where to put the dimension: separate state slices per status? A `status` field on
  each value? Or in the key?
- **Decision:** STATUS is a segment of the state key (`RESOURCE/STATUS/TYPE/PATH`), so all
  statuses coexist in one flat map and "never cross" is enforced by *wildcard binding*: the
  status position always binds source→target, so a rule literally cannot produce a cross-status
  edge. A rule that *pins* a foreign status is a load error.
- **Evaluation (toolkit #2):** the invariant is structural, not policed. There is no code path
  where a cross-status write is possible-but-checked; the expansion step cannot emit one. That's
  the strongest guarantee tier available, and it also made "all statuses save together" free —
  serialization is just the whole map.
- **Lesson:** when a rule is "X must never happen," first ask if the data model can make X
  *unrepresentable* before writing the validator.

## Part B — Semantics decisions (the relation system itself)

### D4 · The EDIT⇒VIEW invariant: hardcode, backend-send, or FE data?

- **Challenge:** "checking EDIT must check VIEW; unchecking VIEW must uncheck EDIT" — universal,
  applies to every resource, never changes. Three homes: imperative code in the toggle handler;
  the backend sends one rule per field path (N × statuses of payload); or FE ships it as
  declarative default config merged at load.
- **Mental state:** hardcoding is the path of least resistance and the strongest temptation —
  it's four lines in a hook. The evaluation grid that killed it: **visible? overridable?
  payload cost? testable like other rules?** Hardcode fails the first two; backend-send fails
  payload cost and repeats the same fact N times.
- **Decision:** FE default config (`fe.*` rules), merged before backend relations, overridable
  by re-using the exact rule id, with a reserved-namespace warning against accidental shadowing.
- **Evaluation (toolkit #3):** the invariant became inspectable in the compiled config, testable
  through the same pipeline as every other rule, and each resource can opt out declaratively.
  The override needed a collision-vs-intent disambiguator — solved by making the namespace
  reserved so a collision is always *either* intentional (exact id) or warned.
- **Lesson:** "this rule never changes" is exactly when people hardcode — and exactly wrong,
  because a hardcoded rule is the one you can't see when it eventually does change.

### D5 · Which primitive expresses EDIT⇒VIEW: cascades or REQUIRES?

- **Challenge:** two readings of the same business sentence. "EDIT implies VIEW" could be
  *check EDIT pulls VIEW on* (two cascades) or *EDIT is blocked until VIEW is on* (REQUIRES).
  Both enforce the invariant; they produce different UX.
- **Decision:** cascades. The requirement's verbs described state *following* ("checking EDIT
  checks VIEW"), not state *blocking* ("EDIT is disabled until…").
- **Evaluation:** simulate the click. Cascades: user clicks EDIT, both boxes turn on — one
  gesture. REQUIRES: user clicks EDIT, nothing happens, box is grey, user hunts for why. Same
  invariant, radically different friction. The tiebreaker was UX simulation, not logic —
  both options were logically correct.
- **Lesson:** when two primitives can encode the same invariant, the requirement's *verbs*
  and a thirty-second click simulation decide, not expressive power.

### D6 · "Some checkboxes hide the whole FIELD table" — new primitive or new feature?

- **Challenge:** several ACTION checkboxes jointly control the FIELD table: hidden when *all*
  are off, and hiding must clear + freeze every field checkbox. The instinctive move: invent a
  `HIDES` relation primitive.
- **Mental state:** this was the moment of highest design risk in the whole project. Every
  primitive is single-source; this behavior is inherently *group-OR* (any of N controllers).
  Forcing it into the primitive mold would have meant either N rules whose interaction with each
  other is undefined (rule 1 hides, rule 2 un-hides?) or a multi-source primitive that breaks the
  shape of everything else.
- **Decision:** not a relation at all — a first-class `VisibilityBinding` with explicit
  `showWhen: 'anyChecked'` semantics, plus a split of concerns: *state effect* (clear + lock with
  a reserved `@hidden` reason, applied in a single reconciliation pass after the BFS) vs
  *rendering* (a derived selector; hidden table simply isn't mounted).
- **Evaluation:** three checks. (1) Does it compose with relations? Yes — `@hidden` is a lock,
  and locks are already cascade barriers, so hidden fields resist stray cascades with zero new
  machinery. (2) Does it terminate? Yes — the pass writes only terminal values after the fixed
  point, so it provably can't restart propagation. (3) Does reshow behave? Fields come back
  empty *for free*, because cascades are edge-triggered and reshow writes no checked-values.
  When a feature's hard cases all resolve via existing mechanisms, the shape is right.
- **Lesson:** when a requirement doesn't fit your abstraction, the answer is sometimes a *second
  abstraction*, not a stretched first one. The tell was multi-source OR semantics — a shape
  mismatch, not a size mismatch.

### D7 · Twelve primitives when five would compose — vocabulary vs minimal basis

- **Challenge:** `GROUP_ALL` ≡ `CASCADES_BOTH`; `BIDIRECTIONAL` ≡ two `CASCADES_BOTH`;
  `ENABLES_*` ≡ polarity-flipped `DISABLES_*`; `REQUIRES` ≈ N × `DISABLES_ON_UNCHECK`. Why keep
  the redundant ones?
- **Decision:** the primitive set is an **authoring vocabulary, not an instruction set**.
  Inclusion test: does it name a real authoring intent, and would hand-composition create
  half-declaration risk? Redundancy is free (everything compiles to the same adjacency entries);
  a half-declared symmetric pair is a production permissions bug.
- **Evaluation (toolkit #4), member by member:** `BIDIRECTIONAL` exists so symmetry is a property
  of one declaration instead of a discipline across two. `CASCADES_BOTH` kills the
  forgot-the-uncheck-direction bug. `REQUIRES` earns primitive status on three things composition
  can't do: restore *memory*, a single reason id (one tooltip: "requires Review and QA"), and
  authoring in the direction people state requirements. The `ENABLES` pair is pure vocabulary —
  kept because double-negation ("enable = disable-on-uncheck") is a reliable polarity-bug factory,
  and because 1:1 mapping with the requirement's own words makes the parity audit a lookup instead
  of a translation. `GROUP_ALL` is decorative and honestly the weakest member; it survives as a
  zero-cost alias. The rejected alternative — one generic `LOCK_WHILE(condition)` — would have
  moved semantics from greppable type names into an expression-language blob.
- **Lesson:** count the cost of a primitive at the *authoring* side, not the implementing side.
  A compiles-away alias costs nothing; a composition rule costs one production incident per
  author who gets it half right.

## Part B-R — The relation set, member by member

D7 gives the governing principle; this section is the decision record *per primitive* — what
intent it names, whether it could be composed from the others, why it stayed anyway (or why the
honest answer is "vocabulary"), and the usage edge to watch. Two evaluation criteria repeat
throughout and are worth naming once:

- **Half-declaration risk** — would hand-composing this behavior let an author ship half of it
  and not notice? (Half-pairs pass the demo — people test the direction they wrote — and fail in
  production on the other side.)
- **Reason identity** — `disabledBy` entries are rule ids: they are the tooltip text, the
  override keys, and the error anchors. A composed equivalent that produces N reasons where the
  user's mental model has one is *behaviorally* equal but *identity* wrong.

### R1 · `CASCADES_CHECK` / `CASCADES_UNCHECK` — the true atoms

- **Kept because:** irreducible. Every other checked-state behavior decomposes into these two;
  nothing decomposes into less.
- **Proof they can't be merged:** the EDIT⇒VIEW invariant needs exactly *one direction of each*
  (check-EDIT→check-VIEW, uncheck-VIEW→uncheck-EDIT) and would be wrong with either `BOTH`
  direction added. A design whose flagship invariant can't be expressed has the wrong atoms.
- **Watch out:** they are edge-triggered, one-shot. "Why doesn't it re-check the item I
  unchecked?" is not a bug — it's the definition (hazard H12).

### R2 · `CASCADES_BOTH` — redundant by composition, kept against half-pairs

- **Composable?** Yes: `CASCADES_CHECK` + `CASCADES_UNCHECK`, same source, same targets.
- **Kept because:** "targets follow this box" is the single most common authored intent, and the
  composed form requires two rules with two ids. The observed failure mode it prevents: declare
  the check direction, forget the uncheck direction — works in the demo, leaks state in
  production. One declaration, one id, no half-pair.
- **Watch out:** it is still one-directional *driving* — clicking a target does not drive the
  source. Authors wanting symmetry actually want R7.

### R3 · `GROUP_ALL` — the honest decoration

- **Composable?** It *is* `CASCADES_BOTH` — a pure alias, zero behavioral content.
- **Kept because:** "select all" is how the requirement and its authors speak. An alias that
  compiles away costs nothing; a recurring "which cascade means select-all?" conversation costs
  something. This is the weakest member of the set, and the decision log should say so plainly:
  if the set were ever minimized, this goes first and nothing breaks except vocabulary.
- **Watch out:** nothing — it cannot behave differently from `CASCADES_BOTH` by construction
  (asserted by test N4.1 rather than trusted).

### R4 · `MUTUAL_EXCLUSIVE` — irreducible, and deliberately directional

- **Composable?** No. It needs "on check, *uncheck* others" — no cascade negates, and `INVERSE`
  is wrong here: an inverse pair would *check* the others when the winner unchecks, which is
  exactly what a radio-ish group must not do. The empty group is legal (*at most* one, not
  *exactly* one).
- **The real decision** was not whether to include it but whether a single declaration should
  auto-mirror into a symmetric group (the way `BIDIRECTIONAL` does). Decided **no**: the
  asymmetric form has legitimate uses ("checking *Clear All* unchecks the individual selections"
  — you'd never want the mirror), so auto-mirroring would have destroyed a real use case to
  protect a documented one.
- **Cost accepted:** the sharpest authoring edge in the set — a single hub declaration is only
  half a group (checking B doesn't clear A). Mitigated by documentation (§4.11 case 9) and a
  test that *asserts the asymmetry* (N5.4) so nobody "fixes" it into auto-mirroring later.
- **Watch out:** symmetric groups are declared per member. Always.

### R5 · `INVERSE` — the only negation in the system

- **Composable?** No — nothing else can express "B is the opposite of A." It is the sole
  primitive that writes `NOT source`.
- **The surprising property, chosen deliberately:** clicking the *target* does not drive the
  source. That falls out of keeping it source-driven like every other category-A primitive.
  The alternative — making it symmetric by default — would have been a second, *hidden*
  auto-mirror in the system, and one implicit mirror (`BIDIRECTIONAL`) is the budget. Authors
  who want two-way inverse declare it both ways; the pair is stable (A=¬B and B=¬A agree, and
  change-detection stops the ping-pong after one hop).
- **Watch out:** it depends on the single-write-path rule more than any other primitive — a
  foreign writer silently breaks the "always opposite" reading with no error anywhere.

### R6 · `BIDIRECTIONAL` — redundancy as a safety feature

- **Composable?** Fully: two `CASCADES_BOTH` declarations, one per direction.
- **Kept because:** this is the purest case of "redundant on purpose." Auto-mirroring makes the
  symmetry a property of *one declaration* instead of a discipline across two. The compiler
  even warns when someone declares both directions anyway — the warning exists because people
  reflexively do, which is itself evidence the primitive is needed.
- **Evaluation note:** it is the only category-A primitive triggered by its targets as well as
  its source — that indexing asymmetry is the entire implementation cost of the primitive, and
  it's paid once in the engine instead of N times in configs.

### R7 · `REQUIRES` — the composition that *almost* works

- **Composable?** Nearly — and this made it the hardest call in the set. N ×
  `DISABLES_ON_UNCHECK` (one per prerequisite, `forceCheckedValue: false`) yields
  locked-and-cleared-while-any-prereq-is-off. Three things the composition cannot do decided it:
  1. **Memory** — `restoreCheckedOnSatisfy` must remember the pre-lock checked state; no
     disable rule has state to remember with.
  2. **Reason identity** — one lock reason means one honest tooltip ("requires Review and QA");
     the composition gives N unrelated reasons for one logical dependency.
  3. **Authoring direction** — requirements are stated from the dependent's side ("publish
     requires review"). The composition forces authors to invert that into rules attached to
     each prerequisite — precisely the mental transformation that produces wrong configs.
- **Encapsulated complexity:** its adjacency indexing is inverted (triggered by *targets*, not
  source clicks) so that prerequisite order never matters. That inversion exists exactly once,
  in the engine, invisible to authors — the strongest argument that this is a primitive and not
  a pattern.
- **Watch out:** it is the primitive that found both implementation bugs (D13, D14). Dependency
  semantics + locking + memory interact more than anything else in the system; test it against
  locked intermediate states, not just happy paths.

### R8 · `DISABLES_ON_CHECK` / `DISABLES_ON_UNCHECK` — the level-held pair

- **Kept because:** locking is a different *kind* of effect from checking (it writes
  `disabledBy`, not `checked`) and is level-held rather than edge-triggered — it could not be a
  cascade variant without giving cascades two execution models. The ON_CHECK/ON_UNCHECK split is
  just polarity; collapsing them into one type + a boolean was rejected for the same reason as
  the ENABLES merge below: named polarity beats a flag people set wrong.
- **`forceCheckedValue`** rode along as an option rather than a separate primitive because
  "lock it" and "lock it in a known state" are one intent with one reason id — splitting them
  would have created the N-reasons problem R7 avoids.

### R9 · `ENABLES_ON_CHECK` / `ENABLES_ON_UNCHECK` — pure vocabulary, normatively pinned

- **Composable?** Totally: `ENABLES_ON_CHECK` ≡ `DISABLES_ON_UNCHECK`,
  `ENABLES_ON_UNCHECK` ≡ `DISABLES_ON_CHECK` — level-equivalent, differing only in the reason id.
  This pair and R3 are the two members kept purely for language.
- **Kept because:** forcing authors to express "A unlocks B" as an inverted disable is a
  double-negation factory ("enable-on-check = disable-on-uncheck, so I want… which one?").
  Polarity bugs from hand-inverted logic are among the most common config errors there are.
  Secondary reason: the requirement's own vocabulary used both words, so keeping the enum 1:1
  turns the migration parity audit into a lookup instead of a translation.
- **The important discipline:** having decided to keep a redundant pair, the equivalence was
  made **normative** (v5 §4.4 card C) and is asserted by a test that runs twin fixtures through
  identical sequences (N11.4). A tolerated redundancy without a pinned equivalence would drift
  into two subtly different behaviors within a year.
- **Watch out:** teams should pick one dialect per config ("we author DISABLES only" or "ENABLES
  for start-locked flows") — the engine doesn't care, but mixed dialects make configs harder to
  review.

### R10 · `condition` — a gate, deliberately not a primitive

- **The rejected design:** one generic `LOCK_WHILE(condition)` / `SET_WHILE(condition)` pair
  could replace the entire disabled category and more — maximum expressive power, minimum enum.
- **Why rejected:** it moves semantics out of greppable, enumerable type names into an
  expression-language blob. Validation gets weaker (any condition is "valid"), the §4.4b
  contract table becomes unstatable ("what does the engine guarantee? depends what you wrote"),
  and every common case gets *wordier*. Expressive power is not free — it's paid for in
  reviewability.
- **What `condition` is instead:** an orthogonal gate on any named intent, with deliberately
  tiny algebra (`all`/`any`/`not`) and automatic re-fire when its inputs change. The re-fire
  indexing (conditioned rules are also triggered by their condition's ids) is what keeps gated
  rules order-independent — without it, "enable the flag after clicking the source" and "before"
  would give different results, which is the kind of bug users can't even report coherently.
- **Watch out:** a condition consulted mid-chain reads *working state*, not the pre-click
  snapshot (§4.9.5). That's the consistent choice, but it means a condition can be flipped by
  the very cascade it gates.

### The set-level summary

Irreducible core: **R1, R4, R5, R7, R10** (the two directional cascades, exclusivity, negation,
dependency-with-memory, gating). Anti-half-pair insurance: **R2, R6**. Pure vocabulary: **R3,
R9** — kept because their cost is zero at runtime and their absence is paid in authoring bugs
and parity-audit friction. The whole table is the asymmetry from D7 in action: a compiles-away
primitive is free; a hand-composition is a standing invitation to ship half a rule.

### D8 · The ENABLES ambiguity — deciding what my own design text meant

- **Challenge:** during implementation, the v4 text for `ENABLES_ON_*` ("remove this rule's own
  reason on the trigger") underdetermined the behavior: is the reason *added back* when the
  trigger reverses? Is the target locked *initially*? Edge or level?
- **Mental state:** the uncomfortable realization that the ambiguity was mine — the spec author
  and implementer being the same entity doesn't prevent the spec from being ambiguous; it just
  delays the discovery.
- **Decision:** interpret `ENABLES_*` as the level-held, inverse-polarity mirror of `DISABLES_*`
  (hold own reason while inactive, release on trigger) — and then **promote the decision into v5
  as normative**, including the blunt equivalence table (`ENABLES_ON_CHECK` ≡
  `DISABLES_ON_UNCHECK`), with a test asserting the equivalence directly.
- **Evaluation:** the level interpretation was the only one consistent with the settle pass
  (an edge interpretation makes "starts locked" unreachable at load) and with the reason-based
  lock model (symmetry with DISABLES means one mental model for all four types).
- **Lesson (toolkit #8):** an ambiguity you resolve silently in code will be resolved
  *differently* by the next implementer. The full fix is always three parts: decide, make it
  normative, make a test enforce it.

## Part C — Engine mechanics decisions

### D9 · Purity and the single write path — the two load-bearing constraints

- **Challenge:** cascading checkbox logic degenerates by default into scattered `onChange`
  handlers dispatching at each hop — N renders per click, untestable without mounting React,
  and invariants (`INVERSE`, EDIT⇒VIEW) that hold only until someone adds a second writer.
- **Decision:** `resolveToggle(state, event, config) → nextState` is pure; one hook is the sole
  store writer (one read, one dispatch per interaction); the write action isn't exported.
- **Evaluation:** every downstream property was purchased by this one decision — plain-object
  unit tests, property-based testing (you can't fuzz a React component 120×), single-commit
  rendering, and *meaningful* invariant relations. The check applied: "which future capability
  do we lose if this is impure?" The answer (all of the above) made it a blocker-tier constraint.
- **Lesson:** identify the one or two constraints that everything else leans on and defend those
  disproportionately. Here, purity + single-writer are the two; everything else is negotiable.

### D10 · Disabled as `disabledBy: string[]` instead of a boolean

- **Challenge:** multiple rules can lock the same checkbox; with `disabled: boolean`, rule B's
  release clobbers rule A's lock. Classic shared-flag corruption.
- **Decision:** reasons, not flags. Each rule adds/removes only its own id; disabled ⟺ non-empty;
  reserved reasons (`@initial`, `@hidden`) that no rule can remove.
- **Evaluation:** cross-rule clobbering became *structurally impossible* (toolkit #2) rather than
  carefully-avoided. Free byproducts, none of which were goals: "why is this disabled" tooltips
  (the reasons are ids), independent multi-lock release, and later a home for the restore marker
  (D12). When a data-model change makes three unrelated future features fall out for free, the
  model is carving reality at a joint.
- **Lesson:** if two independent actors write one flag, the flag is the bug. Reify *who* holds
  the state, not just the state.

### D11 · Termination and conflicts: change-detection BFS + a total order

- **Challenge:** the primitive set is intentionally circular (`INVERSE` pairs, `BIDIRECTIONAL`,
  the two EDIT⇒VIEW cascades). Naive propagation oscillates forever; and when two rules write
  different values to one leaf in the same pass, "whoever ran last wins" is nondeterminism
  wearing a trench coat.
- **Decision:** (a) a leaf re-enters the queue only if its value *actually changed* — that single
  rule is the termination proof (finite state per leaf + change required ⇒ convergence), with a
  `10 × leafCount` cap as a backstop that throws with a trace; (b) conflicts resolve by a total
  order: priority → BFS depth → declaration order.
- **Evaluation:** the termination argument had to be a *proof sketch*, not a vibe — "cycles
  converge because the second hop writes an already-held value" is checkable by hand on every
  circular primitive. The conflict order had to be *total* (no case falls through to map
  iteration order). The honest wart was documented rather than hidden: rung 3 makes declaration
  order semantics, so the authoring guidance says use explicit `priority` for legitimate
  collisions, and the hazard register flags rung-3 reliance as a review smell.
- **Lesson:** determinism isn't "we tested it and it's stable" — it's "no input reaches
  unspecified behavior." Enumerate the tie-break chain until it's total, then document which
  rung you don't want people relying on.

### D12 · The `@restore` marker — where does REQUIRES keep its memory?

- **Challenge:** `restoreCheckedOnSatisfy` needs to remember "this box was checked before I
  force-cleared it." Obvious home: a new field on `CheckboxValue` (`restoreOnRelease?: boolean`).
- **Decision:** no new field. A paired marker string `@restore:<ruleId>` pushed into
  `disabledBy` alongside the lock reason, stripped together with it, filtered from user-facing
  displays.
- **Evaluation:** the state shape is a public-ish contract (Redux slice, serialization
  boundary, every selector). Growing it for one primitive's bookkeeping taxes everything that
  touches state; a namespaced marker inside an existing string array costs one filter in the
  tooltip helper. Trade accepted: it's less discoverable — mitigated by documenting it in the
  reserved-reasons list, i.e., where you'd look when you saw one in the devtools.
- **Lesson:** before adding a field to a widely-shared type, check whether an existing extensible
  slot can carry the information under a namespace. Schema growth is a tax on every consumer;
  a convention is a tax only on the one feature.

### D13 · **Mistake #1** — the first render was silently wrong (birth of `settleState`)

- **Challenge (self-inflicted):** v4 defined propagation as *event-driven* — rules fire when a
  trigger node changes. Nothing changes at load. So an initially-unsatisfied `REQUIRES` rendered
  its source *unlocked and checked* until the user happened to touch a prerequisite. Same for
  seeded-active `DISABLES` levels and all-off visibility controllers. The design's own invariants
  did not hold on frame one, and no test caught it because every test started from a toggle.
- **How it was caught:** not by a failing test — by *walking the timeline of an invariant*:
  "this lock holds *while* X… so what establishes it at t=0?" Level-held semantics with an
  edge-only mechanism is a contradiction visible from the armchair, once you look.
- **Decision:** `settleState` — at compile time, prime every node through the **same propagation
  core** and iterate to a fixed point; the result *is* the initial state.
- **Evaluation (toolkit #7):** the rejected quick fix was special-case seeding code ("at load,
  also compute REQUIRES locks…") — a second implementation of rule semantics that would drift
  from the first. Reusing the propagation core meant first render is provably governed by the
  identical ordering/barrier/tie-break rules as every click. Bonus discovered later: settle also
  moves "config whose rules can't reach a fixed point" from a user's fifteenth click to a load
  error.
- **Lesson:** for every invariant phrased "X holds while Y," explicitly ask *what establishes X
  at time zero*. Event-driven systems are systematically blind to t=0, and so are their test
  suites, because tests start by causing events.

### D14 · **Mistake #2** — the write-ordering bug (reasons before checked)

- **Challenge:** a failing test: `REQUIRES` with restore — satisfying the prerequisite released
  the lock but the box stayed unchecked. Root cause: within one rule's effect, checked-writes
  were applied before reason-writes; the restore write hit the "skip if disabled" barrier because
  the lock it was paired with hadn't been removed yet. The rule was, in effect, blocked by its
  own lock.
- **Mental state:** the first diagnosis instinct was wrong — it looked like the *marker* logic
  was broken (the new, complicated thing). The actual fault was in the oldest, most boring code:
  the two-line apply loop. Ordering bugs hide in the code too simple to suspect.
- **Decision:** normative ordering — for each fired entry, apply reason-writes, then
  checked-writes. Verified safe for all other primitives (forced writes use owner-bypass, so
  nothing else is sensitive to the order).
- **Evaluation:** three-step response rather than a patch: (1) fix; (2) *promote the ordering to
  the spec* (§4.9.3) because any reimplementation would naturally reintroduce it — the wrong
  order is the intuitive order; (3) keep the regression test and, in the test-case spec, instruct
  the implementer to deliberately invert the ordering once and watch the test fail (toolkit #10).
- **Lesson:** when a bug comes from an *implicit* ordering, the fix isn't code — it's making the
  ordering explicit, normative, and guarded by a test you've proven can fail. Also: bugs
  concentrate where two features interact (locking × restoring), not inside either feature.

## Part D — Process & delivery decisions

### D15 · Two unverifiable assumptions — `TODO(verify)` instead of confidence

- **Challenge:** no access to the real backend. Two guesses were unavoidable: the exact ID
  grammar, and the payload packaging (keyed-by-status vs flat). Both are one-way doors.
- **Decision:** guess *visibly* — pick the most likely reading, mark both in code and design
  with `TODO(verify)` + the concrete verification steps ("confirm against 3–5 real IDs that…"),
  and structure the code so a wrong guess is contained (the loader changes, the engine doesn't).
- **Evolution:** v5 finished the thought — by defining the guessed shape as the module's
  *canonical contract* and pushing all real-world variance into a host-owned adapter, the
  question changed from "is the engine right?" (expensive if no) to "is the adapter mapping
  right?" (one file, fixture-tested). The assumption didn't get *truer*; it got *cheaper to be
  wrong about*.
- **Lesson (toolkit #5):** you can't always eliminate uncertainty, but you can always choose
  where it lands. Move it to the cheapest-to-fix layer and label it so nobody mistakes a guess
  for a fact.

### D16 · Making v5 standalone — contract inversion

- **Challenge:** the sandbox design referenced an outer module (rule-set CRUD page) that the real
  project owns and that couldn't be shared. A design coupled to a context it can't see is wrong
  by default.
- **Decision:** invert the dependency. v5 *publishes* its input contract (ID grammar, config
  shape, Host Contract with MUST/MUST-NOT obligations) and the host adapts to it — instead of
  the design assuming the host's shapes. Fetching, routing, save transport: explicitly host
  territory.
- **Evaluation:** the test applied to every section was "could a stranger implement this with
  no knowledge of the outer module?" Anything that failed became either a contract clause or an
  explicit non-goal. The MUST-NOT list (don't write state directly, don't parse `path`, don't
  persist `disabledBy`) came straight from the hazard register — each one is a hazard phrased
  as an obligation.
- **Lesson:** "independent from X" is not achieved by deleting mentions of X; it's achieved by
  replacing every assumption about X with a published obligation X can be held to.

### D17 · Transfer strategy: tests as the executable spec, plans sized to the reader

- **Challenge:** only documents and tests may cross the security boundary; the implementing
  agent on the other side is less capable and starts cold; the reference implementation cannot
  travel.
- **Decision stack:** (a) tests become the *spec* — pure-core tests are binding (must pass,
  imports aside), React-shell tests carry intent only; (b) the plan is written for the weakest
  reader: explicit precedence when sources disagree, hard gates with stop-and-wait, and a
  "known traps" table that lists each past mistake with the section and the test that catches
  it; (c) a human-readable test-case spec (Given/When/Then with stable IDs) bridges the two, so
  behavior is reviewable by a person *and* implementable by the agent.
- **Evaluation:** the question asked of every plan section was "what does a less-capable agent
  do at its worst moment — when sources disagree or a test fails?" Every answer had to be *in
  the document* (precedence order, stop-and-report rules), because the agent can't come ask.
  Encoding my own two mistakes (D13, D14) as named traps was the highest-leverage single move:
  they are precisely the errors a fresh implementation re-makes.
- **Lesson:** documentation for a weaker executor is a different genre from documentation for a
  peer — it must decide the *conflicts* in advance, not just describe the happy path. And your
  own past bugs are the most valuable content you can ship, because they are empirically the
  attractors in the mistake-space.

### D18 · One spec or two? (the agent/developer split)

- **Challenge:** v5 optimized for normative completeness (~600 lines, contract language). A human
  developer needing "how do I make an exclusive group" will not extract that in five minutes —
  the doc failed its own readability goal for one of its two audiences.
- **Decision:** split by *audience*, not by *content*: v5 stays the single normative spec; a
  short dev guide (mental model, glossary, recipes, FAQ) is explicitly **non-normative** and
  states "if this and v5 disagree, v5 wins."
- **Evaluation:** the rejected option was two full versions of the spec — rejected because dual
  normative documents guarantee drift, and drift in a *rules* document is worse than density.
  The precedence sentence is the load-bearing part: it's what makes the friendly document safe
  to be slightly wrong.
- **Lesson:** never fork truth; fork *presentation*, and write down which one wins.

---

## Closing pattern

Looking across all eighteen: the decisions that aged best were the ones where the question was
reframed from *"what is the best behavior?"* to *"who makes the mistake here, and what does it
cost them?"* — the config author (D4–D7), the next implementer (D8, D13, D14, D17), the host
integrator (D16), or my own future self under uncertainty (D15). Design quality in this project
was mostly *mistake-shaping*: making the wrong thing inexpressible where possible, loud where
not, and cheap where even that failed.
