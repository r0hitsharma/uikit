/**
 * @vitest-environment jsdom
 *
 * `ProgressBar` composes Ark `Progress`, so these pin what the wrapper adds:
 * the recipe classes, the "n of m" `aria-valuetext`, the accessible name
 * coming from the visible label, and the clamping that keeps an out-of-range
 * value from reaching Ark (which throws on one).
 */
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ProgressBar,
  clampProgressValue,
  type ProgressBarProps,
} from './ProgressBar.js';

afterEach(cleanup);

function renderBar(props: ProgressBarProps) {
  const { container } = render(createElement(ProgressBar, props));
  const progressbar = container.querySelector<HTMLElement>(
    '[role="progressbar"]',
  );
  if (!progressbar) throw new Error('no progressbar rendered');
  return { container, progressbar };
}

describe('clampProgressValue', () => {
  it('passes an in-range value through', () => {
    expect(clampProgressValue(3, 0, 5)).toBe(3);
  });

  it('clamps to the range ends', () => {
    expect(clampProgressValue(7, 0, 5)).toBe(5);
    expect(clampProgressValue(-1, 0, 5)).toBe(0);
  });

  it('reads a non-finite value as min', () => {
    expect(clampProgressValue(Number.NaN, 2, 5)).toBe(2);
    expect(clampProgressValue(Number.POSITIVE_INFINITY, 2, 5)).toBe(2);
  });
});

describe('ProgressBar', () => {
  it('announces valueText as aria-valuetext and shows it as the readout', () => {
    const { container, progressbar } = renderBar({
      value: 3,
      max: 5,
      label: 'Setup',
      valueText: '3 of 5 steps',
    });

    expect(progressbar.getAttribute('aria-valuenow')).toBe('3');
    expect(progressbar.getAttribute('aria-valuemin')).toBe('0');
    expect(progressbar.getAttribute('aria-valuemax')).toBe('5');
    expect(progressbar.getAttribute('aria-valuetext')).toBe('3 of 5 steps');
    expect(
      container.querySelector('.progressBar__valueText')?.textContent,
    ).toBe('3 of 5 steps');
  });

  it('falls back to the percentage readout without valueText', () => {
    const { container, progressbar } = renderBar({ value: 60 });

    expect(progressbar.hasAttribute('aria-valuetext')).toBe(false);
    expect(
      container.querySelector('.progressBar__valueText')?.textContent,
    ).toBe('60%');
  });

  it('is named by its visible label', () => {
    const { container, progressbar } = renderBar({ value: 1, label: 'Upload' });
    const label = container.querySelector('.progressBar__label');

    expect(label?.id).toBeTruthy();
    expect(progressbar.getAttribute('aria-labelledby')).toBe(label?.id);
  });

  it('forwards aria-label to the progressbar when there is no label', () => {
    const { container, progressbar } = renderBar({
      value: 1,
      'aria-label': 'Sync',
      showValueText: false,
    });

    expect(progressbar.getAttribute('aria-label')).toBe('Sync');
    expect(progressbar.hasAttribute('aria-labelledby')).toBe(false);
    expect(container.querySelector('.progressBar__header')).toBeNull();
  });

  it('clamps an overshooting value instead of letting Ark throw', () => {
    const { container, progressbar } = renderBar({ value: 6, max: 5 });

    expect(progressbar.getAttribute('aria-valuenow')).toBe('5');
    expect(
      container.querySelector<HTMLElement>('.progressBar__range')?.style.width,
    ).toBe('100%');
  });

  it('applies the tone variant to the root and the size variant to the track', () => {
    const { container, progressbar } = renderBar({
      value: 1,
      tone: 'success',
      size: 'sm',
      className: 'mine',
    });

    expect(container.firstElementChild?.className).toBe(
      'progressBar__root progressBar__root--tone_success mine',
    );
    expect(progressbar.className).toBe(
      'progressBar__track progressBar__track--size_sm',
    );
  });
});
