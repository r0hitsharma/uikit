import { type RefObject, useEffect, useRef } from 'react';

import { resolveChartColor, type ChartColor } from './chart-color.js';
import { useResizeObserverRef } from './responsive.js';
import { chartTokens } from './theme.js';

export type ChartLegendItem = {
  label: string;
  /**
   * Swatch color. Prefer a token name (`'chart.series.primary'`); a raw CSS
   * color string also works, which is what `useIdentityPalette` returns.
   */
  color: ChartColor;
  /**
   * Stable identity for interaction callbacks. Defaults to `label` when
   * omitted, so a legend built from unique labels needs no explicit id.
   */
  id?: string;
  /** When true, renders dimmed with a struck-through label (a toggled-off series). */
  hidden?: boolean;
  /** When true, renders the label bolder to emphasize this series. */
  emphasis?: boolean;
  /** When true and `shape="line"`, renders the line swatch dashed. */
  dash?: boolean;
  /** Small trailing note, e.g. a unit or a last value. */
  note?: string;
  /** Small trailing badge, e.g. a count or a status tag. */
  badge?: string;
};

export type ChartLegendProps = {
  items: ChartLegendItem[];
  /** Swatch shape. Defaults to a filled square; `'line'` suits line/area series. */
  shape?: 'swatch' | 'line';
  /**
   * When true, each item becomes a focusable `<button>` (a toggle), enabling
   * `onToggle`/`onHover`. When false (the default), the legend is a static
   * `role="list"` with identical markup to before this option existed —
   * fully backward compatible.
   */
  interactive?: boolean;
  /** Fires with an item's id when it is clicked (interactive only). */
  onToggle?: (id: string) => void;
  /**
   * Fires with an item's id on pointer/focus enter, and `null` on leave/blur
   * (interactive only). Pair with `useHighlightedKey` to emphasize a series
   * across a synced chart group.
   */
  onHover?: (id: string | null) => void;
  /**
   * Render each item's label in its swatch color (a colored-label legend)
   * instead of the default muted label color. Off by default. Works in both the
   * static and interactive forms.
   */
  colorLabel?: boolean;
  /**
   * Render at most this many items, followed by a "+n more" entry naming the
   * rest in its tooltip. The legend wraps onto as many rows as its width needs,
   * so on a narrow host the item count is what bounds its height.
   *
   * A fractional value rounds down and a negative one counts as `0` (every
   * item collapses into "+n more"). Unset, `NaN` or `Infinity` renders every
   * item. In the interactive form, items with `hidden: true` are exempt and
   * always render, so a toggled-off series can always be toggled back on; the
   * cap applies to the remaining items.
   */
  maxItems?: number;
  /**
   * Fires with the legend's rendered height in px when it lays out, again
   * whenever that height changes (a wrap onto another row, a longer label),
   * and with `0` when the legend stops rendering (for example `items` becomes
   * empty). A newly attached listener receives the current height straight
   * away. The height is not fixed: it depends on the item count and the width
   * the host grants, so a host that shares a height budget between the legend
   * and the plot should subtract this rather than reserve a constant. Needs a
   * `ResizeObserver`.
   */
  onHeightChange?: (height: number) => void;
};

/**
 * `maxItems` as a count: a finite value floored and clamped at `0`, anything
 * else (unset, `NaN`, `Infinity`) meaning no cap.
 */
function itemCap(maxItems: number | undefined): number {
  return maxItems != null && Number.isFinite(maxItems)
    ? Math.max(0, Math.floor(maxItems))
    : Infinity;
}

type HeightReport = {
  element: Element;
  listener: (height: number) => void;
  height: number;
};

/**
 * Passes `height` to `listener` unless this exact element/listener pair was
 * last told the same height. A new element or a new listener therefore always
 * gets its initial value, while repeat reports of an unchanged box are dropped.
 */
function reportHeight(
  last: RefObject<HeightReport | null>,
  element: Element,
  listener: ((height: number) => void) | undefined,
  height: number,
) {
  if (!listener) return;
  const previous = last.current;
  if (
    previous &&
    previous.element === element &&
    previous.listener === listener &&
    previous.height === height
  ) {
    return;
  }
  last.current = { element, listener, height };
  listener(height);
}

/** Resolves an item's interaction identity, falling back to its label. */
function itemId(item: ChartLegendItem): string {
  return item.id ?? item.label;
}

export type SwatchProps = {
  shape: 'swatch' | 'line';
  color: ChartColor;
  dash?: boolean;
};

/**
 * The small swatch SVG (a filled rect, or a line for line/area series) used by
 * `ChartLegend`'s item renderers. Exported standalone so a hand-composed
 * legend or interactive-legend binding can reuse the same themed swatch
 * markup instead of re-deriving it — see DESIGN.md's guidance on composing
 * from `Swatch` rather than growing `ChartLegend` itself.
 */
export function Swatch({ shape, color, dash }: SwatchProps) {
  const resolved = resolveChartColor(color);
  return (
    <svg width={14} height={14} aria-hidden="true">
      {shape === 'line' ? (
        <line
          x1={0}
          y1={7}
          x2={14}
          y2={7}
          stroke={resolved}
          strokeWidth={2}
          strokeDasharray={dash ? '3 2' : undefined}
        />
      ) : (
        <rect x={1} y={1} width={12} height={12} rx={2} fill={resolved} />
      )}
    </svg>
  );
}

