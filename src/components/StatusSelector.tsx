// §1 — status label list (tablist). Switching status filters visible content; because state
// is keyed by full id (STATUS namespaced), no state swapping is needed.

export interface StatusSelectorProps {
  statuses: string[];
  selected: string;
  onSelect: (status: string) => void;
}

export function StatusSelector({ statuses, selected, onSelect }: StatusSelectorProps) {
  if (statuses.length <= 1) return null;
  return (
    <div className="status-selector" role="tablist" aria-label="Status">
      {statuses.map((status) => (
        <button
          key={status}
          role="tab"
          type="button"
          aria-selected={status === selected}
          className={`status-tab${status === selected ? ' active' : ''}`}
          onClick={() => onSelect(status)}
        >
          {status.replace(/_/g, ' ')}
        </button>
      ))}
    </div>
  );
}
