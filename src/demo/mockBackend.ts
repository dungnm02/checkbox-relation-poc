// Demo backend payloads (stand-in for the API keyed by Resource Type + Name). Exercises:
// per-status content, the FE default EDIT⇒VIEW invariant, region visibility (enable_fields),
// and a backend-authored MUTUAL_EXCLUSIVE relation.

import type { BackendConfig, FieldNode, StatusContent } from '../core/types';

function aiFeatureStatus(status: string): StatusContent {
  const R = 'AI_FEATURE';
  const leaf = (name: string, path: string, viewChecked = false, editChecked = false): FieldNode => ({
    isCategory: false,
    name,
    view: { id: `${R}/${status}/VIEW/${path}`, isChecked: viewChecked, isDisabled: false },
    edit: { id: `${R}/${status}/EDIT/${path}`, isChecked: editChecked, isDisabled: false },
  });
  return {
    status,
    action: [
      { id: `${R}/${status}/ACTION/enable_fields`, isChecked: true, isDisabled: false },
      { id: `${R}/${status}/ACTION/export`, isChecked: false, isDisabled: false },
      { id: `${R}/${status}/ACTION/bulk_delete`, isChecked: false, isDisabled: false },
    ],
    field: [
      {
        isCategory: true,
        name: 'Properties',
        children: [leaf('Name', 'properties.name'), leaf('Owner', 'properties.owner', true), leaf('Created', 'properties.created')],
      },
      {
        isCategory: true,
        name: 'Security',
        children: [leaf('Roles', 'security.roles'), leaf('Audit Log', 'security.audit')],
      },
      leaf('Description', 'description'),
    ],
  };
}

export const aiFeatureBackend: BackendConfig = {
  resourceType: 'FEATURE',
  resourceName: 'AI_FEATURE',
  statuses: ['IN_PROGRESS', 'IN_REVIEW'],
  content: [aiFeatureStatus('IN_PROGRESS'), aiFeatureStatus('IN_REVIEW')],
  visibility: [
    {
      region: 'FIELD',
      controlledBy: ['AI_FEATURE/*/ACTION/enable_fields'],
      showWhen: 'anyChecked',
      whenHidden: 'clearAndLock',
    },
  ],
  relations: [
    {
      id: 'be.export-xor-delete',
      sourceId: 'AI_FEATURE/*/ACTION/export',
      relationships: [
        { id: 'be.export-xor-delete', type: 'MUTUAL_EXCLUSIVE', targets: ['AI_FEATURE/*/ACTION/bulk_delete'] },
      ],
    },
  ],
};

function reportStatus(): StatusContent {
  const R = 'REPORT';
  const S = 'DEFAULT';
  const leaf = (name: string, path: string): FieldNode => ({
    isCategory: false,
    name,
    view: { id: `${R}/${S}/VIEW/${path}`, isChecked: false, isDisabled: false },
    edit: { id: `${R}/${S}/EDIT/${path}`, isChecked: false, isDisabled: false },
  });
  return {
    status: S,
    action: [{ id: `${R}/${S}/ACTION/download`, isChecked: false, isDisabled: false }],
    field: [
      { isCategory: true, name: 'Summary', children: [leaf('Title', 'summary.title'), leaf('Totals', 'summary.totals')] },
    ],
  };
}

/** A resource with no status selector (single implicit status). */
export const reportBackend: BackendConfig = {
  resourceType: 'DOCUMENT',
  resourceName: 'REPORT',
  statuses: [],
  content: [reportStatus()],
};

// ---------------------------------------------------------------------------------------
// RELATION_TYPES — one example per primitive (§4.4), organized by STATUS so each stays an
// isolated, self-contained scenario. Uses ACTION checkboxes only (no fields) for clarity;
// the EDIT⇒VIEW field-based invariant is already demoed live in AI_FEATURE above.
// ---------------------------------------------------------------------------------------

const RT = 'RELATION_TYPES';
const rtId = (status: string, path: string) => `${RT}/${status}/ACTION/${path}`;

interface DemoAction {
  path: string;
  isChecked?: boolean;
  isDisabled?: boolean;
}

