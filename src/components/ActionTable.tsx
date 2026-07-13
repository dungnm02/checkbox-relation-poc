// §4 — the flat ACTION table (name + one ACTION checkbox per row).

import { useAppSelector } from '../store/hooks';
import { selectCheckboxById } from '../store/selectors';
import type { LeafId } from '../core/types';
import { CheckboxCell } from './CheckboxCell';
import { labelFor, reasonLabel } from './labels';

interface ActionRowProps {
  id: LeafId;
  onToggle: (id: LeafId) => void;
}

function ActionRow({ id, onToggle }: ActionRowProps) {
  const value = useAppSelector(selectCheckboxById(id));
  if (!value) return null;
  return (
    <tr>
      <td className="name-col">{labelFor(id)}</td>
      <td className="cb-col">
        <CheckboxCell
          checked={value.checked}
          disabled={value.disabledBy.length > 0}
          disabledReasons={value.disabledBy.map(reasonLabel)}
          onToggle={() => onToggle(id)}
          label={labelFor(id)}
        />
      </td>
    </tr>
  );
}

export interface ActionTableProps {
  actionIds: LeafId[];
  onToggle: (id: LeafId) => void;
}

export function ActionTable({ actionIds, onToggle }: ActionTableProps) {
  return (
    <table className="rs-table" aria-label="Actions">
      <thead>
        <tr>
          <th className="name-col">Name</th>
          <th className="cb-col">Action</th>
        </tr>
      </thead>
      <tbody>
        {actionIds.map((id) => (
          <ActionRow key={id} id={id} onToggle={onToggle} />
        ))}
      </tbody>
    </table>
  );
}
