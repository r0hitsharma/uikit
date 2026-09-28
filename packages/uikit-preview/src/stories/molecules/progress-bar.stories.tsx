import { ProgressBar } from '@r0hitsharma/design-system';

import { css } from '../../../styled-system/css';

export default {
  title: 'Molecules/ProgressBar',
};

const frameClassName = css({
  display: 'grid',
  gap: '6',
  p: '6',
  maxWidth: '480px',
  backgroundColor: 'surface.canvas',
  fontFamily: 'sans',
  color: 'text.default',
});

// A task advancing toward done (role="progressbar"), distinct from Meter's
// measurement inside a range. `valueText` is both the readout and the
// aria-valuetext, so "3 of 5" is what a screen reader announces.
export const StepsOfTotal = () => (
  <div className={frameClassName}>
    <ProgressBar
      label="Getting started"
      value={3}
      max={5}
      valueText="3 of 5 done"
    />
  </div>
);

// Without `valueText` the readout is Ark's formatted percentage.
export const Percentage = () => (
  <div className={frameClassName}>
    <ProgressBar label="Upload" value={40} />
  </div>
);

export const Tones = () => (
  <div className={frameClassName}>
    <ProgressBar label="Neutral" value={30} />
    <ProgressBar label="Success" value={100} tone="success" />
    <ProgressBar label="Warning" value={70} tone="warning" />
    <ProgressBar label="Critical" value={90} tone="critical" />
  </div>
);

// `sm` thins the track; with no label, name the bar with aria-label.
export const SmallWithoutHeader = () => (
  <div className={frameClassName}>
    <ProgressBar
      aria-label="Sync progress"
      value={55}
      size="sm"
      showHeader={false}
    />
  </div>
);
