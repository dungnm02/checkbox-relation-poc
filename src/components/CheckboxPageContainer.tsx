// §2 — Smart container: compiles config, owns selected status, wires the engine to the tables.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { BackendConfig } from '../core/types';
import { useCheckboxConfig } from '../hooks/useCheckboxConfig';
import { useRelationEngine } from '../hooks/useRelationEngine';
import { useAppSelector } from '../store/hooks';
import { selectFieldTableVisible } from '../store/selectors';
import { ActionTable } from './ActionTable';
import { FieldTreeTable } from './FieldTreeTable';
import { StatusSelector } from './StatusSelector';

export interface CheckboxPageContainerProps {
  backend: BackendConfig;
}

export function CheckboxPageContainer({ backend }: CheckboxPageContainerProps) {
  const compiled = useCheckboxConfig(backend);
  const engine = useRelationEngine(compiled);

  const [status, setStatus] = useState(compiled.statuses[0]);
  useEffect(() => setStatus(compiled.statuses[0]), [compiled]);

  const visibleSelector = useMemo(
    () => selectFieldTableVisible(compiled.engine.visibility, status),
    [compiled, status],
  );
  const fieldVisible = useAppSelector(visibleSelector);

  const actionIds = compiled.actionsByStatus.get(status) ?? [];
  const tree = compiled.treesByStatus.get(status) ?? [];

  // §6 accessibility: announce field-table show/hide to assistive tech.
  const [announcement, setAnnouncement] = useState('');
  const prevVisible = useRef(fieldVisible);
  useEffect(() => {
    if (prevVisible.current !== fieldVisible) {
      setAnnouncement(fieldVisible ? 'Fields shown.' : 'Fields hidden and cleared.');
      prevVisible.current = fieldVisible;
    }
  }, [fieldVisible]);

  return (
    <div className="rs-page">
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
      <header className="rs-header">
        <h2>
          {compiled.resourceType} · {compiled.resourceName}
        </h2>
        <StatusSelector statuses={compiled.statuses} selected={status} onSelect={setStatus} />
      </header>

      <section aria-labelledby="action-heading">
        <h3 id="action-heading">Actions</h3>
        <ActionTable actionIds={actionIds} onToggle={engine.toggleLeaf} />
      </section>

      {tree.length > 0 && (
        <section aria-labelledby="field-heading">
          <h3 id="field-heading">Fields</h3>
          {fieldVisible ? (
            <FieldTreeTable
              tree={tree}
              onToggleLeaf={engine.toggleLeaf}
              onToggleCategory={(key, column) => engine.toggleCategory(key, status, column)}
            />
          ) : (
            <p className="field-hidden-note">Fields are hidden. Enable a field-group action to show them.</p>
          )}
        </section>
      )}
    </div>
  );
}