function demoStatus(status: string, actions: DemoAction[]): StatusContent {
  return {
    status,
    action: actions.map((a) => ({
      id: rtId(status, a.path),
      isChecked: a.isChecked ?? false,
      isDisabled: a.isDisabled ?? false,
    })),
    field: [],
  };
}

const RELATION_STATUSES = [
  'CASCADES_CHECK',
  'CASCADES_UNCHECK',
  'CASCADES_BOTH',
  'GROUP_ALL',
  'MUTUAL_EXCLUSIVE',
  'INVERSE',
  'BIDIRECTIONAL',
  'REQUIRES',
  'DISABLES_ON_CHECK',
  'DISABLES_ON_UNCHECK',
  'ENABLES_ON_CHECK',
  'ENABLES_ON_UNCHECK',
  'CONDITION',
] as const;

const relationTypesContent: StatusContent[] = [
  // Checking "Select All" checks both items; unchecking it does NOT uncheck them (one-directional, check-only).
  demoStatus('CASCADES_CHECK', [{ path: 'select_all' }, { path: 'item_a' }, { path: 'item_b' }]),

  // Unchecking "Clear All" unchecks both items; checking it does NOT check them (one-directional, uncheck-only).
  demoStatus('CASCADES_UNCHECK', [
    { path: 'clear_all', isChecked: true },
    { path: 'item_a', isChecked: true },
    { path: 'item_b', isChecked: true },
  ]),

  // Toggling "Group All" either way sets both members to match it. Members don't drive the group back.
  demoStatus('CASCADES_BOTH', [{ path: 'group_all' }, { path: 'member_a' }, { path: 'member_b' }]),

  // GROUP_ALL is a pure readability alias of CASCADES_BOTH — identical compiled behavior, "select-all header" framing.
  demoStatus('GROUP_ALL', [{ path: 'toggle_all' }, { path: 'row_1' }, { path: 'row_2' }]),

  // Checking "Option A" unchecks B and C — at-most-one, not exactly-one (checking nothing is still legal).
  demoStatus('MUTUAL_EXCLUSIVE', [{ path: 'option_a' }, { path: 'option_b', isChecked: true }, { path: 'option_c' }]),

  // "Light Mode Active" always holds the opposite boolean of "Enable Dark Mode".
  demoStatus('INVERSE', [{ path: 'dark_mode' }, { path: 'light_mode_active', isChecked: true }]),

  // Toggling either switch flips both — true symmetric mirror (declaring A→B auto-registers B→A).
  demoStatus('BIDIRECTIONAL', [{ path: 'switch_a' }, { path: 'switch_b' }]),

  // Dependency direction is inverted: "Publish" (starts checked) requires "Reviewed" (starts unchecked). At load,
  // Publish is force-unchecked + locked. Checking Reviewed releases the lock AND restores Publish to checked
  // (restoreCheckedOnSatisfy) — demonstrates order-independence and the restore option.
  demoStatus('REQUIRES', [{ path: 'reviewed' }, { path: 'publish', isChecked: true }]),

  // Checking "Read-Only Mode" locks "Edit Content" and forces it unchecked (forceCheckedValue).
  demoStatus('DISABLES_ON_CHECK', [{ path: 'read_only' }, { path: 'edit_content', isChecked: true }]),

  // While "Account Active" is UNCHECKED, "Send Notifications" is locked. Starts active → unlocked by default.
  demoStatus('DISABLES_ON_UNCHECK', [{ path: 'account_active', isChecked: true }, { path: 'send_notifications' }]),

  // "Restricted Area" starts LOCKED (unlock_access starts unchecked). Checking "Unlock Access" releases it —
  // this rule owns and can only release its own lock.
  demoStatus('ENABLES_ON_CHECK', [{ path: 'unlock_access' }, { path: 'restricted_area' }]),

  // Mirror of the above: "User Actions" starts LOCKED because "Maintenance Mode" starts checked. Unchecking
  // Maintenance Mode releases it.
  demoStatus('ENABLES_ON_UNCHECK', [{ path: 'maintenance_mode', isChecked: true }, { path: 'user_actions' }]),

  // Universal `condition` field: checking "Send Report" only cascades to "Include Charts" while "Reports
  // Enabled" is checked. Re-evaluated on the condition's own input — checking Send Report first (no-op while
  // Reports Enabled is off), then checking Reports Enabled re-fires the rule against Send Report's current state.
  demoStatus('CONDITION', [{ path: 'reports_enabled' }, { path: 'send_report' }, { path: 'include_charts' }]),
];

