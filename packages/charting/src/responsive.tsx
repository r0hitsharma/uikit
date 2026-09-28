import {
  type CSSProperties,
  type ReactNode,
  type RefCallback,
  type RefObject,
  useEffect,
  useState,
} from 'react';

import { useLatest } from './use-latest.js';

/**
 * Fallback width for a renderer with no `ResizeObserver` (jsdom / SSR / the
 * first paint before measurement). `XYChart` needs a pixel width, and a chart
 * in a fluid grid cell has none until measured; this keeps the first render and
 * non-browser renderers from collapsing to zero. Previously every consumer
 * declared its own `FALLBACK_WIDTH` — it belongs here, in the kit.
 */
export const FALLBACK_CHART_WIDTH = 560;

export type ChartDimensions = { width: number; height: number };

export type UseChartDimensionsOptions = {
  /** width ÷ height. Height is derived from the measured width. Default 16/9. */
  aspect?: number;
  /** Floor for the derived height, in px. Default 160. */
  minHeight?: number;
  /** Cap for the derived height, in px. Unset by default. */
  maxHeight?: number;
  /** Width used before measurement / without a `ResizeObserver`. */
  fallbackWidth?: number;
};

const deriveHeight = (
  width: number,
  { aspect = 16 / 9, minHeight = 160, maxHeight }: UseChartDimensionsOptions,
): number => {
  const raw = aspect > 0 ? width / aspect : minHeight;
  const floored = Math.max(minHeight, raw);
  return maxHeight != null ? Math.min(maxHeight, floored) : floored;
};

/**
 * The ref the measuring hooks return: a stable callback ref, so attaching it to
 * an element that mounts later (after a loading state, say) still starts
 * observation, that also carries the attached element as `.current`. It is
 * therefore usable anywhere the `RefObject` these hooks used to return was:
 * pass it to `ref={…}`, or read `ref.current`.
 */
export type MeasuredRef<T extends Element = HTMLDivElement> = RefCallback<T> &
  RefObject<T | null>;

/**
 * Runs `onResize` with the element the returned ref is attached to: once when
 * it attaches, then on every `ResizeObserver` report, and not after it
 * detaches. Observation follows the element rather than the first commit, so a
 * ref that is attached late, detached, or moved to a different node is tracked
 * each time. No-ops without a `ResizeObserver` (jsdom / SSR).
 */
function useResizeObserverRef<T extends Element>(
  onResize: (element: T) => void,
): MeasuredRef<T> {
  const [element, setElement] = useState<T | null>(null);
  const [ref] = useState(() => {
    const attach = (next: T | null) => {
      attach.current = next;
      setElement(next);
    };
    attach.current = null as T | null;
    return attach;
  });
  const onResizeRef = useLatest(onResize);

  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => onResizeRef.current(element);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, onResizeRef]);

  return ref;
}

/**
 * Measures a container's width. Returns a ref to attach to the measured element
 * and the observed width (falling back to `fallbackWidth` before measurement /
 * without a `ResizeObserver`). The element may mount after the component does;
 * observation starts whenever the ref is attached.
 *
 * This is the width-only primitive: a fixed-height or pixel-laid-out chart wants
 * just the width and computes its own height, so it should reach for this rather
 * than {@link useChartDimensions} (which also derives a height it would discard).
 */
export function useContainerWidth(
  fallbackWidth = FALLBACK_CHART_WIDTH,
): [MeasuredRef, number] {
  const [width, setWidth] = useState(fallbackWidth);
  const ref = useResizeObserverRef<HTMLDivElement>((element) => {
    const next = element.clientWidth;
    if (next > 0) setWidth(next);
  });
  return [ref, width];
}

/**
 * Measures a container and derives chart `{ width, height }` from an aspect
 * ratio with a height floor — so a chart sizes to its fluid grid cell instead
 * of a hardcoded pixel height (four oscillating lines in 110px is the failure
 * this prevents). Built on {@link useContainerWidth}; for a fixed-height chart
 * that only needs the width, use that hook directly. Returns a ref to attach to
 * the measured element.
 */
export function useChartDimensions(
  options: UseChartDimensionsOptions = {},
): [MeasuredRef, ChartDimensions] {
  const [ref, width] = useContainerWidth(options.fallbackWidth);
  return [ref, { width, height: deriveHeight(width, options) }];
}

export type ResponsiveChartProps = UseChartDimensionsOptions & {
  /**
   * Render the chart from the measured dimensions, e.g.
   * `{({ width, height }) => <XYChart width={width} height={height}>…</XYChart>}`.
   */
  children: (dimensions: ChartDimensions) => ReactNode;
  className?: string;
  style?: CSSProperties;
};

/**
 * Wraps a single chart, measures its container, and passes pixel
 * `width`/`height` to a render-prop child. Replaces the per-app
 * `useMeasuredWidth` + `plotHeight` + `FALLBACK_WIDTH` scaffolding every
 * consumer otherwise rebuilds to put a pixel-sized `XYChart` in a fluid layout.
 */
export function ResponsiveChart({
  children,
  className,
  style,
  ...options
}: ResponsiveChartProps) {
  const [ref, dimensions] = useChartDimensions(options);
  return (
    <div ref={ref} className={className} style={{ width: '100%', ...style }}>
      {children(dimensions)}
    </div>
  );
}

export type DeriveLeftMarginOptions = {
  /** Minimum gutter, in px. Default 48. */
  floor?: number;
  /** Approximate rendered width of one axis-label character, in px. Default 7.6. */
  charPx?: number;
  /** Tick mark + gap between label and plot, in px. Default 16. */
  gutter?: number;
};

/**
 * The left gutter a value axis needs for its own widest label, derived from the
 * labels it will actually draw. A constant margin is a guess about how long the
 * numbers get, and it is wrong at the extremes — a fixed 56px that fits
 * `$108.6k` clips `$500.0M`. Feed the formatted tick strings (or the formatter
 * applied to the domain extremes) so the gutter fits the real content.
 */
export function deriveLeftMargin(
  labels: Array<string | null | undefined>,
  { floor = 48, charPx = 7.6, gutter = 16 }: DeriveLeftMarginOptions = {},
): number {
  const longest = labels.reduce(
    (max, label) => Math.max(max, (label ?? '').length),
    0,
  );
  return Math.max(floor, Math.ceil(longest * charPx) + gutter);
}
