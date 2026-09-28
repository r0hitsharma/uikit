import { cleanup, render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { CandlestickSeries } from './candlestick.js';
import { XYChart } from './index.js';
import { chartTheme } from './xychart-theme.js';

afterEach(cleanup);

type Candle = {
  x: number | string;
  o: number;
  h: number;
  l: number;
  c: number;
};

const MARGIN = { top: 0, right: 0, bottom: 0, left: 0 };

const renderInChart = (
  xScale: Parameters<typeof XYChart>[0]['xScale'],
  children: ReactNode,
) =>
  render(
    <XYChart
      theme={chartTheme}
      width={200}
      height={100}
      margin={MARGIN}
      xScale={xScale}
      yScale={{ type: 'linear', domain: [0, 10] }}
    >
      {children}
    </XYChart>,
  );

const candles = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-part="candle"]')].map((candle) => {
    const body = candle.querySelector('rect')!;
    const wick = candle.querySelector('line')!;
    const x = Number(body.getAttribute('x'));
    const width = Number(body.getAttribute('width'));
    return {
      bodyX: x,
      bodyWidth: width,
      bodyCentre: x + width / 2,
      wickX: Number(wick.getAttribute('x1')),
    };
  });

const series = (data: Candle[], maxBodyWidth?: number) => (
  <CandlestickSeries<Candle>
    dataKey="ohlc"
    data={data}
    xAccessor={(d) => d.x}
    openAccessor={(d) => d.o}
    highAccessor={(d) => d.h}
    lowAccessor={(d) => d.l}
    closeAccessor={(d) => d.c}
    {...(maxBodyWidth !== undefined && { maxBodyWidth })}
  />
);

describe('CandlestickSeries x placement', () => {
  // On a continuous scale `xScale(value)` is already the datum's own pixel, the
  // point a `LineSeries` or the crosshair draws at. The half-bandwidth offset
  // that centres a candle in a band has no band to centre in here, so any
  // offset puts the candle beside everything else drawn from the same datum.
  it('centres body and wick on the datum x on a linear scale', () => {
    const { container } = renderInChart(
      { type: 'linear', domain: [0, 10] },
      series([
        { x: 2, o: 3, h: 8, l: 1, c: 6 },
        { x: 5, o: 6, h: 9, l: 2, c: 4 },
      ]),
    );

    const [first, second] = candles(container);
    // domain [0, 10] over 200px, no margin: x=2 -> 40px, x=5 -> 100px.
    expect(first!.bodyCentre).toBe(40);
    expect(first!.wickX).toBe(40);
    expect(second!.bodyCentre).toBe(100);
    expect(second!.wickX).toBe(100);
  });

  it('keeps the body width at maxBodyWidth on a continuous scale', () => {
    const { container } = renderInChart(
      { type: 'linear', domain: [0, 10] },
      series([{ x: 5, o: 3, h: 8, l: 1, c: 6 }], 10),
    );

    const [candle] = candles(container);
    expect(candle!.bodyWidth).toBe(10);
    expect(candle!.bodyCentre).toBe(100);
  });

  // A band scale returns the band's LEFT edge, so there the half-bandwidth
  // offset is exactly what centres the candle. Pinned to the pixel so the
  // continuous-scale fix cannot move it.
  it('centres the candle in its band on a band scale, unchanged', () => {
    const { container } = renderInChart(
      { type: 'band', domain: ['a', 'b'], padding: 0 },
      series([
        { x: 'a', o: 3, h: 8, l: 1, c: 6 },
        { x: 'b', o: 6, h: 9, l: 2, c: 4 },
      ]),
    );

    // Two 100px bands; body is min(100 * 0.6, 14) = 14px wide.
    expect(candles(container)).toEqual([
      { bodyX: 43, bodyWidth: 14, bodyCentre: 50, wickX: 50 },
      { bodyX: 143, bodyWidth: 14, bodyCentre: 150, wickX: 150 },
    ]);
  });

  it('clamps the body to 60% of a narrow band', () => {
    const { container } = renderInChart(
      {
        type: 'band',
        domain: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
        padding: 0,
      },
      series([{ x: 'a', o: 3, h: 8, l: 1, c: 6 }]),
    );

    // Ten 20px bands; body is min(20 * 0.6, 14) = 12px, centred at 10px.
    expect(candles(container)).toEqual([
      { bodyX: 4, bodyWidth: 12, bodyCentre: 10, wickX: 10 },
    ]);
  });
});
