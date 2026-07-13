// §4.2 — collect every checkbox from a backend config and seed initial runtime state.

import { ConfigError } from '../errors';
import { parseId, type ColumnType, type ParsedId } from '../grammar/parseId';
import {
  INITIAL_REASON,
  type CheckboxState,
  type FieldNode,
  type LeafConfig,
  type StatusContent,
} from '../types';

export interface CollectedLeaf {
  config: LeafConfig;
  parsed: ParsedId;
  /** Which slot in the config this leaf came from — for placement validation. */
  slot: ColumnType;
}

function pushLeaf(
  out: CollectedLeaf[],
  seen: Set<string>,
  config: LeafConfig,
  slot: ColumnType,
  statusOfContent: string,
): void {
  const parsed = parseId(config.id); // throws ConfigError-equivalent via IdParseError
  if (parsed.type !== slot) {
    throw new ConfigError(
      `id "${config.id}" sits in the ${slot} slot but its type segment is ${parsed.type}`,
    );
  }
  if (parsed.status !== statusOfContent) {
    throw new ConfigError(
      `id "${config.id}" has status "${parsed.status}" but appears under status "${statusOfContent}"`,
    );
  }
  if (seen.has(config.id)) {
    throw new ConfigError(`duplicate checkbox id "${config.id}"`);
  }
  seen.add(config.id);
  out.push({ config, parsed, slot });
}

function walkField(
  node: FieldNode,
  out: CollectedLeaf[],
  seen: Set<string>,
  status: string,
): void {
  if (node.isCategory) {
    for (const child of node.children) walkField(child, out, seen, status);
  } else {
    pushLeaf(out, seen, node.view, 'VIEW', status);
    pushLeaf(out, seen, node.edit, 'EDIT', status);
  }
}

/** Every concrete checkbox across all statuses, with its parsed id and originating slot. */
export function collectLeaves(content: StatusContent[]): CollectedLeaf[] {
  const out: CollectedLeaf[] = [];
  const seen = new Set<string>();
  for (const sc of content) {
    for (const action of sc.action) pushLeaf(out, seen, action, 'ACTION', sc.status);
    for (const node of sc.field) walkField(node, out, seen, sc.status);
  }
  return out;
}

/**
 * Seed the runtime slice from backend defaults (§4.2):
 *   isChecked  → checked
 *   isDisabled → disabledBy: ["@initial"]   (a backend lock no rule can release, §4.7)
 * Categories contribute no state (§4.5).
 */
export function seedInitialState(content: StatusContent[]): CheckboxState {
  const state: CheckboxState = {};
  for (const { config } of collectLeaves(content)) {
    state[config.id] = {
      checked: config.isChecked,
      disabledBy: config.isDisabled ? [INITIAL_REASON] : [],
    };
  }
  return state;
}
