// Shared fixture: an AI_FEATURE resource with two statuses, used across phase tests.
import type { BackendConfig, StatusContent } from '../../core/types';

function statusContent(status: string): StatusContent {
  const R = 'AI_FEATURE';
  return {
    status,
    action: [
      { id: `${R}/${status}/ACTION/enable_fields`, isChecked: true, isDisabled: false },
      { id: `${R}/${status}/ACTION/export`, isChecked: false, isDisabled: false },
    ],
    field: [
      {
        isCategory: true,
        name: 'Properties',
        children: [
          {
            isCategory: false,
            name: 'Name',
            view: { id: `${R}/${status}/VIEW/properties.name`, isChecked: false, isDisabled: false },
            edit: { id: `${R}/${status}/EDIT/properties.name`, isChecked: false, isDisabled: false },
          },
          {
            isCategory: false,
            name: 'Owner',
            view: { id: `${R}/${status}/VIEW/properties.owner`, isChecked: true, isDisabled: false },
            edit: { id: `${R}/${status}/EDIT/properties.owner`, isChecked: false, isDisabled: true },
          },
        ],
      },
      {
        isCategory: false,
        name: 'Description',
        view: { id: `${R}/${status}/VIEW/description`, isChecked: false, isDisabled: false },
        edit: { id: `${R}/${status}/EDIT/description`, isChecked: false, isDisabled: false },
      },
    ],
  };
}

export const aiFeatureConfig: BackendConfig = {
  resourceType: 'FEATURE',
  resourceName: 'AI_FEATURE',
  statuses: ['IN_PROGRESS', 'IN_REVIEW'],
  content: [statusContent('IN_PROGRESS'), statusContent('IN_REVIEW')],
};
