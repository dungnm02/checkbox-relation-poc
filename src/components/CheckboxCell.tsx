// §6 Accessibility — a checkbox that renders the native `indeterminate` DOM property and
// aria-checked="mixed" for tri-state category cells, and aria-disabled with a reason tooltip.

import { useEffect, useRef } from 'react';

export interface CheckboxCellProps {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onToggle: () => void;
  label: string;
  /** Human-readable reasons for the disabled state (→ aria-describedby tooltip). */
  disabledReasons?: string[];
}

export function CheckboxCell({
  checked,
  indeterminate = false,
  disabled = false,
  onToggle,
  label,
  disabledReasons,
}: CheckboxCellProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate && !checked;
  }, [indeterminate, checked]);

  const title = disabled && disabledReasons?.length ? `Locked by: ${disabledReasons.join(', ')}` : undefined;

  return (
    <input
      ref={ref}
      type="checkbox"
      className="cb-cell"
      checked={checked}
      disabled={disabled}
      aria-checked={indeterminate && !checked ? 'mixed' : checked}
      aria-disabled={disabled || undefined}
      aria-label={label}
      title={title}
      onChange={() => {
        if (!disabled) onToggle();
      }}
    />
  );
}
