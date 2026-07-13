// §4.5 — normalize the backend FIELD tree into UI nodes with stable keys and
// precomputed descendant leaf-id lists per column, so selectCategoryState can derive
// aggregate state from a stable reference (design §2, §6) without caller-supplied arrays.

import type { FieldNode, LeafId } from '../types';

export interface UICategoryNode {
  kind: 'category';
  /** Stable, unique-within-status key (index path). Categories have no backend id. */
  key: string;
  name: string;
  children: UITreeNode[];
  /** All descendant VIEW / EDIT leaf ids, for aggregate (tri-state) derivation. */
  viewLeafIds: LeafId[];
  editLeafIds: LeafId[];
}
export interface UILeafNode {
  kind: 'leaf';
  key: string;
  name: string;
  view: LeafId;
  edit: LeafId;
}
export type UITreeNode = UICategoryNode | UILeafNode;

function build(node: FieldNode, keyPrefix: string): UITreeNode {
  if (node.isCategory) {
    const children = node.children.map((child, i) => build(child, `${keyPrefix}.${i}`));
    const viewLeafIds: LeafId[] = [];
    const editLeafIds: LeafId[] = [];
    for (const child of children) {
      if (child.kind === 'category') {
        viewLeafIds.push(...child.viewLeafIds);
        editLeafIds.push(...child.editLeafIds);
      } else {
        viewLeafIds.push(child.view);
        editLeafIds.push(child.edit);
      }
    }
    return { kind: 'category', key: keyPrefix, name: node.name, children, viewLeafIds, editLeafIds };
  }
  return { kind: 'leaf', key: keyPrefix, name: node.name, view: node.view.id, edit: node.edit.id };
}

/** Build the UI tree for one status. */
export function buildFieldTree(status: string, nodes: FieldNode[]): UITreeNode[] {
  return nodes.map((node, i) => build(node, `${status}#${i}`));
}

export interface CategoryDescendants {
  viewLeafIds: LeafId[];
  editLeafIds: LeafId[];
}

/** Map every category key → its descendant leaf ids per column (for selectCategoryState). */
export function indexCategories(tree: UITreeNode[]): Map<string, CategoryDescendants> {
  const index = new Map<string, CategoryDescendants>();
  const walk = (node: UITreeNode): void => {
    if (node.kind === 'category') {
      index.set(node.key, { viewLeafIds: node.viewLeafIds, editLeafIds: node.editLeafIds });
      for (const child of node.children) walk(child);
    }
  };
  for (const node of tree) walk(node);
  return index;
}
