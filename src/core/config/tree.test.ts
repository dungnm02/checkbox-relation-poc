import { describe, it, expect } from 'vitest';
import { buildFieldTree, indexCategories, type UICategoryNode } from './tree';
import { aiFeatureConfig } from '../../test/fixtures/aiFeature';

describe('buildFieldTree / indexCategories (§4.5)', () => {
  const tree = buildFieldTree('IN_PROGRESS', aiFeatureConfig.content[0].field);

  it('generates stable index-path keys', () => {
    expect(tree[0].key).toBe('IN_PROGRESS#0'); // Properties category
    expect(tree[1].key).toBe('IN_PROGRESS#1'); // Description leaf
    const cat = tree[0] as UICategoryNode;
    expect(cat.children[0].key).toBe('IN_PROGRESS#0.0'); // Name leaf
    expect(cat.children[1].key).toBe('IN_PROGRESS#0.1'); // Owner leaf
  });

  it('precomputes descendant leaf ids per column on categories', () => {
    const cat = tree[0] as UICategoryNode;
    expect(cat.viewLeafIds).toEqual([
      'AI_FEATURE/IN_PROGRESS/VIEW/properties.name',
      'AI_FEATURE/IN_PROGRESS/VIEW/properties.owner',
    ]);
    expect(cat.editLeafIds).toEqual([
      'AI_FEATURE/IN_PROGRESS/EDIT/properties.name',
      'AI_FEATURE/IN_PROGRESS/EDIT/properties.owner',
    ]);
  });

  it('indexes categories by key for aggregate selectors', () => {
    const index = indexCategories(tree);
    expect(index.has('IN_PROGRESS#0')).toBe(true);
    expect(index.get('IN_PROGRESS#0')!.viewLeafIds).toHaveLength(2);
    // leaf keys are not categories
    expect(index.has('IN_PROGRESS#1')).toBe(false);
  });
});
