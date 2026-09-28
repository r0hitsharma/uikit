import { Collapsible as ArkCollapsible } from '@ark-ui/react/collapsible';
import { ChevronDown } from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';

/**
 * Class names emitted by the `collapsible` slot recipe (registered in the
 * preset). The design-system package builds with `tsc` and ships no generated
 * `styled-system`, so the recipe is applied by its stable slot class names
 * (Panda convention: `${className}__${slot}`). The recipe must be added to
 * `staticCss` so these classes are always generated. Behavior (open state,
 * `aria-expanded` / `aria-controls` on the trigger, hiding the content, lazy
 * mounting) comes from Ark; this file only skins it.
 */
const slots = {
  root: 'collapsible__root',
  trigger: 'collapsible__trigger',
  indicator: 'collapsible__indicator',
  content: 'collapsible__content',
} as const;

const cx = (...classes: Array<string | false | null | undefined>): string =>
  classes.filter(Boolean).join(' ');

function CollapsibleRoot({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof ArkCollapsible.Root>) {
  return (
    <ArkCollapsible.Root {...props} className={cx(slots.root, className)} />
  );
}

function CollapsibleTrigger({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof ArkCollapsible.Trigger>) {
  return (
    <ArkCollapsible.Trigger
      {...props}
      className={cx(slots.trigger, className)}
    />
  );
}

/**
 * The open/closed affordance, meant to sit inside `Trigger`. With no children
 * it renders a chevron that turns over when the content opens; pass children
 * to use a different glyph (the rotation still applies).
 */
function CollapsibleIndicator({
  className,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof ArkCollapsible.Indicator>) {
  return (
    <ArkCollapsible.Indicator
      {...props}
      className={cx(slots.indicator, className)}
    >
      {children ?? <ChevronDown size={16} aria-hidden="true" />}
    </ArkCollapsible.Indicator>
  );
}

function CollapsibleContent({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof ArkCollapsible.Content>) {
  return (
    <ArkCollapsible.Content
      {...props}
      className={cx(slots.content, className)}
    />
  );
}

/**
 * Progressive disclosure skinned with the `collapsible` slot recipe: a trigger
 * that shows and hides a region of content. Composition mirrors Ark:
 * `Root` > `Trigger` (usually wrapping an `Indicator` and a label) and
 * `Content`. Everything `Root` accepts is Ark's, forwarded unchanged: `open` /
 * `defaultOpen` / `onOpenChange`, `disabled`, and `lazyMount` /
 * `unmountOnExit`. `Context` exposes the open state as a render prop.
 */
export const Collapsible = {
  Root: CollapsibleRoot,
  Trigger: CollapsibleTrigger,
  Indicator: CollapsibleIndicator,
  Content: CollapsibleContent,
  Context: ArkCollapsible.Context,
};
