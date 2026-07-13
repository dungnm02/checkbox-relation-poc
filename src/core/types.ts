// Shared domain types (design §4.8). Kept in one module to avoid circular imports
// between config / expressions / engine.

import type { ColumnType, LeafId } from './grammar/parseId';

export type { ColumnType, LeafId };

// ---- Target expressions (§4.3) ----
export type ColumnAlias = '$ACTION' | '$VIEW' | '$EDIT';
/** A concrete id, a positional pattern with `*`, a column alias, or `$SELECTOR(name)`. */
export type TargetExpression = string;
export type TargetRef = LeafId | TargetExpression;

// ---- Conditions (§4.4) ----
export type Condition =
  | string // shorthand: { all: [id] }
  | { all: LeafId[] }
  | { any: LeafId[] }
  | { not: Condition };

// ---- Relations (§4.4) ----
export type CascadeType = 'CASCADES_CHECK' | 'CASCADES_UNCHECK' | 'CASCADES_BOTH' | 'GROUP_ALL';
export type SymmetryType = 'MUTUAL_EXCLUSIVE' | 'INVERSE' | 'BIDIRECTIONAL';
export type DisableType =
  | 'DISABLES_ON_CHECK'
  | 'DISABLES_ON_UNCHECK'
  | 'ENABLES_ON_CHECK'
  | 'ENABLES_ON_UNCHECK';
export type RelationType = CascadeType | SymmetryType | 'REQUIRES' | DisableType;

export interface RelationBase {
  id: string;
  targets: TargetRef[];
  condition?: Condition;
  priority?: number;
}

export type RelationDefinition =
  | (RelationBase & { type: CascadeType | SymmetryType })
  | (RelationBase & { type: 'REQUIRES'; restoreCheckedOnSatisfy?: boolean })
  | (RelationBase & { type: DisableType; forceCheckedValue?: boolean });

export interface RelationRule {
  /** Rule-level id, used for FE-default merge/override (§4.4a). */
  id?: string;
  sourceId: TargetRef;
  relationships: RelationDefinition[];
}

// ---- Visibility (§4.6) ----
export interface VisibilityBinding {
  region: 'FIELD';
  controlledBy: TargetRef[];
  showWhen: 'anyChecked';
  whenHidden: 'clearAndLock';
}

// ---- Backend config (§4.2) ----
export interface LeafConfig {
  id: LeafId;
  isChecked: boolean;
  isDisabled: boolean;
}
export interface FieldCategoryNode {
  isCategory: true;
  name: string;
  children: FieldNode[];
}
export interface FieldLeafNode {
  isCategory: false;
  name: string;
  view: LeafConfig;
  edit: LeafConfig;
}
export type FieldNode = FieldCategoryNode | FieldLeafNode;

export interface StatusContent {
  status: string;
  action: LeafConfig[];
  field: FieldNode[];
}
export interface NamedSelector {
  name: string;
  expression: TargetExpression;
}
export interface BackendConfig {
  resourceType: string;
  resourceName: string;
  statuses: string[];
  content: StatusContent[];
  relations?: RelationRule[];
  visibility?: VisibilityBinding[];
  selectors?: NamedSelector[];
}

// ---- Runtime state (§4.7) ----
export const INITIAL_REASON = '@initial';
export const HIDDEN_REASON = '@hidden';

export interface CheckboxValue {
  checked: boolean;
  disabledBy: string[];
}
export type CheckboxState = Record<LeafId, CheckboxValue>;
