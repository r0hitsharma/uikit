// The only importer of the design system's drawer subpath, and of geo-lib.
import { Drawer } from '@r0hitsharma/design-system/drawer';
import { project } from 'geo-lib';

export default function DrawerRoute() {
  return [Drawer(), project(0)];
}
