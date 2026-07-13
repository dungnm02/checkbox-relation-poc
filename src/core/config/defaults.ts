// §4.4a — the universal "EDIT ⇒ VIEW (same path)" business invariant, shipped as
// declarative FE default config (data, not imperative code) and merged at load.
//
//   check EDIT  ⇒ its VIEW checks   (CASCADES_CHECK, $EDIT → $VIEW)
//   uncheck VIEW ⇒ its EDIT unchecks (CASCADES_UNCHECK, $VIEW → $EDIT)
//
// Modeled as two directional cascades (not REQUIRES): the requirement is that checking
// EDIT PULLS VIEW on, not that EDIT be disabled while VIEW is off. Both cascades converge
// under change-detection (§6). A resource that instead needs "EDIT blocked until VIEW"
// can override `fe.edit-checks-view` with a REQUIRES rule of the same id (§4.4a).

import type { RelationRule } from '../types';

/** Reserved id prefix for FE defaults; backend rules reuse an id to override. */
export const FE_PREFIX = 'fe.';

export function feDefaultRelations(): RelationRule[] {
  return [
    {
      id: 'fe.edit-checks-view',
      sourceId: '$EDIT',
      relationships: [{ id: 'fe.edit-checks-view', type: 'CASCADES_CHECK', targets: ['$VIEW'] }],
    },
    {
      id: 'fe.view-unchecks-edit',
      sourceId: '$VIEW',
      relationships: [{ id: 'fe.view-unchecks-edit', type: 'CASCADES_UNCHECK', targets: ['$EDIT'] }],
    },
  ];
}
