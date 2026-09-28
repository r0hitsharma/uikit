/**
 * @vitest-environment jsdom
 *
 * `Collapsible` is a skin over Ark Collapsible, so what is worth pinning is
 * the wiring: each part carries its recipe slot class, the default indicator
 * is a chevron, and the trigger's `aria-expanded` and the content's
 * visibility follow the open state Ark owns.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Collapsible } from './Collapsible.js';

afterEach(cleanup);

type RootProps = ComponentProps<typeof Collapsible.Root>;

function collapsibleTree(props: Partial<RootProps> = {}) {
  return createElement(
    Collapsible.Root,
    props as RootProps,
    createElement(
      Collapsible.Trigger,
      null,
      createElement(Collapsible.Indicator),
      'Advanced',
    ),
    createElement(Collapsible.Content, null, 'Hidden detail'),
  );
}

function renderCollapsible(props: Partial<RootProps> = {}) {
  const view = render(collapsibleTree(props));
  const part = (slot: string) =>
    view.container.querySelector<HTMLElement>(`.collapsible__${slot}`);
  return { ...view, part };
}

/**
 * Zag applies a machine transition after the event handler returns, so the
 * click is awaited inside `act` for React to commit the new state.
 */
async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
}

/**
 * Closing passes through a `closing` state that checks for an exit animation
 * on the next frame, so a close is only settled after one.
 */
async function nextFrame(): Promise<void> {
  await act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

describe('Collapsible', () => {
  it('applies the recipe slot class to every styled part', () => {
    const { part } = renderCollapsible({ defaultOpen: true });

    for (const slot of ['root', 'trigger', 'indicator', 'content']) {
      expect(part(slot), `collapsible__${slot}`).not.toBeNull();
    }
  });

  it('composes a consumer className after the slot class', () => {
    const { container } = render(
      createElement(Collapsible.Root, { className: 'mine' }),
    );

    expect(container.firstElementChild?.className).toBe(
      'collapsible__root mine',
    );
  });

  it('renders a chevron in the indicator by default', () => {
    const { part } = renderCollapsible();

    expect(part('indicator')?.querySelector('svg')).not.toBeNull();
  });

  it('keeps consumer indicator children instead of the chevron', () => {
    const { container } = render(
      createElement(
        Collapsible.Root,
        null,
        createElement(
          Collapsible.Trigger,
          null,
          createElement(Collapsible.Indicator, null, '+'),
        ),
      ),
    );

    const indicator = container.querySelector('.collapsible__indicator');
    expect(indicator?.textContent).toBe('+');
    expect(indicator?.querySelector('svg')).toBeNull();
  });

  it('starts closed, with the content hidden and aria-expanded false', () => {
    const { part } = renderCollapsible();

    expect(part('trigger')?.getAttribute('aria-expanded')).toBe('false');
    expect(part('content')?.hidden).toBe(true);
  });

  it('opens on trigger click and reports it through onOpenChange', async () => {
    const onOpenChange = vi.fn();
    const { part } = renderCollapsible({ onOpenChange });
    const trigger = part('trigger');
    if (!trigger) throw new Error('trigger not rendered');

    await click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe(part('content')?.id);
    expect(part('content')?.hidden).toBe(false);
    expect(part('indicator')?.dataset.state).toBe('open');
    expect(onOpenChange).toHaveBeenCalledWith(
      expect.objectContaining({ open: true }),
    );
  });

  it('closes again on a second click', async () => {
    const onOpenChange = vi.fn();
    const { part } = renderCollapsible({ defaultOpen: true, onOpenChange });
    const trigger = part('trigger');
    if (!trigger) throw new Error('trigger not rendered');

    await click(trigger);
    await nextFrame();

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(part('content')?.hidden).toBe(true);
    expect(part('indicator')?.dataset.state).toBe('closed');
    expect(onOpenChange).toHaveBeenCalledWith(
      expect.objectContaining({ open: false }),
    );
  });

  it('leaves a controlled open state to the parent, reporting the change', async () => {
    const onOpenChange = vi.fn();
    const { part, rerender } = renderCollapsible({ open: false, onOpenChange });
    const trigger = part('trigger');
    if (!trigger) throw new Error('trigger not rendered');

    await click(trigger);

    expect(onOpenChange).toHaveBeenCalledWith(
      expect.objectContaining({ open: true }),
    );
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await act(async () => {
      rerender(collapsibleTree({ open: true, onOpenChange }));
    });

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(part('content')?.hidden).toBe(false);
  });

  it('keeps lazyMount content out of the DOM until first opened', async () => {
    const { part, queryByText } = renderCollapsible({ lazyMount: true });
    const trigger = part('trigger');
    if (!trigger) throw new Error('trigger not rendered');

    expect(queryByText('Hidden detail')).toBeNull();

    await click(trigger);

    expect(queryByText('Hidden detail')).not.toBeNull();
  });

  it('unmounts unmountOnExit content once closed', async () => {
    const { part, queryByText } = renderCollapsible({
      defaultOpen: true,
      unmountOnExit: true,
    });
    const trigger = part('trigger');
    if (!trigger) throw new Error('trigger not rendered');

    expect(queryByText('Hidden detail')).not.toBeNull();

    await click(trigger);
    await nextFrame();

    expect(queryByText('Hidden detail')).toBeNull();
  });

  it('ignores clicks while disabled', async () => {
    const { part } = renderCollapsible({ disabled: true });
    const trigger = part('trigger');
    if (!trigger) throw new Error('trigger not rendered');

    await click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.hasAttribute('data-disabled')).toBe(true);
  });
});
