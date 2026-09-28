import { act, cleanup, render, screen } from '@testing-library/react';
import { StrictMode, useEffect, useRef } from 'react';
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  FALLBACK_CHART_WIDTH,
  ResponsiveChart,
  useChartDimensions,
  useContainerWidth,
} from './responsive.js';

/**
 * jsdom ships no `ResizeObserver` and lays nothing out, so both halves are
 * driven by hand: a stub observer that records what it watches, and a
 * `clientWidth` read from a `data-width` attribute the test sets.
 */
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

const originalResizeObserver = globalThis.ResizeObserver;
const clientWidth = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'clientWidth',
);

beforeAll(() => {
  globalThis.ResizeObserver =
    StubResizeObserver as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return Number(this.dataset.width ?? 0);
    },
  });
});

afterAll(() => {
  globalThis.ResizeObserver = originalResizeObserver;
  if (clientWidth) {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
  }
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  StubResizeObserver.instances = [];
});

const watching = (element: Element) =>
  StubResizeObserver.instances.filter((o) => o.observed.has(element));

const liveObservers = () =>
  StubResizeObserver.instances.filter((o) => o.observed.size > 0);

/** A widget that renders an empty state first and its container later. */
function Widget({ loading }: { loading: boolean }) {
  const [ref, width] = useContainerWidth();
  if (loading) return <p data-testid="width">{width}</p>;
  return (
    <div ref={ref} data-testid="container" data-width="1054">
      <p data-testid="width">{width}</p>
    </div>
  );
}

describe('useContainerWidth', () => {
  it('measures a container that mounts after the first commit', () => {
    const { rerender } = render(<Widget loading />);
    expect(screen.getByTestId('width').textContent).toBe(
      String(FALLBACK_CHART_WIDTH),
    );
    expect(StubResizeObserver.instances).toHaveLength(0);

    rerender(<Widget loading={false} />);
    const container = screen.getByTestId('container');
    expect(watching(container)).toHaveLength(1);
    expect(screen.getByTestId('width').textContent).toBe('1054');
  });

  it('tracks later resizes of the attached element', () => {
    render(<Widget loading={false} />);
    const container = screen.getByTestId('container');
    container.dataset.width = '640';
    act(() => watching(container)[0]!.trigger());
    expect(screen.getByTestId('width').textContent).toBe('640');
  });

  it('stops observing when the element detaches', () => {
    const { rerender } = render(<Widget loading={false} />);
    const container = screen.getByTestId('container');
    expect(watching(container)).toHaveLength(1);
    rerender(<Widget loading />);
    expect(watching(container)).toHaveLength(0);
    // The last measurement is kept rather than snapping back to the fallback.
    expect(screen.getByTestId('width').textContent).toBe('1054');
  });

  it('keeps the previous width when a report reads zero', () => {
    render(<Widget loading={false} />);
    const container = screen.getByTestId('container');
    container.dataset.width = '0';
    act(() => watching(container)[0]!.trigger());
    expect(screen.getByTestId('width').textContent).toBe('1054');
  });

  it('follows the ref when it moves to a new node', () => {
    function Moving({ node }: { node: 'a' | 'b' }) {
      const [ref, width] = useContainerWidth();
      return (
        <>
          <p data-testid="width">{width}</p>
          {node === 'a' ? (
            <div key="a" ref={ref} data-testid="a" data-width="300" />
          ) : (
            <div key="b" ref={ref} data-testid="b" data-width="700" />
          )}
        </>
      );
    }
    const { rerender } = render(<Moving node="a" />);
    const a = screen.getByTestId('a');
    expect(screen.getByTestId('width').textContent).toBe('300');

    rerender(<Moving node="b" />);
    const b = screen.getByTestId('b');
    expect(watching(a)).toHaveLength(0);
    expect(watching(b)).toHaveLength(1);
    expect(liveObservers()).toHaveLength(1);
    expect(screen.getByTestId('width').textContent).toBe('700');
  });

  it('observes an element assigned through ref.current by a merged ref', () => {
    function Merged() {
      const [ref, width] = useContainerWidth();
      const other = useRef<HTMLDivElement | null>(null);
      return (
        <div
          ref={(node) => {
            ref.current = node;
            other.current = node;
          }}
          data-testid="merged"
          data-width="820"
        >
          <p data-testid="width">{width}</p>
        </div>
      );
    }
    render(<Merged />);
    const merged = screen.getByTestId('merged');
    expect(watching(merged)).toHaveLength(1);
    expect(screen.getByTestId('width').textContent).toBe('820');

    merged.dataset.width = '410';
    act(() => watching(merged)[0]!.trigger());
    expect(screen.getByTestId('width').textContent).toBe('410');
  });

  it('keeps the fallback width without a ResizeObserver', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    expect(() => render(<Widget loading={false} />)).not.toThrow();
    expect(screen.getByTestId('width').textContent).toBe(
      String(FALLBACK_CHART_WIDTH),
    );
  });

  it('leaves exactly one live observer under StrictMode', () => {
    render(
      <StrictMode>
        <Widget loading={false} />
      </StrictMode>,
    );
    const container = screen.getByTestId('container');
    expect(liveObservers()).toHaveLength(1);
    expect(watching(container)).toHaveLength(1);
    expect(screen.getByTestId('width').textContent).toBe('1054');
  });

  it('keeps the attached element readable as ref.current', () => {
    type Ref = ReturnType<typeof useContainerWidth>[0];
    const seen: Ref[] = [];
    function Probe({ show }: { show: boolean }) {
      const [ref] = useContainerWidth();
      useEffect(() => {
        seen.push(ref);
      });
      return show ? <div ref={ref} data-testid="probe" /> : null;
    }
    const { rerender } = render(<Probe show={false} />);
    expect(seen[0]?.current).toBeNull();
    rerender(<Probe show />);
    // One stable ref across renders, now pointing at the mounted element.
    expect(new Set(seen).size).toBe(1);
    expect(seen[0]?.current).toBe(screen.getByTestId('probe'));
  });
});

describe('useChartDimensions', () => {
  it('derives the height from a late-mounted container', () => {
    function Chart({ loading }: { loading: boolean }) {
      const [ref, { width, height }] = useChartDimensions({ aspect: 2 });
      if (loading) return null;
      return (
        <div ref={ref} data-width="800">
          <p data-testid="size">{`${width}x${height}`}</p>
        </div>
      );
    }
    const { rerender } = render(<Chart loading />);
    rerender(<Chart loading={false} />);
    expect(screen.getByTestId('size').textContent).toBe('800x400');
  });
});

describe('ResponsiveChart', () => {
  it('observes a container that mounts late and tracks its resizes', () => {
    function Card({ loading }: { loading: boolean }) {
      if (loading) return null;
      return (
        <ResponsiveChart aspect={2}>
          {({ width, height }) => (
            <p data-testid="size">{`${width}x${height}`}</p>
          )}
        </ResponsiveChart>
      );
    }
    const { rerender } = render(<Card loading />);
    expect(StubResizeObserver.instances).toHaveLength(0);

    rerender(<Card loading={false} />);
    const wrapper = screen.getByTestId('size').parentElement!;
    expect(watching(wrapper)).toHaveLength(1);
    // Unlaid-out (zero width) on attach, so the fallback holds until a report.
    expect(screen.getByTestId('size').textContent).toBe(
      `${FALLBACK_CHART_WIDTH}x${FALLBACK_CHART_WIDTH / 2}`,
    );

    wrapper.dataset.width = '600';
    act(() => watching(wrapper)[0]!.trigger());
    expect(screen.getByTestId('size').textContent).toBe('600x300');
  });
});