const relationTypesRelations: BackendConfig['relations'] = [
  {
    id: 'ex.cascades-check',
    sourceId: rtId('CASCADES_CHECK', 'select_all'),
    relationships: [
      {
        id: 'ex.cascades-check',
        type: 'CASCADES_CHECK',
        targets: [rtId('CASCADES_CHECK', 'item_a'), rtId('CASCADES_CHECK', 'item_b')],
      },
    ],
  },
  {
    id: 'ex.cascades-uncheck',
    sourceId: rtId('CASCADES_UNCHECK', 'clear_all'),
    relationships: [
      {
        id: 'ex.cascades-uncheck',
        type: 'CASCADES_UNCHECK',
        targets: [rtId('CASCADES_UNCHECK', 'item_a'), rtId('CASCADES_UNCHECK', 'item_b')],
      },
    ],
  },
  {
    id: 'ex.cascades-both',
    sourceId: rtId('CASCADES_BOTH', 'group_all'),
    relationships: [
      {
        id: 'ex.cascades-both',
        type: 'CASCADES_BOTH',
        targets: [rtId('CASCADES_BOTH', 'member_a'), rtId('CASCADES_BOTH', 'member_b')],
      },
    ],
  },
  {
    id: 'ex.group-all',
    sourceId: rtId('GROUP_ALL', 'toggle_all'),
    relationships: [
      { id: 'ex.group-all', type: 'GROUP_ALL', targets: [rtId('GROUP_ALL', 'row_1'), rtId('GROUP_ALL', 'row_2')] },
    ],
  },
  {
    id: 'ex.mutual-exclusive',
    sourceId: rtId('MUTUAL_EXCLUSIVE', 'option_a'),
    relationships: [
      {
        id: 'ex.mutual-exclusive',
        type: 'MUTUAL_EXCLUSIVE',
        targets: [rtId('MUTUAL_EXCLUSIVE', 'option_b'), rtId('MUTUAL_EXCLUSIVE', 'option_c')],
      },
    ],
  },
  {
    id: 'ex.inverse',
    sourceId: rtId('INVERSE', 'dark_mode'),
    relationships: [{ id: 'ex.inverse', type: 'INVERSE', targets: [rtId('INVERSE', 'light_mode_active')] }],
  },
  {
    id: 'ex.bidirectional',
    sourceId: rtId('BIDIRECTIONAL', 'switch_a'),
    relationships: [
      { id: 'ex.bidirectional', type: 'BIDIRECTIONAL', targets: [rtId('BIDIRECTIONAL', 'switch_b')] },
    ],
  },
  {
    id: 'ex.requires',
    sourceId: rtId('REQUIRES', 'publish'),
    relationships: [
      {
        id: 'ex.requires',
        type: 'REQUIRES',
        targets: [rtId('REQUIRES', 'reviewed')],
        restoreCheckedOnSatisfy: true,
      },
    ],
  },
  {
    id: 'ex.disables-on-check',
    sourceId: rtId('DISABLES_ON_CHECK', 'read_only'),
    relationships: [
      {
        id: 'ex.disables-on-check',
        type: 'DISABLES_ON_CHECK',
        targets: [rtId('DISABLES_ON_CHECK', 'edit_content')],
        forceCheckedValue: false,
      },
    ],
  },
  {
    id: 'ex.disables-on-uncheck',
    sourceId: rtId('DISABLES_ON_UNCHECK', 'account_active'),
    relationships: [
      {
        id: 'ex.disables-on-uncheck',
        type: 'DISABLES_ON_UNCHECK',
        targets: [rtId('DISABLES_ON_UNCHECK', 'send_notifications')],
      },
    ],
  },
  {
    id: 'ex.enables-on-check',
    sourceId: rtId('ENABLES_ON_CHECK', 'unlock_access'),
    relationships: [
      {
        id: 'ex.enables-on-check',
        type: 'ENABLES_ON_CHECK',
        targets: [rtId('ENABLES_ON_CHECK', 'restricted_area')],
      },
    ],
  },
  {
    id: 'ex.enables-on-uncheck',
    sourceId: rtId('ENABLES_ON_UNCHECK', 'maintenance_mode'),
    relationships: [
      {
        id: 'ex.enables-on-uncheck',
        type: 'ENABLES_ON_UNCHECK',
        targets: [rtId('ENABLES_ON_UNCHECK', 'user_actions')],
      },
    ],
  },
  {
    id: 'ex.condition',
    sourceId: rtId('CONDITION', 'send_report'),
    relationships: [
      {
        id: 'ex.condition',
        type: 'CASCADES_CHECK',
        targets: [rtId('CONDITION', 'include_charts')],
        condition: { all: [rtId('CONDITION', 'reports_enabled')] },
      },
    ],
  },
];

