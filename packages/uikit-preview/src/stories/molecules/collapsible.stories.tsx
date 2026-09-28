import { Collapsible } from '@r0hitsharma/design-system';

import { css } from '../../../styled-system/css';

export default {
  title: 'Molecules/Collapsible',
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

const paragraphClassName = css({
  m: '0',
  fontSize: 'sm',
  lineHeight: 'relaxed',
  color: 'text.muted',
});

// Ark owns the behavior (aria-expanded / aria-controls on the trigger, hiding
// the content); the design-system skin styles each part. The indicator's
// default chevron turns over when the content opens.
export const Closed = () => (
  <div className={frameClassName}>
    <Collapsible.Root>
      <Collapsible.Trigger>
        <Collapsible.Indicator />
        Advanced: SQL
      </Collapsible.Trigger>
      <Collapsible.Content>
        <p className={paragraphClassName}>
          Write the query by hand instead of building it from filters.
        </p>
      </Collapsible.Content>
    </Collapsible.Root>
  </div>
);

export const Open = () => (
  <div className={frameClassName}>
    <Collapsible.Root defaultOpen>
      <Collapsible.Trigger>
        <Collapsible.Indicator />
        What does this filter do?
      </Collapsible.Trigger>
      <Collapsible.Content>
        <p className={paragraphClassName}>
          Rows are kept only when every selected facet matches. Clear a facet to
          widen the result again.
        </p>
      </Collapsible.Content>
    </Collapsible.Root>
  </div>
);

// The indicator can trail the label too, which suits a trigger that reads as a
// link.
export const TrailingIndicator = () => (
  <div className={frameClassName}>
    <Collapsible.Root defaultOpen>
      <Collapsible.Trigger>
        Show details
        <Collapsible.Indicator />
      </Collapsible.Trigger>
      <Collapsible.Content>
        <p className={paragraphClassName}>
          The trailing chevron suits a trigger that reads as a link.
        </p>
      </Collapsible.Content>
    </Collapsible.Root>
  </div>
);

// `disabled` dims the trigger and ignores clicks.
export const Disabled = () => (
  <div className={frameClassName}>
    <Collapsible.Root disabled>
      <Collapsible.Trigger>
        <Collapsible.Indicator />
        Unavailable section
      </Collapsible.Trigger>
      <Collapsible.Content>Never shown.</Collapsible.Content>
    </Collapsible.Root>
  </div>
);
