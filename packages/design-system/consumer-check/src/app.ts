import { css } from '../styled-system/css';

// One `css()` call on design-system semantic tokens and Panda base scales, so
// the check extracts consumer utilities as well as the static recipe CSS.
export const panel = css({
  bg: 'surface.default',
  color: 'text.default',
  borderColor: 'border.default',
  p: '4',
  rounded: 'md',
});
