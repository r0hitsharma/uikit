import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  // jsdom lays nothing out, so every element reports this height.
  let laidOutHeight = 0;
  const offsetHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'offsetHeight',
  );

  beforeEach(() => {
    laidOutHeight = 0;
    vi.stubGlobal('ResizeObserver', StubResizeObserver);
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get: () => laidOutHeight,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    StubResizeObserver.instances = [];
    if (offsetHeight) {
      Object.defineProperty(
        HTMLElement.prototype,
        'offsetHeight',
        offsetHeight,
      );
    }
  });

  const liveObservers = () =>
    StubResizeObserver.instances.filter((o) => o.observed.size > 0);

  const resize = (height: number) => {
    laidOutHeight = height;
    act(() => {
      for (const observer of liveObservers()) observer.trigger();
    });
  };

  it('reports the laid-out height exactly once, then each change', () => {
    laidOutHeight = 20;
    const onHeightChange = vi.fn();
    render(<ChartLegend items={FIVE} onHeightChange={onHeightChange} />);
    expect(onHeightChange.mock.calls).toEqual([[20]]);

    const legend = screen.getByRole('list');
    expect(liveObservers()).toHaveLength(1);
    expect(liveObservers()[0]!.observed.has(legend)).toBe(true);

    resize(42);
    expect(onHeightChange.mock.calls).toEqual([[20], [42]]);

    // A report that did not change the height is not passed on.
    resize(42);
    expect(onHeightChange).toHaveBeenCalledTimes(2);
  });

  it('reports 0 when the legend stops rendering', () => {
    laidOutHeight = 20;
    const onHeightChange = vi.fn();
    const { rerender } = render(
      <ChartLegend items={FIVE} onHeightChange={onHeightChange} />,
    );
    rerender(<ChartLegend items={[]} onHeightChange={onHeightChange} />);
    expect(onHeightChange).toHaveBeenLastCalledWith(0);
    expect(liveObservers()).toHaveLength(0);

    // Rendering again at the same height reports it afresh.
    rerender(<ChartLegend items={FIVE} onHeightChange={onHeightChange} />);
    expect(onHeightChange.mock.calls).toEqual([[20], [0], [20]]);
  });

  it('reports the current height to a listener that is removed and re-added', () => {
    laidOutHeight = 20;
    const onHeightChange = vi.fn();
    const { rerender } = render(
      <ChartLegend items={FIVE} onHeightChange={onHeightChange} />,
    );
    rerender(<ChartLegend items={FIVE} />);
    expect(liveObservers()).toHaveLength(0);
    rerender(<ChartLegend items={FIVE} onHeightChange={onHeightChange} />);
    expect(onHeightChange.mock.calls).toEqual([[20], [20]]);
    expect(liveObservers()).toHaveLength(1);
  });

  it('hands a swapped-in listener the current height, and stops calling the old one', () => {
    laidOutHeight = 20;
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <ChartLegend items={FIVE} onHeightChange={first} />,
    );
    rerender(<ChartLegend items={FIVE} onHeightChange={second} />);
    expect(second.mock.calls).toEqual([[20]]);
    expect(liveObservers()).toHaveLength(1);
    expect(StubResizeObserver.instances).toHaveLength(1);

    resize(42);
    expect(first.mock.calls).toEqual([[20]]);
    expect(second.mock.calls).toEqual([[20], [42]]);
  });

  it('observes nothing without a listener', () => {
    render(<ChartLegend items={FIVE} />);
    expect(StubResizeObserver.instances).toHaveLength(0);
  });

  it('stops observing when the legend unmounts', () => {
    const { unmount } = render(
      <ChartLegend items={FIVE} interactive onHeightChange={() => {}} />,
    );
    expect(liveObservers()).toHaveLength(1);
    unmount();
    expect(liveObservers()).toHaveLength(0);
  });
});
