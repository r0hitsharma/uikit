import { Button } from './button.js';

// Reachable only from a lazy route, so it must never load with the entry.
export function Drawer() {
  return [Button(), 'DS_DRAWER_ONLY_MARKER'];
}
