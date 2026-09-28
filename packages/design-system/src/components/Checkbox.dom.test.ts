/**
 * @vitest-environment jsdom
 *
 * `Checkbox` and `CheckboxGroup` compose Ark Checkbox, so these pin what the
 * wrappers add: the recipe classes, which mark shows for each checked state,
 * the label wiring, and that a group collects its children's values and is
 * named by its heading.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Checkbox,
  CheckboxGroup,
  type CheckboxGroupProps,
  type CheckboxProps,
} from './Checkbox.js';

afterEach(cleanup);

function renderCheckbox(props: CheckboxProps) {
  const view = render(createElement(Checkbox, props));
  const part = (slot: string) =>
    view.container.querySelector<HTMLElement>(`.checkbox__${slot}`);
  const input = view.container.querySelector<HTMLInputElement>(
    'input[type="checkbox"]',
  );
  if (!input) throw new Error('no hidden input rendered');
  return { ...view, part, input };
}

/** The visible marks, in render order: check, then indeterminate. */
const visibleMarks = (container: HTMLElement) =>
  [...container.querySelectorAll<HTMLElement>('.checkbox__indicator')].map(
    (mark) => !mark.hidden,
  );

/**
 * Zag applies a machine transition after the event handler returns, so the
 * click is awaited inside `act` for React to commit the new state.
 */
async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
}

describe('Checkbox', () => {
  it('applies the recipe slot classes and renders children as the label', () => {
    const { part } = renderCheckbox({ children: 'Stablecoins' });

    for (const slot of ['root', 'control', 'indicator', 'label']) {
      expect(part(slot), `checkbox__${slot}`).not.toBeNull();
    }
    expect(part('label')?.textContent).toBe('Stablecoins');
  });

  it('labels the native input with the visible label', () => {
    const { part, input } = renderCheckbox({ children: 'Stablecoins' });

    expect(input.getAttribute('aria-labelledby')).toBe(part('label')?.id);
  });

  it('renders no label part without children', () => {
    const { part } = renderCheckbox({ 'aria-label': 'Select row' });

    expect(part('label')).toBeNull();
  });

  it('composes a consumer className after the slot class', () => {
    const { part } = renderCheckbox({ className: 'mine' });

    expect(part('root')?.className).toBe('checkbox__root mine');
  });

  it('shows the check when checked, the dash when indeterminate, neither when unchecked', () => {
    expect(visibleMarks(renderCheckbox({}).container)).toEqual([false, false]);
    cleanup();
    expect(
      visibleMarks(renderCheckbox({ defaultChecked: true }).container),
    ).toEqual([true, false]);
    cleanup();
    expect(
      visibleMarks(renderCheckbox({ checked: 'indeterminate' }).container),
    ).toEqual([false, true]);
  });

  it('toggles through the native input and reports it', async () => {
    const onCheckedChange = vi.fn();
    const { part, input } = renderCheckbox({
      children: 'Stablecoins',
      onCheckedChange,
    });

    await click(input);

    expect(part('control')?.dataset.state).toBe('checked');
    expect(onCheckedChange).toHaveBeenCalledWith(
      expect.objectContaining({ checked: true }),
    );
  });

  it('ignores clicks while disabled and marks every part', async () => {
    const onCheckedChange = vi.fn();
    const { part, input } = renderCheckbox({
      children: 'Stablecoins',
      disabled: true,
      onCheckedChange,
    });

    await click(input);

    expect(input.disabled).toBe(true);
    expect(part('control')?.dataset.state).toBe('unchecked');
    expect(onCheckedChange).not.toHaveBeenCalled();
    for (const slot of ['root', 'control', 'label']) {
      expect(part(slot)?.hasAttribute('data-disabled'), slot).toBe(true);
    }
  });

  it('marks the control and the native input invalid', () => {
    const { part, input } = renderCheckbox({
      children: 'Stablecoins',
      invalid: true,
    });

    expect(part('control')?.hasAttribute('data-invalid')).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
});

describe('CheckboxGroup', () => {
  function renderGroup(props: Partial<CheckboxGroupProps> = {}) {
    return render(
      createElement(
        CheckboxGroup,
        props,
        createElement(Checkbox, { value: 'eth' }, 'ETH'),
        createElement(Checkbox, { value: 'btc' }, 'BTC'),
      ),
    );
  }

  it('is a group named by its heading', () => {
    const { container } = renderGroup({ label: 'Assets' });
    const group = container.querySelector('[role="group"]');
    const heading = container.querySelector('.checkbox__groupLabel');

    expect(group?.className).toBe('checkbox__group');
    expect(heading?.textContent).toBe('Assets');
    expect(group?.getAttribute('aria-labelledby')).toBe(heading?.id);
  });

  it('lets an explicit aria-labelledby win over the heading', () => {
    const { container } = renderGroup({
      label: 'Assets',
      'aria-labelledby': 'elsewhere',
    });

    expect(
      container
        .querySelector('[role="group"]')
        ?.getAttribute('aria-labelledby'),
    ).toBe('elsewhere');
  });

  it('marks its orientation for the recipe, vertical by default', () => {
    const vertical = renderGroup().container.querySelector('[role="group"]');
    expect(vertical?.getAttribute('data-orientation')).toBe('vertical');
    cleanup();
    const horizontal = renderGroup({
      orientation: 'horizontal',
    }).container.querySelector('[role="group"]');
    expect(horizontal?.getAttribute('data-orientation')).toBe('horizontal');
  });

  it('checks the children named in defaultValue', () => {
    const { container } = renderGroup({ defaultValue: ['btc'] });
    const states = [
      ...container.querySelectorAll<HTMLElement>('.checkbox__control'),
    ].map((control) => control.dataset.state);

    expect(states).toEqual(['unchecked', 'checked']);
  });

  it('collects toggled children into onValueChange', async () => {
    const onValueChange = vi.fn();
    const { container } = renderGroup({ defaultValue: ['btc'], onValueChange });
    const inputs = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    const eth = inputs[0];
    if (!eth) throw new Error('no input rendered');

    await click(eth);

    expect(onValueChange).toHaveBeenLastCalledWith(['btc', 'eth']);
  });

  it('drops an unchecked child from the value', async () => {
    const onValueChange = vi.fn();
    const { container } = renderGroup({
      defaultValue: ['eth', 'btc'],
      onValueChange,
    });
    const btc = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    )[1];
    if (!btc) throw new Error('no input rendered');

    await click(btc);

    expect(onValueChange).toHaveBeenLastCalledWith(['eth']);
  });

  it('disables every child when the group is disabled', async () => {
    const onValueChange = vi.fn();
    const { container } = renderGroup({ disabled: true, onValueChange });
    const inputs = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ];

    for (const input of inputs) await click(input);

    expect(inputs.map((input) => input.disabled)).toEqual([true, true]);
    expect(onValueChange).not.toHaveBeenCalled();
  });
});
