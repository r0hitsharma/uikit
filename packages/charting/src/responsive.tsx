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
 * first paint before measurement, or before the measured element mounts).
 * `XYChart` needs a pixel width, and a chart in a fluid grid cell has none
 * until measured; this keeps the first render and non-browser renderers from
 * collapsing to zero. Previously every consumer
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
 * The ref the measuring hooks return: a stable callback ref that also exposes
 * the attached element as `.current`. Observation follows whatever element it
 * holds, however it got there: pass it straight to `ref={…}`, or assign
 * `ref.current` from a merged callback ref, and either way the element is
 * measured from the moment it attaches until it detaches, including one that
 * mounts after the component does.
 */
type MeasuredRef<T extends Element = HTMLDivElement> = RefCallback<T> &
  RefObject<T | null>;

/**
 * Runs `onResize` with the element the returned ref holds: once when it
 * attaches, then on every `ResizeObserver` report, and not after it detaches.
 * `onDetach` runs when the ref is cleared (the element unmounted) rather than
 * moved to another node. Calling the ref and assigning its `.current` are the
 * same operation, so an element attached late, detached, or moved to a
 * different node is tracked each time. No-ops without a `ResizeObserver`
 * (jsdom / SSR).
 *
 * Internal: shared by the measuring hooks here and `ChartLegend`'s
 * `onHeightChange`, not re-exported from the package barrels.
 */
export function useResizeObserverRef<T extends Element>(
  onResize: (element: T) => void,
  onDetach?: () => void,
): MeasuredRef<T> {
  const [element, setElement] = useState<T | null>(null);
  const [ref] = useState(() => {
    let current: T | null = null;
    const attach = (next: T | null) => {
      current = next;
      setElement(next);
    };
    return Object.defineProperty(attach, 'current', {
      get: () => current,
      set: attach,
      enumerable: true,
    }) as MeasuredRef<T>;
  });
  const onResizeRef = useLatest(onResize);
  const onDetachRef = useLatest(onDetach);

  useEffect(() => {
    if (!element || typeof ResizeObserver === 'undefined') return;
    const measure = () => onResizeRef.current(element);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
      // A cleanup also runs when the ref moves to a new node, or for
      // StrictMode's simulated unmount; only an emptied ref is a detach.
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- the live value is the point: it tells a real detach from a move
      if (ref.current === null) onDetachRef.current?.();
    };
  }, [element, onResizeRef, onDetachRef, ref]);

  return ref;
}

/**
 * Measures a container's width. Returns a {@link MeasuredRef} to attach to the
 * measured element and the observed width. The width is `fallbackWidth` until
 * the element has been measured (before it mounts, or without a
 * `ResizeObserver`), and keeps its last measured value after the element
 * detaches. A report of zero width (a collapsed or `display: none` container)
 * is ignored rather than collapsing the chart.
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
