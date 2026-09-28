/**
 * @vitest-environment jsdom
 *
 * `ProgressBar` composes Ark `Progress`, so these pin what the wrapper adds:
 * the recipe classes, the "n of m" `aria-valuetext`, the accessible name
 * coming from the visible label, and the normalizing that keeps an
 * out-of-range value or an unusable range from reaching Ark (which throws on
 * either).
 */
import { cleanup, render } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ProgressBar,
  normalizeProgress,
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

describe('normalizeProgress', () => {
  it('passes an in-range value and range through', () => {
    expect(normalizeProgress(3, 0, 5)).toEqual({ value: 3, min: 0, max: 5 });
  });

  it('clamps the value to the range ends', () => {
    expect(normalizeProgress(7, 0, 5).value).toBe(5);
    expect(normalizeProgress(-1, 0, 5).value).toBe(0);
    expect(normalizeProgress(4, 10, 20).value).toBe(10);
  });

  it('reads a non-finite value as min', () => {
    expect(normalizeProgress(Number.NaN, 2, 5).value).toBe(2);
    expect(normalizeProgress(Number.POSITIVE_INFINITY, 2, 5).value).toBe(2);
  });

  it('reads a non-finite min as 0', () => {
    expect(normalizeProgress(3, Number.NaN, 5)).toEqual({
      value: 3,
      min: 0,
      max: 5,
    });
  });

  it('turns a non-finite, empty or inverted range into an empty bar', () => {
    expect(normalizeProgress(3, 0, Number.NaN)).toEqual({
      value: 0,
      min: 0,
      max: 100,
    });
    expect(normalizeProgress(0, 0, 0)).toEqual({ value: 0, min: 0, max: 100 });
    expect(normalizeProgress(7, 10, 5)).toEqual({
      value: 10,
      min: 10,
      max: 110,
    });
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
      showHeader: false,
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

  it('names the bar from a string label while the header is hidden', () => {
    const { container, progressbar } = renderBar({
      value: 1,
      label: 'Upload',
      showHeader: false,
    });

    expect(container.querySelector('.progressBar__header')).toBeNull();
    expect(progressbar.hasAttribute('aria-labelledby')).toBe(false);
    expect(progressbar.getAttribute('aria-label')).toBe('Upload');
  });

  it('carries a non-zero min through to the progressbar', () => {
    const { container, progressbar } = renderBar({
      value: 15,
      min: 10,
      max: 20,
    });

    expect(progressbar.getAttribute('aria-valuemin')).toBe('10');
    expect(progressbar.getAttribute('aria-valuenow')).toBe('15');
    expect(
      container.querySelector<HTMLElement>('.progressBar__range')?.style.width,
    ).toBe('50%');
  });

  it('renders an empty bar instead of letting Ark throw on an unusable range', () => {
    for (const [min, max] of [
      [0, Number.NaN],
      [0, 0],
      [10, 5],
    ] as const) {
      const { container } = renderBar({ value: 3, min, max });

      expect(
        container.querySelector<HTMLElement>('.progressBar__range')?.style
          .width,
        `fill for [${min}, ${max}]`,
      ).toBe('0%');
      cleanup();
    }
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
