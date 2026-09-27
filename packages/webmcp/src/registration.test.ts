import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  flushMicrotasks,
  installFakeContext,
  removeFakeContext,
} from './__tests__/fake-context.js';
import { acquireToolRegistration } from './registration.js';
import type { ToolSpec } from './types.js';

function spec(name: string, extra: Partial<ToolSpec> = {}): ToolSpec {
  return {
    name,
    description: `Test tool ${name}.`,
    schema: { type: 'object', properties: {} },
    handler: () => ({ ok: true }),
    ...extra,
  };
}

afterEach(async () => {
  await flushMicrotasks();
  removeFakeContext();
  vi.restoreAllMocks();
});

describe('async registerTool', () => {
  it('registers once and unregisters when the last holder releases', async () => {
    const ctx = installFakeContext();
    const releaseA = acquireToolRegistration(spec('reg.basic'));
    const releaseB = acquireToolRegistration(spec('reg.basic'));
    await flushMicrotasks();
    expect(ctx.calls).toHaveLength(1);
    expect(ctx.tools.has('reg.basic')).toBe(true);
    releaseA();
    await flushMicrotasks();
    expect(ctx.tools.has('reg.basic')).toBe(true);
    releaseB();
    await flushMicrotasks();
    expect(ctx.tools.has('reg.basic')).toBe(false);
  });

  it('treats a duplicate-name rejection as already present (no unhandled rejection)', async () => {
    const ctx = installFakeContext();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A registration this package does not own already holds the name.
    ctx.tools.set('reg.dup', { name: 'reg.dup', execute: () => null });
    const release = acquireToolRegistration(spec('reg.dup'));
    await flushMicrotasks();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('already registered'),
    );
    release();
    await flushMicrotasks();
  });

  it('logs any other rejection and keeps the refcount balanced', async () => {
    const ctx = installFakeContext();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    ctx.failWith = new TypeError('bad descriptor');
    const release = acquireToolRegistration(spec('reg.fail'));
    await flushMicrotasks();
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('reg.fail'),
      expect.any(TypeError),
    );
    release();
    await flushMicrotasks();
    // The entry was torn down, so a later mount registers afresh.
    ctx.failWith = undefined;
    const again = acquireToolRegistration(spec('reg.fail'));
    await flushMicrotasks();
    expect(ctx.tools.has('reg.fail')).toBe(true);
    again();
  });

  it('cancels a registration released before registerTool resolved', async () => {
    const ctx = installFakeContext();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    let open!: () => void;
    ctx.gate = new Promise<void>((r) => (open = r));
    const release = acquireToolRegistration(spec('reg.race'));
    release();
    await flushMicrotasks(); // the deferred abort fires while still pending
    open();
    await flushMicrotasks();
    expect(ctx.tools.has('reg.race')).toBe(false);
    expect(error).not.toHaveBeenCalled();
  });
});

describe('registered descriptor', () => {
  it('forwards title and outputSchema, omitting them when unset', async () => {
    const ctx = installFakeContext();
    const releaseA = acquireToolRegistration(
      spec('desc.full', {
        title: 'Full',
        outputSchema: { type: 'object', properties: {} },
      }),
    );
    const releaseB = acquireToolRegistration(spec('desc.bare'));
    await flushMicrotasks();
    expect(ctx.tools.get('desc.full')).toMatchObject({
      title: 'Full',
      outputSchema: { type: 'object', properties: {} },
    });
    expect(ctx.tools.get('desc.bare')).not.toHaveProperty('title');
    expect(ctx.tools.get('desc.bare')).not.toHaveProperty('outputSchema');
    releaseA();
    releaseB();
  });
});

describe('annotations', () => {
  it('marks a mutation consequential and not read-only (no destructiveHint)', async () => {
    const ctx = installFakeContext();
    const release = acquireToolRegistration(
      spec('hint.mutation', {
        mutation: true,
        confirmationSummary: () => 'Do it.',
      }),
    );
    await flushMicrotasks();
    const annotations = ctx.tools.get('hint.mutation')?.['annotations'];
    expect(annotations).toEqual({
      readOnlyHint: false,
      untrustedContentHint: false,
      consequentialHint: true,
    });
    expect(annotations).not.toHaveProperty('destructiveHint');
    release();
  });

  it('marks any other tool read-only and passes untrustedContentHint through', async () => {
    const ctx = installFakeContext();
    const release = acquireToolRegistration(
      spec('hint.read', { annotations: { untrustedContentHint: true } }),
    );
    await flushMicrotasks();
    expect(ctx.tools.get('hint.read')?.['annotations']).toEqual({
      readOnlyHint: true,
      untrustedContentHint: true,
      consequentialHint: false,
    });
    release();
  });

  it('lets explicit annotations override the derived hints', async () => {
    const ctx = installFakeContext();
    const release = acquireToolRegistration(
      spec('hint.override', {
        annotations: { readOnlyHint: false, consequentialHint: true },
      }),
    );
    await flushMicrotasks();
    expect(ctx.tools.get('hint.override')?.['annotations']).toMatchObject({
      readOnlyHint: false,
      consequentialHint: true,
    });
    release();
  });
});
