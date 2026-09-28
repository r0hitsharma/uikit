import { Checkbox as ArkCheckbox } from '@ark-ui/react/checkbox';
import { Check, Minus } from 'lucide-react';
import { useId, type ComponentPropsWithoutRef, type ReactNode } from 'react';

/**
 * Class names emitted by the `checkbox` slot recipe (registered in the preset
 * + staticCss). The design-system package builds with `tsc` and ships no
 * generated `styled-system`, so the recipe is applied by its stable slot class
 * names (`checkbox__${slot}`). Behavior (checked / indeterminate state, the
 * hidden native input that carries focus, form value and keyboard toggling,
 * group membership) comes from Ark; this file only skins it.
 */
const slots = {
  group: 'checkbox__group',
  groupLabel: 'checkbox__groupLabel',
  root: 'checkbox__root',
  control: 'checkbox__control',
  indicator: 'checkbox__indicator',
  label: 'checkbox__label',
} as const;

const cx = (...classes: Array<string | false | null | undefined>): string =>
  classes.filter(Boolean).join(' ');

export type CheckboxProps = ComponentPropsWithoutRef<typeof ArkCheckbox.Root>;

/**
 * A single checkbox over Ark `Checkbox`, skinned with the `checkbox` slot
 * recipe. `children` is the visible label. Every Ark root prop is forwarded:
 * `checked` (`true`, `false` or `'indeterminate'`) / `defaultChecked` /
 * `onCheckedChange`, `disabled`, `invalid`, `readOnly`, `required`, `name`,
 * `form`, and `value`, which is what a surrounding `CheckboxGroup` collects.
 */
export function Checkbox({ className, children, ...props }: CheckboxProps) {
  return (
    <ArkCheckbox.Root {...props} className={cx(slots.root, className)}>
      <ArkCheckbox.Control className={slots.control}>
        <ArkCheckbox.Indicator className={slots.indicator}>
          <Check size={12} strokeWidth={3} aria-hidden="true" />
        </ArkCheckbox.Indicator>
        <ArkCheckbox.Indicator indeterminate className={slots.indicator}>
          <Minus size={12} strokeWidth={3} aria-hidden="true" />
        </ArkCheckbox.Indicator>
      </ArkCheckbox.Control>
      {children != null ? (
        <ArkCheckbox.Label className={slots.label}>
          {children}
        </ArkCheckbox.Label>
      ) : null}
      <ArkCheckbox.HiddenInput />
    </ArkCheckbox.Root>
  );
}

export type CheckboxGroupOrientation = 'vertical' | 'horizontal';

export type CheckboxGroupProps = ComponentPropsWithoutRef<
  typeof ArkCheckbox.Group
> & {
  /**
   * Heading above the options. It also names the group (`role="group"`) for
   * assistive tech; without one, pass `aria-label`.
   */
  label?: ReactNode;
  /** Stack the options (default) or lay them out in a wrapping row. */
  orientation?: CheckboxGroupOrientation;
};

/**
 * A set of `Checkbox`es sharing one `string[]` value, over Ark
 * `Checkbox.Group`. Each child `Checkbox` contributes its `value`; the group
 * owns `value` / `defaultValue` / `onValueChange`, `name`, `disabled`,
 * `invalid`, `readOnly` and `maxSelectedValues`, all forwarded to Ark.
 */
export function CheckboxGroup({
  className,
  label,
  orientation = 'vertical',
  children,
  ...props
}: CheckboxGroupProps) {
  const labelId = useId();

  return (
    <ArkCheckbox.Group
      aria-labelledby={label != null ? labelId : undefined}
      {...props}
      className={cx(slots.group, className)}
      data-orientation={orientation}
    >
      {label != null ? (
        <span id={labelId} className={slots.groupLabel}>
          {label}
        </span>
      ) : null}
      {children}
    </ArkCheckbox.Group>
  );
}
