import { afterEach, describe, expect, it, vi } from 'vitest';

import { defineTool } from './types.js';

const base = {
  description: 'A test tool.',
  schema: { type: 'object' as const, properties: {} },
  handler: () => null,
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('defineTool name validation', () => {
  it.each([
    'a',
    'explorer.selectIdentity',
    'snake_case-and.dots',
    'x'.repeat(128),
  ])('accepts %s', (name) => {
    expect(defineTool({ ...base, name }).name).toBe(name);
  });

  it.each(['', 'has space', 'slash/name', 'ünïcode', 'x'.repeat(129)])(
    'throws on %j',
    (name) => {
      expect(() => defineTool({ ...base, name })).toThrow(/tool name must be/);
    },
  );
});

describe('defineTool description budget', () => {
  it('warns once per tool when the description exceeds 500 characters', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const spec = { ...base, name: 'budget.long', description: 'd'.repeat(501) };
    defineTool(spec);
    defineTool(spec);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/501 characters/);
  });

  it('does not warn at exactly 500 characters', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    defineTool({ ...base, name: 'budget.ok', description: 'd'.repeat(500) });
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('defineTool new fields', () => {
  it('keeps title, annotations and outputSchema', () => {
    const spec = defineTool({
      ...base,
      name: 'fields.all',
      title: 'All fields',
      annotations: { untrustedContentHint: true },
      outputSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
    });
    expect(spec.title).toBe('All fields');
    expect(spec.annotations).toEqual({ untrustedContentHint: true });
    expect(spec.outputSchema).toMatchObject({ type: 'object' });
  });
});

describe('defineTool mutation annotations', () => {
  const mutation = {
    ...base,
    name: 't.mutate',
    mutation: true,
    confirmationSummary: () => 'Change something.',
  };

  it('throws on a mutation annotated readOnlyHint: true', () => {
    expect(() =>
      defineTool({ ...mutation, annotations: { readOnlyHint: true } }),
    ).toThrow(/cannot set annotations\.readOnlyHint: true/);
  });

  it('accepts a mutation with other annotation overrides', () => {
    expect(
      defineTool({ ...mutation, annotations: { untrustedContentHint: true } })
        .annotations,
    ).toEqual({ untrustedContentHint: true });
  });
});