/** Trailing `note`/`badge` text shared by both renderers. */
function Trailing({ note, badge }: { note?: string; badge?: string }) {
  return (
    <>
      {note ? <span style={{ fontSize: 11, opacity: 0.7 }}>{note}</span> : null}
      {badge ? (
        <span
          style={{
            fontSize: 11,
            padding: '0 4px',
            borderRadius: 4,
            background: 'currentColor',
            color: chartTokens.surface,
          }}
        >
          {badge}
        </span>
      ) : null}
    </>
  );
}

/**
 * The "+n more" entry `maxItems` appends. Plain text in both forms: the items
 * it stands for are not rendered, so there is nothing for it to toggle. The
 * hidden labels are its tooltip.
 */
function MoreItems({
  overflow,
  listItem = false,
}: {
  overflow: ChartLegendItem[];
  listItem?: boolean;
}) {
  if (overflow.length === 0) return null;
  return (
    <span
      role={listItem ? 'listitem' : undefined}
      title={overflow.map((item) => item.label).join(', ')}
      style={{ opacity: 0.7 }}
    >
      +{overflow.length} more
    </span>
  );
}

/**
 * A provided, token-themed legend for `XYChart` series. Previously this
 * pattern was hand-rolled per-story (see the charting audit); it now lives in
 * the package so consumers get one consistent legend instead of re-deriving
 * swatch markup each time.
 *
 * This component renders plain inline SVG/HTML (no Panda dependency — the
 * charting package does not depend on the design system for styling); wrap it
 * in design-system typography classes from the consuming app if you need to
 * match surrounding text styles exactly.
 *
 * By default the legend is a static `role="list"`. Pass `interactive` to make
 * each item a focusable toggle button (with `onToggle`/`onHover`), for
 * show/hide and cross-highlight behavior.
 */
export function ChartLegend({
  items,
  shape = 'swatch',
  interactive = false,
  onToggle,
  onHover,
  colorLabel = false,
  maxItems,
  onHeightChange,
}: ChartLegendProps) {
  const reported = useRef<HeightReport | null>(null);
  const measuredRef = useResizeObserverRef<HTMLDivElement>(
    (element) =>
      reportHeight(reported, element, onHeightChange, element.offsetHeight),
    () => {
      // The legend stopped rendering: it now takes no height, and whatever
      // attaches next starts fresh.
      onHeightChange?.(0);
      reported.current = null;
    },
  );
  // Only observe when someone is listening; otherwise leave the node alone.
  const ref = onHeightChange ? measuredRef : undefined;

  // A listener swapped in while the legend stays mounted gets no observer
  // report until the box changes, so hand it the current height here.
  useEffect(() => {
    const element = measuredRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    reportHeight(reported, element, onHeightChange, element.offsetHeight);
  }, [measuredRef, onHeightChange]);

  if (items.length === 0) return null;

  const cap = itemCap(maxItems);
  const shown: ChartLegendItem[] = [];
  const overflow: ChartLegendItem[] = [];
  let counted = 0;
  for (const item of items) {
    if (interactive && item.hidden) shown.push(item);
    else if (counted++ < cap) shown.push(item);
    else overflow.push(item);
  }

  const containerStyle = {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    alignItems: 'center',
    fontSize: 13,
    color: chartTokens.label,
  } as const;

  if (interactive) {
    return (
      <div ref={ref} style={containerStyle}>
        {shown.map((item) => {
          const id = itemId(item);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={!item.hidden}
              onClick={() => onToggle?.(id)}
              onMouseEnter={() => onHover?.(id)}
              onMouseLeave={() => onHover?.(null)}
              onFocus={() => onHover?.(id)}
              onBlur={() => onHover?.(null)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                margin: 0,
                padding: 0,
                border: 'none',
                background: 'none',
                font: 'inherit',
                color: 'inherit',
                cursor: 'pointer',
                opacity: item.hidden ? 0.45 : 1,
              }}
            >
              <Swatch shape={shape} color={item.color} dash={item.dash} />
              <span
                style={{
                  textDecoration: item.hidden ? 'line-through' : undefined,
                  fontWeight: item.emphasis ? 700 : undefined,
                  color: colorLabel ? resolveChartColor(item.color) : undefined,
                }}
              >
                {item.label}
              </span>
              <Trailing note={item.note} badge={item.badge} />
            </button>
          );
        })}
        <MoreItems overflow={overflow} />
      </div>
    );
  }

  // Static legend: markup is intentionally identical to the pre-interactive
  // version (a `role="list"` of plain spans), so existing consumers are
  // unaffected. The `hidden`/`emphasis`/`note`/`badge` affordances apply only
  // to the interactive branch above.
  return (
    <div ref={ref} role="list" aria-label="Chart legend" style={containerStyle}>
      {shown.map((item) => (
        <span
          key={itemId(item)}
          role="listitem"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Swatch shape={shape} color={item.color} dash={item.dash} />
          {colorLabel ? (
            <span style={{ color: resolveChartColor(item.color) }}>
              {item.label}
            </span>
          ) : (
            item.label
          )}
        </span>
      ))}
      <MoreItems overflow={overflow} listItem />
    </div>
  );
}
