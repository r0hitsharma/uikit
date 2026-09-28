import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ChartCursorLayer,
  type ChartCursorLayerProps,
} from './cursor-layer.js';
import { LineSeries, XYChart } from './index.js';
import { chartTheme } from './xychart-theme.js';

afterEach(cleanup);

const STOPS = [0, 10, 20, 30, 40];
const SERIES = [{ color: 'chart.series.primary', valueAt: (x: number) => x }];
// XYChart hands its children a placeholder [0, 1] scale until some series
// registers data, so a real series is rendered alongside the layer.
const POINTS = STOPS.map((x) => ({ x, y: x }));

const renderLayer = (
  props: Partial<ChartCursorLayerProps>,
  xDomain: [number, number] = [0, 40],
) => {
  const tooltip = vi.fn(() => null);
  const utils = render(
    <XYChart
      theme={chartTheme}
      width={200}
      height={100}
      margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
      xScale={{ type: 'linear', domain: xDomain }}
      yScale={{ type: 'linear', domain: [0, 40] }}
    >
      <LineSeries
        dataKey="line"
        data={POINTS}
        xAccessor={(d) => d.x}
        yAccessor={(d) => d.y}
      />
      <ChartCursorLayer stops={STOPS} series={SERIES} {...props}>
        {tooltip}
      </ChartCursorLayer>
    </XYChart>,
  );
  const layer = utils.container.querySelector('[data-part="cursor-layer"]')!;
  expect(layer).not.toBeNull();
  return {
    ...utils,
    tooltip,
    hitArea: layer.querySelector('rect')!,
    crosshair: () => layer.querySelector('line'),
  };
};

// A non-finite cursor means "no cursor", whichever way it arrives and whether
// or not the layer snaps: it is never forwarded to `onCursorChange` or
// `onCommit`, and nothing is drawn from it.
describe('ChartCursorLayer with a non-finite cursor', () => {
  it('forwards a finite unsnapped pointer x unchanged', () => {
    const onCursorChange = vi.fn();
    const { hitArea } = renderLayer({ snap: false, onCursorChange });

    fireEvent.pointerMove(hitArea, { clientX: 50 });

    // 50px of 200px over [0, 40]: an unsnapped 10.
    expect(onCursorChange).toHaveBeenLastCalledWith(10);
  });

  it('reports no cursor when an unsnapped pointer x inverts to NaN', () => {
    const onCursorChange = vi.fn();
    // A domain with no usable x: `invert` returns NaN for every pixel.
    const { hitArea } = renderLayer({ snap: false, onCursorChange }, [
      NaN,
      NaN,
    ]);

    fireEvent.pointerMove(hitArea, { clientX: 50 });

    expect(onCursorChange).toHaveBeenLastCalledWith(null);
  });

  it.each([
    [NaN, true],
    [NaN, false],
    [Infinity, true],
    [Infinity, false],
  ])('draws nothing for a controlled %s cursor (snap=%s)', (cursor, snap) => {
    const { crosshair, tooltip } = renderLayer({ snap, cursor });

    expect(crosshair()).toBeNull();
    expect(tooltip).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'draws nothing for a NaN defaultCursor (snap=%s)',
    (snap) => {
      const { crosshair, tooltip } = renderLayer({
        snap,
        defaultCursor: NaN,
      });

      expect(crosshair()).toBeNull();
      expect(tooltip).not.toHaveBeenCalled();
    },
  );

  it.each([true, false])(
    'commits the default stop, not NaN, on Enter from a controlled NaN cursor (snap=%s)',
    (snap) => {
      const onCursorChange = vi.fn();
      const onCommit = vi.fn();
      const { hitArea } = renderLayer({
        snap,
        cursor: NaN,
        onCursorChange,
        onCommit,
      });

      fireEvent.keyDown(hitArea, { key: 'Enter' });

      expect(onCursorChange).toHaveBeenLastCalledWith(0);
      expect(onCommit).toHaveBeenLastCalledWith(0);
    },
  );

  it.each([true, false])(
    'commits the default stop, not NaN, on Enter from a NaN defaultCursor (snap=%s)',
    (snap) => {
      const onCursorChange = vi.fn();
      const onCommit = vi.fn();
      const { hitArea } = renderLayer({
        snap,
        defaultCursor: NaN,
        onCursorChange,
        onCommit,
      });

      fireEvent.keyDown(hitArea, { key: 'Enter' });

      expect(onCursorChange).toHaveBeenLastCalledWith(0);
      expect(onCommit).toHaveBeenLastCalledWith(0);
    },
  );

  it('steps from the default stop, not NaN, on an arrow key', () => {
    const onCursorChange = vi.fn();
    const { hitArea } = renderLayer({
      snap: false,
      cursor: NaN,
      onCursorChange,
    });

    fireEvent.keyDown(hitArea, { key: 'ArrowRight' });

    expect(onCursorChange).toHaveBeenLastCalledWith(10);
  });
});