/** One status tab per relation primitive — flip through the STATUS selector to try each. */
export const relationTypesBackend: BackendConfig = {
  resourceType: 'DEMO',
  resourceName: RT,
  statuses: [...RELATION_STATUSES],
  content: relationTypesContent,
  relations: relationTypesRelations,
};

// ---------------------------------------------------------------------------------------
// STRESS_TEST — a large, deliberately over-connected resource for stress-testing the POC:
// deep chains, wide groups, multi-level locks, and a big nested field tree, so perf and
// convergence can be exercised well past the ~140-node case in the performance guide.
// Tune the constants below to scale it further.
// ---------------------------------------------------------------------------------------

const ST = 'STRESS_TEST';
const STRESS_STATUSES = ['DRAFT', 'REVIEW', 'PUBLISHED'] as const;

const CHAIN_LENGTH = 10; // cascade chain: chain_1 → chain_2 → … → chain_10
const EXCL_GROUP_SIZE = 8; // mutual-exclusive group, per-member declarations (dev-guide recipe)
const REQUIRES_CHAIN_LENGTH = 5; // stage_2 requires stage_1, stage_3 requires stage_2, …
const MIRROR_CHAIN_LENGTH = 4; // bidirectional mirror chain: mirror_1 <-> mirror_2 <-> … <-> mirror_4
const BULK_GROUP_SIZE = 6; // GROUP_ALL select-all-header target count
const ADV_OPT_COUNT = 5; // condition-gated cascade targets
const FIELD_CATEGORIES = 4;
const FIELD_SUBCATEGORIES = 3;
const FIELD_LEAVES_PER_SUB = 6; // 4 * 3 * 6 = 72 leaves = 144 VIEW/EDIT checkboxes

const stId = (status: string, path: string) => `${ST}/${status}/ACTION/${path}`;
/** Author once with a status wildcard — expandRules fans this out per status (dev-guide recipe);
 * relations never cross statuses because STATUS always binds to the source's own status (§4.3). */
const stWild = (path: string) => `${ST}/*/ACTION/${path}`;

