// The app shell: React, one design-system component and the app's own theme
// are needed up front, and each route is only ever reached through a dynamic
// import.
import { createElement } from 'react';
import { Button } from '@r0hitsharma/design-system';

import { theme } from './design-system/theme.js';

globalThis.app = {
  mount: () => createElement(Button(), theme()),
  routes: {
    drawer: () => import('./drawer-route.js'),
    chart: () => import('./chart-route.js'),
    sparkline: () => import('./sparkline-route.js'),
  },
};
