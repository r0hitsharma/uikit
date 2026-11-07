import { LinePath } from '@visx/shape';

// A lighter subpath that must not wait on the xychart code.
export function Sparkline() {
  return [LinePath(), 'PRIMITIVES_MARKER'];
}