function stressActions(status: string): { id: string; isChecked: boolean; isDisabled: boolean }[] {
  const a = (path: string, isChecked = false) => ({ id: stId(status, path), isChecked, isDisabled: false });
  const out = [
    ...Array.from({ length: CHAIN_LENGTH }, (_, i) => a(`chain_${i + 1}`)),
    ...Array.from({ length: EXCL_GROUP_SIZE }, (_, i) => a(`excl_${i + 1}`, i === 0)), // excl_1 starts selected
    a('stage_1'),
    ...Array.from({ length: REQUIRES_CHAIN_LENGTH - 1 }, (_, i) => a(`stage_${i + 2}`, true)), // start checked → settle locks them
    ...Array.from({ length: MIRROR_CHAIN_LENGTH }, (_, i) => a(`mirror_${i + 1}`)),
    a('maintenance_mode', true), // starts checked → ops_1..4 start locked+unchecked
    ...Array.from({ length: 4 }, (_, i) => a(`ops_${i + 1}`)),
    a('ops_1_sub'),
    a('power_user_mode'),
    a('beta_features'),
    a('advanced_export'),
    ...Array.from({ length: ADV_OPT_COUNT }, (_, i) => a(`adv_opt_${i + 1}`)),
    a('safe_mode', true),
    a('danger_action'),
    a('danger_child_1'),
    a('danger_child_2'),
    a('theme_dark'),
    a('theme_light_flag', true), // opposite of theme_dark, consistent with INVERSE
    a('bulk_select_all'),
    ...Array.from({ length: BULK_GROUP_SIZE }, (_, i) => a(`bulk_${i + 1}`)),
    a('enable_all_fields', true), // field tree visible by default
    a('enable_advanced_fields'),
  ];
  return out;
}

function stressFieldTree(status: string): FieldNode[] {
  const leaf = (name: string, path: string): FieldNode => ({
    isCategory: false,
    name,
    view: { id: `${ST}/${status}/VIEW/${path}`, isChecked: false, isDisabled: false },
    edit: { id: `${ST}/${status}/EDIT/${path}`, isChecked: false, isDisabled: false },
  });
  return Array.from({ length: FIELD_CATEGORIES }, (_, c) => ({
    isCategory: true as const,
    name: `Category ${c + 1}`,
    children: Array.from({ length: FIELD_SUBCATEGORIES }, (_, sub) => ({
      isCategory: true as const,
      name: `Category ${c + 1} / Sub ${sub + 1}`,
      children: Array.from({ length: FIELD_LEAVES_PER_SUB }, (_, l) =>
        leaf(`Field ${c + 1}.${sub + 1}.${l + 1}`, `cat${c + 1}.sub${sub + 1}.field${l + 1}`),
      ),
    })),
  }));
}

function stressStatusContent(status: string): StatusContent {
  return { status, action: stressActions(status), field: stressFieldTree(status) };
}

/** The two condition-gated relations: condition ids are concrete `LeafId`s (never expanded like
 * a target expression, §4.4), so — unlike every other stress relation — these must be authored
 * once per status rather than with a status wildcard. */
function stressConditionRelations(status: string): NonNullable<BackendConfig['relations']> {
  return [
    {
      id: `adv.export.${status}`,
      sourceId: stId(status, 'advanced_export'),
      relationships: [
        {
          id: `adv.export.${status}`,
          type: 'CASCADES_CHECK',
          targets: Array.from({ length: ADV_OPT_COUNT }, (_, i) => stId(status, `adv_opt_${i + 1}`)),
          condition: { all: [stId(status, 'power_user_mode'), stId(status, 'beta_features')] },
        },
      ],
    },
    {
      id: `danger.gate.${status}`,
      sourceId: stId(status, 'danger_action'),
      relationships: [
        {
          id: `danger.gate.${status}`,
          type: 'CASCADES_CHECK',
          targets: [stId(status, 'danger_child_1'), stId(status, 'danger_child_2')],
          condition: { not: stId(status, 'safe_mode') }, // only while NOT in safe mode
        },
      ],
    },
  ];
}

