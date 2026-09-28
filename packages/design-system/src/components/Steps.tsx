import { Steps as ArkSteps } from '@ark-ui/react/steps';
import { Check } from 'lucide-react';
import type { ComponentPropsWithoutRef } from 'react';

/**
 * Class names emitted by the `steps` slot recipe (registered in the preset).
 * The design-system package builds with `tsc` and ships no generated
 * `styled-system`, so the recipe is applied by its stable slot class names
 * (Panda convention: `${className}__${slot}`). The recipe must be added to
 * `staticCss` so these classes are always generated. Behavior (step state,
 * linear gating, `isStepValid` / `isStepSkippable`, keyboard focus, the
 * `aria-current="step"` on the current item) comes from Ark; this file only
 * skins it.
 */
const slots = {
  root: 'steps__root',
  list: 'steps__list',
  item: 'steps__item',
  trigger: 'steps__trigger',
  indicator: 'steps__indicator',
  separator: 'steps__separator',
  content: 'steps__content',
  completedContent: 'steps__completedContent',
  progress: 'steps__progress',
} as const;

const cx = (...classes: Array<string | false | null | undefined>): string =>
  classes.filter(Boolean).join(' ');

/** Props of each styled part: Ark's own, plus the slot class composition. */
export type StepsRootProps = ComponentPropsWithoutRef<typeof ArkSteps.Root>;
export type StepsListProps = ComponentPropsWithoutRef<typeof ArkSteps.List>;
export type StepsItemProps = ComponentPropsWithoutRef<typeof ArkSteps.Item>;
export type StepsTriggerProps = ComponentPropsWithoutRef<
  typeof ArkSteps.Trigger
>;
export type StepsIndicatorProps = ComponentPropsWithoutRef<
  typeof ArkSteps.Indicator
>;
export type StepsSeparatorProps = ComponentPropsWithoutRef<
  typeof ArkSteps.Separator
>;
export type StepsContentProps = ComponentPropsWithoutRef<
  typeof ArkSteps.Content
>;
export type StepsCompletedContentProps = ComponentPropsWithoutRef<
  typeof ArkSteps.CompletedContent
>;
export type StepsProgressProps = ComponentPropsWithoutRef<
  typeof ArkSteps.Progress
>;

function StepsRoot({ className, ...props }: StepsRootProps) {
  return <ArkSteps.Root {...props} className={cx(slots.root, className)} />;
}

function StepsList({ className, ...props }: StepsListProps) {
  return <ArkSteps.List {...props} className={cx(slots.list, className)} />;
}

function StepsItem({ className, ...props }: StepsItemProps) {
  return <ArkSteps.Item {...props} className={cx(slots.item, className)} />;
}

function StepsTrigger({ className, ...props }: StepsTriggerProps) {
  return (
    <ArkSteps.Trigger {...props} className={cx(slots.trigger, className)} />
  );
}

/**
 * The step marker. With no children it shows the step's 1-based number, and a
 * check once the step is complete, so the common case needs no render prop.
 * Pass children to replace that (an icon per step, say).
 */
function StepsIndicator({
  className,
  children,
  ...props
}: StepsIndicatorProps) {
  return (
    <ArkSteps.Indicator {...props} className={cx(slots.indicator, className)}>
      {children ?? (
        <ArkSteps.ItemContext>
          {(item) =>
            item.completed ? (
              <Check size={14} strokeWidth={2.5} aria-hidden="true" />
            ) : (
              item.index + 1
            )
          }
        </ArkSteps.ItemContext>
      )}
    </ArkSteps.Indicator>
  );
}

function StepsSeparator({ className, ...props }: StepsSeparatorProps) {
  return (
    <ArkSteps.Separator {...props} className={cx(slots.separator, className)} />
  );
}

function StepsContent({ className, ...props }: StepsContentProps) {
  return (
    <ArkSteps.Content {...props} className={cx(slots.content, className)} />
  );
}

function StepsCompletedContent({
  className,
  ...props
}: StepsCompletedContentProps) {
  return (
    <ArkSteps.CompletedContent
      {...props}
      className={cx(slots.completedContent, className)}
    />
  );
}

/**
 * A `progressbar` filled to the share of steps completed. Ark announces it as
 * "`n`% complete"; pass `aria-valuetext` (e.g. "Step 2 of 4") to override.
 */
function StepsProgress({ className, ...props }: StepsProgressProps) {
  return (
    <ArkSteps.Progress {...props} className={cx(slots.progress, className)} />
  );
}

/**
 * Multi-step flow skinned with the `steps` slot recipe. Composition mirrors
 * Ark: `Root` > `List` > `Item` (> `Trigger` > `Indicator`, plus `Separator`),
 * then one `Content` per step and an optional `CompletedContent`. Everything
 * `Root` accepts is Ark's, forwarded unchanged: `count`, `step` /
 * `defaultStep` / `onStepChange`, `linear`, `orientation`, and the validation
 * callbacks: `isStepValid` blocks moving forward past a step it rejects (Ark
 * calls `onStepInvalid` instead), and `isStepSkippable` lets a step be left
 * even while it is not valid.
 *
 * `NextTrigger` and `PrevTrigger` pass through unstyled, like `Drawer.Trigger`:
 * compose them with `asChild` around a `Button`. `Context` and `ItemContext`
 * expose the step API and per-item state as render props.
 */
export const Steps = {
  Root: StepsRoot,
  List: StepsList,
  Item: StepsItem,
  Trigger: StepsTrigger,
  Indicator: StepsIndicator,
  Separator: StepsSeparator,
  Content: StepsContent,
  CompletedContent: StepsCompletedContent,
  Progress: StepsProgress,
  NextTrigger: ArkSteps.NextTrigger,
  PrevTrigger: ArkSteps.PrevTrigger,
  Context: ArkSteps.Context,
  ItemContext: ArkSteps.ItemContext,
};
