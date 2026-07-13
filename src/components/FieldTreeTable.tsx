// §4.5 — the hierarchical FIELD table: one row-tree (name column) with VIEW and EDIT columns.
// Category rows render aggregate (tri-state) cells derived by selector; leaf rows render the
// two field checkboxes. Expand/collapse is local component state.

import { useMemo, useState } from 'react';
import { useAppSelector } from '../store/hooks';
import { selectCategoryState, selectCheckboxById } from '../store/selectors';
import type { UICategoryNode, UILeafNode, UITreeNode } from '../core/config/tree';
import type { LeafId } from '../core/types';
import { CheckboxCell } from './CheckboxCell';
import { cellLabel, reasonLabel } from './labels';

type Column = 'VIEW' | 'EDIT';

interface Handlers {
  onToggleLeaf: (id: LeafId) => void;
  onToggleCategory: (categoryKey: string, column: Column) => void;
}

function LeafCell({ id, onToggle }: { id: LeafId; onToggle: (id: LeafId) => void }) {
  const value = useAppSelector(selectCheckboxById(id));
  if (!value) return <td className="cb-col" />;
  return (
    <td className="cb-col">
      <CheckboxCell
        checked={value.checked}
        disabled={value.disabledBy.length > 0}
        disabledReasons={value.disabledBy.map(reasonLabel)}
        onToggle={() => onToggle(id)}
        label={cellLabel(id)}
      />
    </td>
  );
}

function TreeLeaf({ node, depth, handlers }: { node: UILeafNode; depth: number; handlers: Handlers }) {
  return (
    <tr role="row">
      <td className="name-col" style={{ paddingLeft: 12 + depth * 20 }} role="gridcell">
        {node.name}
      </td>
      <LeafCell id={node.view} onToggle={handlers.onToggleLeaf} />
      <LeafCell id={node.edit} onToggle={handlers.onToggleLeaf} />
    </tr>
  );
}

function AggregateCell({
  node,
  column,
  onToggleCategory,
}: {
  node: UICategoryNode;
  column: Column;
  onToggleCategory: (categoryKey: string, column: Column) => void;
}) {
  const descendants = useMemo(
    () => ({ viewLeafIds: node.viewLeafIds, editLeafIds: node.editLeafIds }),
    [node.viewLeafIds, node.editLeafIds],
  );
  const selector = useMemo(() => selectCategoryState(descendants), [descendants]);
  const agg = useAppSelector(selector)[column === 'VIEW' ? 'view' : 'edit'];
  return (
    <td className="cb-col">
      <CheckboxCell
        checked={agg.checked}
        indeterminate={agg.indeterminate}
        disabled={agg.disabled}
        onToggle={() => onToggleCategory(node.key, column)}
        label={`${node.name} ${column} (all)`}
      />
    </td>
  );
}

function TreeCategory({ node, depth, handlers }: { node: UICategoryNode; depth: number; handlers: Handlers }) {
  const [expanded, setExpanded] = useState(true);
  return (
    <>
      <tr role="row" className="category-row">
        <td className="name-col" style={{ paddingLeft: 12 + depth * 20 }} role="gridcell">
          <button
            type="button"
            className="disclosure"
            aria-expanded={expanded}
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? '▾' : '▸'} {node.name}
          </button>
        </td>
        <AggregateCell node={node} column="VIEW" onToggleCategory={handlers.onToggleCategory} />
        <AggregateCell node={node} column="EDIT" onToggleCategory={handlers.onToggleCategory} />
      </tr>
      {expanded && node.children.map((child) => <TreeRow key={child.key} node={child} depth={depth + 1} handlers={handlers} />)}
    </>
  );
}

function TreeRow({ node, depth, handlers }: { node: UITreeNode; depth: number; handlers: Handlers }) {
  return node.kind === 'category' ? (
    <TreeCategory node={node} depth={depth} handlers={handlers} />
  ) : (
    <TreeLeaf node={node} depth={depth} handlers={handlers} />
  );
}

export interface FieldTreeTableProps {
  tree: UITreeNode[];
  onToggleLeaf: (id: LeafId) => void;
  onToggleCategory: (categoryKey: string, column: Column) => void;
}

export function FieldTreeTable({ tree, onToggleLeaf, onToggleCategory }: FieldTreeTableProps) {
  const handlers: Handlers = { onToggleLeaf, onToggleCategory };
  return (
    <table className="rs-table" role="treegrid" aria-label="Fields">
      <thead>
        <tr role="row">
          <th className="name-col">Name</th>
          <th className="cb-col">View</th>
          <th className="cb-col">Edit</th>
        </tr>
      </thead>
      <tbody>
        {tree.map((node) => (
          <TreeRow key={node.key} node={node} depth={0} handlers={handlers} />
        ))}
      </tbody>
    </table>
  );
}
