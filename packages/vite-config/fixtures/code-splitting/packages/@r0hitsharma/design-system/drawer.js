import { Dialog } from '@ark-ui/react';

import { Button } from './button.js';

// Reachable only from a lazy route, so it must never load with the entry, and
// neither must the Ark UI code it pulls in.
export function Drawer() {
  return [Button(), Dialog(), 'DS_DRAWER_ONLY_MARKER'];
}
