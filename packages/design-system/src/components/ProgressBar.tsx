import { Progress as ArkProgress } from '@ark-ui/react/progress';
import { useId, type HTMLAttributes, type ReactNode } from 'react';

/**
 * Class names emitted by the `progressBar` slot recipe (registered in the
 * preset + staticCss). The design-system ships no generated `styled-system`,
 * so styling is applied by stable slot class names (`progressBar__${slot}`,
 * variant `progressBar__${slot}--${key}_${value}`, on the slot the variant
 * styles: `tone` on the root, `size` on the track). The fill width is set
 * inline by Ark from the value, so the recipe never needs a runtime class for
 * it.
 */
const slots = {
  root: 'progressBar__root',
  header: 'progressBar__header',
  label: 'progressBar__label',
  valueText: 'progressBar__valueText',
  track: 'progressBar__track',
  range: 'progressBar__range',
} as const;

const cx = (...classes: Array<string | false | null | undefined>): string =>
  classes.filter(Boolean).join(' ');

export type ProgressBarTone = 'neutral' | 'success' | 'warning' | 'critical';
export type ProgressBarSize = 'sm' | 'md';

export type ProgressBarProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'children' | 'defaultValue'
> & {
  /** Progress on the `min`..`max` scale. Out-of-range values are clamped. */
  value: number;
  /** Defaults to 0. A non-finite `min` is read as 0. */
  min?: number;
  /**
   * Defaults to 100. A non-finite `max`, or one not above `min` (an empty or
   * inverted range, like a total of 0 steps), renders an empty bar.
   */
  max?: number;
  /**
   * Heading shown above the track. It also names the progressbar for
   * assistive tech (a string label still does with the header hidden);
   * without one, pass `aria-label`.
   */
  label?: ReactNode;
  /**
   * The value as words, e.g. "3 of 5 steps". It is both the visible readout
   * and the progressbar's `aria-valuetext`, so a screen reader announces it
   * instead of a bare percentage. When omitted the readout is the percentage
   * and no `aria-valuetext` is set.
   */
  valueText?: string;
  /** Show the header row (label + readout), as on `Meter`. Defaults to true. */
  showHeader?: boolean;
  /** Fill hue via `colorPalette` role tokens. Defaults to `neutral`. */
  tone?: ProgressBarTone;
  /** Track thickness. Defaults to `md`. */
  size?: ProgressBarSize;
};

/**
 * The `value`, `min` and `max` actually handed to Ark, which throws on a
 * non-finite `max` or a value outside the range. A non-finite `min` is read as
 * 0. A non-finite `max`, or one not above `min`, leaves no range to fill, so
 * the bar is drawn empty (over `min`..`min + 100`). Otherwise `value` is
 * clamped into the range, a non-finite one read as `min`.
 */
export function normalizeProgress(
  value: number,
  min: number,
  max: number,
): { value: number; min: number; max: number } {
  const lo = Number.isFinite(min) ? min : 0;
  if (!Number.isFinite(max) || max <= lo) {
    return { value: lo, min: lo, max: lo + 100 };
  }
  const clamped = Number.isFinite(value)
    ? Math.min(Math.max(value, lo), max)
    : lo;
  return { value: clamped, min: lo, max };
}

/**
 * A linear, task-completion `progressbar` over Ark `Progress`, skinned with
 * the `progressBar` slot recipe. Use it for work advancing toward done (a
 * checklist, an upload); for a measurement inside a range, use `Meter`.
 *
 * The unstyled Ark `Progress` stays exported unchanged for consumers that
 * compose it themselves; this is the ready-made styled bar.
 */
export function ProgressBar({
  value,
  min = 0,
  max = 100,
  label,
  valueText,
  showHeader = true,
  tone = 'neutral',
  size = 'md',
  className,
  'aria-label': ariaLabel,
  ...rest
}: ProgressBarProps) {
  const labelId = useId();
  const range = normalizeProgress(value, min, max);
  // The visible label names the bar only while the header renders it.
  const labelled = showHeader && label != null;

  return (
    <ArkProgress.Root
      {...rest}
      className={cx(slots.root, `progressBar__root--tone_${tone}`, className)}
      value={range.value}
      min={range.min}
      max={range.max}
      ids={labelled ? { label: labelId } : undefined}
      data-tone={tone}
      data-size={size}
    >
      {showHeader ? (
        <div className={slots.header} data-part="header">
          {label != null ? (
            <ArkProgress.Label className={slots.label}>
              {label}
            </ArkProgress.Label>
          ) : (
            <span />
          )}
          <ArkProgress.ValueText className={slots.valueText}>
            {valueText}
          </ArkProgress.ValueText>
        </div>
      ) : null}
      <ArkProgress.Track
        className={cx(slots.track, `progressBar__track--size_${size}`)}
        // Ark names the track with its formatted value (`aria-label="60%"`).
        // A visible label takes over through `aria-labelledby`, which wins
        // over `aria-label` in name computation. With the header hidden, a
        // string label names the bar directly, as on `Meter`.
        aria-labelledby={labelled ? labelId : undefined}
        aria-label={
          ariaLabel ??
          (!showHeader && typeof label === 'string' ? label : undefined)
        }
        aria-valuetext={valueText}
      >
        <ArkProgress.Range className={slots.range} />
      </ArkProgress.Track>
    </ArkProgress.Root>
  );
}
