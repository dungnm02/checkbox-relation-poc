import { describe, it, expect } from 'vitest';
import { aggregate, leafToggleEvent, categoryToggleEvent } from './derive';
import type { CheckboxState } from '../types';

const st = (entries: Record<string, [boolean, string[]]>): CheckboxState =>
  Object.fromEntries(Object.entries(entries).map(([k, [checked, disabledBy]]) => [k, { checked, disabledBy }]));

describe('aggregate (§4.5)', () => {
  it('all checked → checked', () => {
    expect(aggregate(st({ a: [true, []], b: [true, []] }), ['a', 'b'])).toMatchObject({ checked: true, indeterminate: false });
  });
  it('some checked → indeterminate', () => {
    expect(aggregate(st({ a: [true, []], b: [false, []] }), ['a', 'b'])).toMatchObject({ checked: false, indeterminate: true });
  });
  it('all disabled → disabled', () => {
    expect(aggregate(st({ a: [false, ['@initial']], b: [true, ['x']] }), ['a', 'b']).disabled).toBe(true);
  });
});

describe('leafToggleEvent', () => {
  it('flips an enabled leaf', () => {
    expect(leafToggleEvent(st({ a: [false, []] }), 'a')).toEqual({ kind: 'leaf', id: 'a', checked: true });
  });
  it('no-ops a disabled leaf', () => {
    expect(leafToggleEvent(st({ a: [false, ['@hidden']] }), 'a')).toBeNull();
  });
});

describe('categoryToggleEvent (§4.5)', () => {
  it('unchecked → check all writable', () => {
    const ev = categoryToggleEvent(st({ a: [false, []], b: [false, []] }), ['a', 'b']);
    expect(ev).toEqual({ kind: 'category', leafIds: ['a', 'b'], checked: true });
  });
  it('indeterminate → uncheck all', () => {
    const ev = categoryToggleEvent(st({ a: [true, []], b: [false, []] }), ['a', 'b']);
    expect(ev).toEqual({ kind: 'category', leafIds: ['a', 'b'], checked: false });
  });
  it('excludes disabled leaves from the write set', () => {
    const ev = categoryToggleEvent(st({ a: [false, []], b: [false, ['@initial']] }), ['a', 'b']);
    expect(ev).toEqual({ kind: 'category', leafIds: ['a'], checked: true });
  });
});
