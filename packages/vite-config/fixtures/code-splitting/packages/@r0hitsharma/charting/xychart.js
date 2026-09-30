import { Button } from '@r0hitsharma/design-system';
import { XYChartBase } from '@visx/xychart';

// Charting builds on the design system, as the real package does.
export function XYChart() {
  return [Button(), XYChartBase(), 'XYCHART_MARKER'];
}