const stressWildcardRelations: NonNullable<BackendConfig['relations']> = [
  // Deep cascade chain — one hop per rule; the BFS walks all CHAIN_LENGTH-1 hops in one click.
  ...Array.from({ length: CHAIN_LENGTH - 1 }, (_, i) => ({
    id: `chain.link.${i + 1}`,
    sourceId: stWild(`chain_${i + 1}`),
    relationships: [
      {
        id: `chain.link.${i + 1}`,
        type: 'CASCADES_CHECK' as const,
        targets: [stWild(`chain_${i + 2}`)],
      },
    ],
  })),
  // Wide mutual-exclusive group — per-member declarations (dev-guide: a single A→[B,C] rule
  // doesn't clear A when B is checked, so every member needs its own rule).
  ...Array.from({ length: EXCL_GROUP_SIZE }, (_, i) => ({
    id: `excl.member.${i + 1}`,
    sourceId: stWild(`excl_${i + 1}`),
    relationships: [
      {
        id: `excl.member.${i + 1}`,
        type: 'MUTUAL_EXCLUSIVE' as const,
        targets: Array.from({ length: EXCL_GROUP_SIZE }, (_, j) => j)
          .filter((j) => j !== i)
          .map((j) => stWild(`excl_${j + 1}`)),
      },
    ],
  })),
  // Multi-level REQUIRES chain — checking stage_1 must release+restore stage_2..N in one click.
  ...Array.from({ length: REQUIRES_CHAIN_LENGTH - 1 }, (_, i) => ({
    id: `stage.requires.${i + 2}`,
    sourceId: stWild(`stage_${i + 2}`),
    relationships: [
      {
        id: `stage.requires.${i + 2}`,
        type: 'REQUIRES' as const,
        targets: [stWild(`stage_${i + 1}`)],
        restoreCheckedOnSatisfy: true,
      },
    ],
  })),
  // Bidirectional mirror chain — toggling any member ripples through every link.
  ...Array.from({ length: MIRROR_CHAIN_LENGTH - 1 }, (_, i) => ({
    id: `mirror.link.${i + 1}`,
    sourceId: stWild(`mirror_${i + 1}`),
    relationships: [
      { id: `mirror.link.${i + 1}`, type: 'BIDIRECTIONAL' as const, targets: [stWild(`mirror_${i + 2}`)] },
    ],
  })),
  // Two-tier lock mesh: maintenance_mode locks ops_1..4; ops_1, once actually checked, locks a
  // nested leaf of its own — a barrier stacked behind another barrier.
  {
    id: 'maint.lock',
    sourceId: stWild('maintenance_mode'),
    relationships: [
      {
        id: 'maint.lock',
        type: 'DISABLES_ON_CHECK',
        targets: [stWild('ops_1'), stWild('ops_2'), stWild('ops_3'), stWild('ops_4')],
        forceCheckedValue: false,
      },
    ],
  },
  {
    id: 'ops1.lock.sub',
    sourceId: stWild('ops_1'),
    relationships: [
      {
        id: 'ops1.lock.sub',
        type: 'DISABLES_ON_CHECK',
        targets: [stWild('ops_1_sub')],
        forceCheckedValue: false,
      },
    ],
  },
  {
    id: 'theme.inverse',
    sourceId: stWild('theme_dark'),
    relationships: [{ id: 'theme.inverse', type: 'INVERSE', targets: [stWild('theme_light_flag')] }],
  },
  {
    id: 'bulk.group',
    sourceId: stWild('bulk_select_all'),
    relationships: [
      {
        id: 'bulk.group',
        type: 'GROUP_ALL',
        targets: Array.from({ length: BULK_GROUP_SIZE }, (_, i) => stWild(`bulk_${i + 1}`)),
      },
    ],
  },
];

export const stressTestBackend: BackendConfig = {
  resourceType: 'STRESS',
  resourceName: ST,
  statuses: [...STRESS_STATUSES],
  content: STRESS_STATUSES.map(stressStatusContent),
  relations: [...stressWildcardRelations, ...STRESS_STATUSES.flatMap(stressConditionRelations)],
  visibility: [
    {
      region: 'FIELD',
      controlledBy: [stWild('enable_all_fields'), stWild('enable_advanced_fields')],
      showWhen: 'anyChecked',
      whenHidden: 'clearAndLock',
    },
  ],
};

export const demoResources: { key: string; label: string; backend: BackendConfig }[] = [
  { key: 'ai', label: 'FEATURE · AI_FEATURE', backend: aiFeatureBackend },
  { key: 'report', label: 'DOCUMENT · REPORT', backend: reportBackend },
  { key: 'relations', label: 'DEMO · RELATION_TYPES (all 12 primitives)', backend: relationTypesBackend },
  { key: 'stress', label: 'STRESS · STRESS_TEST (heavy, ~600 nodes)', backend: stressTestBackend },
];
