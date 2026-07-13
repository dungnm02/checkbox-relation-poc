import { describe, it, expect } from 'vitest';
import { parseId, isValidId, formatId, withType, IdParseError } from './parseId';

describe('parseId (§4.1)', () => {
  it('parses a VIEW field id', () => {
    expect(parseId('AI_FEATURE/IN_PROGRESS/VIEW/properties.name')).toEqual({
      resourceName: 'AI_FEATURE',
      status: 'IN_PROGRESS',
      type: 'VIEW',
      path: 'properties.name',
      raw: 'AI_FEATURE/IN_PROGRESS/VIEW/properties.name',
    });
  });

  it('parses an ACTION id', () => {
    const p = parseId('AI_FEATURE/IN_REVIEW/ACTION/export');
    expect(p.type).toBe('ACTION');
    expect(p.path).toBe('export');
  });

  it('treats path as opaque — keeps dots and slashes verbatim', () => {
    const p = parseId('R/S/EDIT/a.b.c/d/e');
    expect(p.path).toBe('a.b.c/d/e');
    expect(p.type).toBe('EDIT');
  });

  it('rejects an unknown type segment', () => {
    expect(() => parseId('R/S/DELETE/x')).toThrow(IdParseError);
    expect(() => parseId('R/S/DELETE/x')).toThrow(/ACTION\|VIEW\|EDIT/);
  });

  it('rejects too few segments', () => {
    expect(() => parseId('R/S/VIEW')).toThrow(/3 "\/" separators/);
    expect(() => parseId('justastring')).toThrow(IdParseError);
  });

  it('rejects an empty path', () => {
    expect(() => parseId('R/S/VIEW/')).toThrow(/path must be non-empty/);
  });

  it('rejects invalid resource/status segments', () => {
    expect(() => parseId('R@X/S/VIEW/p')).toThrow(/resourceName/);
    expect(() => parseId('R/S X/VIEW/p')).toThrow(/status/);
  });

  it('does not accept wildcards (those belong to expressions, not concrete ids)', () => {
    expect(isValidId('R/*/VIEW/p')).toBe(false);
    expect(isValidId('*/*/VIEW/*')).toBe(false);
  });

  it('round-trips through formatId', () => {
    const raw = 'AI_FEATURE/IN_PROGRESS/EDIT/properties.name';
    const p = parseId(raw);
    expect(formatId(p)).toBe(raw);
  });
});

describe('withType — sibling swap (§4.4a pivot)', () => {
  it('swaps EDIT to VIEW keeping resource/status/path', () => {
    expect(withType('AI_FEATURE/IN_PROGRESS/EDIT/properties.name', 'VIEW')).toBe(
      'AI_FEATURE/IN_PROGRESS/VIEW/properties.name',
    );
  });

  it('accepts an already-parsed id', () => {
    const p = parseId('R/S/VIEW/p');
    expect(withType(p, 'EDIT')).toBe('R/S/EDIT/p');
  });
});
