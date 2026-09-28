import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { resolveChartColor } from './chart-color.js';
import { ChartLegend, type ChartLegendItem, Swatch } from './legend.js';

afterEach(cleanup);

describe('Swatch', () => {
  it('renders a filled rect for the default "swatch" shape', () => {
    const { container } = render(
      <Swatch shape="swatch" color="chart.series.primary" />,
    );
    const rect = container.querySelector('rect');
    expect(rect).not.toBeNull();
    expect(rect?.getAttribute('fill')).toBe(
      resolveChartColor('chart.series.primary'),
    );
    expect(container.querySelector('line')).toBeNull();
  });

  it('renders a stroked line for the "line" shape', () => {
    const { container } = render(
      <Swatch shape="line" color="chart.series.secondary" />,
    );
    const line = container.querySelector('line');
    expect(line).not.toBeNull();
    expect(line?.getAttribute('stroke')).toBe(
      resolveChartColor('chart.series.secondary'),
    );
    expect(container.querySelector('rect')).toBeNull();
  });

  it('dashes the line swatch when dash is true', () => {
    const { container } = render(
      <Swatch shape="line" color="chart.series.primary" dash />,
    );
    expect(
      container.querySelector('line')?.getAttribute('stroke-dasharray'),
    ).toBe('3 2');
  });
});

const FIVE: ChartLegendItem[] = [
  'Alpha',
  'Bravo',
  'Charlie',
  'Delta',
  'Echo',
].map((label) => ({ label, color: 'chart.series.primary' }));

describe('ChartLegend maxItems', () => {
  it('renders every item when unset', () => {
    render(<ChartLegend items={FIVE} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.queryByText(/more$/)).toBeNull();
  });

  it('truncates to maxItems and names the rest in a "+n more" entry', () => {
    render(<ChartLegend items={FIVE} maxItems={3} />);
    const entries = screen.getAllByRole('listitem');
    expect(entries.map((entry) => entry.textContent)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
      '+2 more',
    ]);
    expect(entries[3]?.getAttribute('title')).toBe('Delta, Echo');
  });

  it('adds no entry when maxItems covers every item', () => {
    render(<ChartLegend items={FIVE} maxItems={5} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('truncates the interactive form too, leaving the overflow untoggleable', () => {
    render(<ChartLegend items={FIVE} maxItems={2} interactive />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(screen.getByText('+3 more').tagName).toBe('SPAN');
  });
});

/** Just enough of `ResizeObserver` for a test to fire a report by hand. */
class StubResizeObserver {
  static instances: StubResizeObserver[] = [];
  readonly observed = new Set<Element>();
  readonly #callback: () => void;

  constructor(callback: () => void) {
    this.#callback = callback;
    StubResizeObserver.instances.push(this);
  }

  observe(target: Element): void {
    this.observed.add(target);
  }

  unobserve(target: Element): void {
    this.observed.delete(target);
  }

  disconnect(): void {
    this.observed.clear();
  }

  trigger(): void {
    this.#callback();
  }
}

describe('ChartLegend onHeightChange', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    StubResizeObserver.instances = [];
  });

  /** jsdom lays nothing out, so the legend's height is stubbed on the node. */
  const setHeight = (element: HTMLElement, height: number) =>
    Object.defineProperty(element, 'offsetHeight', {
      configurable: true,
      value: height,
    });

  it('reports the height when the legend lays out and when it wraps', () => {
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    const onHeightChange = vi.fn();
    render(<ChartLegend items={FIVE} onHeightChange={onHeightChange} />);
    // jsdom's unmeasured box reads 0 on the first report.
    expect(onHeightChange).toHaveBeenLastCalledWith(0);

    const legend = screen.getByRole('list');
    const [observer] = StubResizeObserver.instances;
    expect(observer?.observed.has(legend)).toBe(true);

    setHeight(legend, 42);
    act(() => observer?.trigger());
    expect(onHeightChange).toHaveBeenLastCalledWith(42);

    // A report that did not change the height is not passed on.
    const calls = onHeightChange.mock.calls.length;
    act(() => observer?.trigger());
    expect(onHeightChange).toHaveBeenCalledTimes(calls);
  });

  it('observes nothing without a listener', () => {
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    render(<ChartLegend items={FIVE} />);
    expect(StubResizeObserver.instances).toHaveLength(0);
  });

  it('stops observing when the legend unmounts', () => {
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    const { unmount } = render(
      <ChartLegend items={FIVE} interactive onHeightChange={() => {}} />,
    );
    const [observer] = StubResizeObserver.instances;
    expect(observer?.observed.size).toBe(1);
    unmount();
    expect(observer?.observed.size).toBe(0);
  });
});
