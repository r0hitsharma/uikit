// The app shell: React and one design-system component are needed up front,
// and each route is only ever reached through a dynamic import.
import { createElement } from 'react';
import { Button } from '@r0hitsharma/design-system';

globalThis.app = {
  mount: () => createElement(Button()),
  routes: {
    drawer: () => import('./drawer-route.js'),
    chart: () => import('./chart-route.js'),
  },
};
