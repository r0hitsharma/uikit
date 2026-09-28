/**
 * @vitest-environment jsdom
 *
 * `Steps` is a skin over Ark Steps, so what is worth pinning is the wiring:
 * each part carries its recipe slot class, the current item carries
 * `aria-current="step"`, the progress bar reflects the step, the default
 * indicator switches from number to check, and the validation callbacks
 * reach Ark unchanged.
 */
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createElement, type ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Steps } from './Steps.js';

afterEach(cleanup);

const LABELS = ['Source', 'Schema', 'Review'];

type RootProps = ComponentProps<typeof Steps.Root>;

function renderSteps(
  props: Partial<RootProps> = {},
  progressProps: ComponentProps<typeof Steps.Progress> = {},
) {
  return render(
    createElement(
      Steps.Root,
      { count: LABELS.length, ...props } as RootProps,
      createElement(
        Steps.List,
        null,
        LABELS.map((label, index) =>
          createElement(
            Steps.Item,
            { key: label, index },
            createElement(
              Steps.Trigger,
              null,
              createElement(Steps.Indicator),
              label,
            ),
            createElement(Steps.Separator),
          ),
        ),
      ),
      createElement(Steps.Progress, progressProps),
      LABELS.map((label, index) =>
        createElement(Steps.Content, { key: label, index }, `${label} body`),
      ),
      createElement(Steps.CompletedContent, null, 'All done'),
      createElement(Steps.PrevTrigger, null, 'Back'),
      createElement(Steps.NextTrigger, null, 'Next'),
    ),
  );
}

const items = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>('.steps__item'),
];

/**
 * Zag applies a machine transition after the event handler returns, so the
 * click is awaited inside `act` for React to commit the new step.
 */
async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
}

const currentIndex = (container: HTMLElement) =>
  items(container).findIndex(
    (item) => item.getAttribute('aria-current') === 'step',
  );

describe('Steps', () => {
  it('applies the recipe slot class to every styled part', () => {
    const { container } = renderSteps();

    for (const slot of [
      'root',
      'list',
      'item',
      'trigger',
      'indicator',
      'separator',
      'content',
      'completedContent',
      'progress',
    ]) {
      expect(
        container.querySelector(`.steps__${slot}`),
        `steps__${slot}`,
      ).not.toBeNull();
    }
  });

  it('composes a consumer className after the slot class', () => {
    const { container } = render(
      createElement(Steps.Root, { count: 1, className: 'mine' }),
    );

    expect(container.firstElementChild?.className).toBe('steps__root mine');
  });

  it('marks only the current item with aria-current="step"', () => {
    const { container } = renderSteps({ defaultStep: 1 });

    expect(currentIndex(container)).toBe(1);
    expect(
      items(container).filter((item) => item.hasAttribute('aria-current')),
    ).toHaveLength(1);
  });

  it('numbers incomplete steps and checks completed ones by default', () => {
    const { container } = renderSteps({ defaultStep: 1 });
    const indicators = [
      ...container.querySelectorAll<HTMLElement>('.steps__indicator'),
    ];

    expect(indicators[0]?.querySelector('svg')).not.toBeNull();
    expect(indicators[0]?.textContent).toBe('');
    expect(indicators[1]?.textContent).toBe('2');
    expect(indicators[2]?.textContent).toBe('3');
  });

  it('keeps consumer indicator children instead of the default', () => {
    const { container } = render(
      createElement(
        Steps.Root,
        { count: 1 },
        createElement(
          Steps.List,
          null,
          createElement(
            Steps.Item,
            { index: 0 },
            createElement(Steps.Indicator, null, 'A'),
          ),
        ),
      ),
    );

    expect(container.querySelector('.steps__indicator')?.textContent).toBe('A');
  });

  it('reports progress as a progressbar, overridable with aria-valuetext', () => {
    const { container } = renderSteps(
      { defaultStep: 1 },
      { 'aria-valuetext': 'Step 2 of 3' },
    );
    const progress = container.querySelector('.steps__progress');
    const root = container.querySelector<HTMLElement>('.steps__root');

    expect(progress?.getAttribute('role')).toBe('progressbar');
    expect(Number(progress?.getAttribute('aria-valuenow'))).toBeCloseTo(
      100 / 3,
    );
    expect(progress?.getAttribute('aria-valuetext')).toBe('Step 2 of 3');
    // The recipe's fill reads this custom property.
    expect(root?.style.getPropertyValue('--percent')).toMatch(/%$/);
  });

  it('advances on NextTrigger and shows CompletedContent at the end', async () => {
    const { container, getByText } = renderSteps({ defaultStep: 2 });

    await click(getByText('Next'));

    expect(currentIndex(container)).toBe(-1);
    expect(
      container.querySelector<HTMLElement>('.steps__completedContent')?.hidden,
    ).toBe(false);
  });

  it('blocks forward navigation while isStepValid rejects the step', async () => {
    const onStepInvalid = vi.fn();
    const { container, getByText } = renderSteps({
      isStepValid: (index) => index !== 0,
      onStepInvalid,
    });

    await click(getByText('Next'));

    expect(currentIndex(container)).toBe(0);
    expect(onStepInvalid).toHaveBeenCalledWith(
      expect.objectContaining({ step: 0, action: 'next' }),
    );
  });

  it('lets a skippable step advance even when it is not valid', async () => {
    const { container, getByText } = renderSteps({
      isStepValid: () => false,
      isStepSkippable: (index) => index === 0,
    });

    await click(getByText('Next'));

    expect(currentIndex(container)).toBe(1);
    expect(items(container)[0]?.hasAttribute('data-skippable')).toBe(true);
  });
});
