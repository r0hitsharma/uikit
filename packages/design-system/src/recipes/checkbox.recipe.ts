import { defineSlotRecipe } from '@pandacss/dev';

/**
 * `checkbox` slot recipe: the skin over Ark Checkbox and Checkbox.Group. The
 * box's states key off the data attributes Ark sets on every part
 * (`data-state="checked" | "indeterminate" | "unchecked"`, `data-hover`,
 * `data-focus-visible`, `data-disabled`, `data-invalid`), and the group's
 * layout off the `data-orientation` the component sets, so the recipe needs
 * no runtime variant.
 *
 * The design-system builds with `tsc` and ships no generated `styled-system`,
 * so the components apply this recipe by its stable slot class names
 * (`checkbox__root`, `checkbox__control`, …). Registered in the preset +
 * staticCss.
 */
export const checkboxRecipe = defineSlotRecipe({
  className: 'checkbox',
  description:
    'Checkbox and checkbox-group skin over Ark Checkbox: a tokenized box with check and indeterminate marks, a label, and a stacked or wrapping group, all keyed off Ark data attributes.',
  slots: ['group', 'groupLabel', 'root', 'control', 'indicator', 'label'],
  base: {
    group: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: '2',
      '&[data-orientation="horizontal"]': {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        columnGap: '4',
      },
    },
    groupLabel: {
      // A horizontal group still puts its heading on a line of its own.
      flexBasis: '100%',
      textStyle: 'sectionLabel',
      color: 'text.muted',
    },
    root: {
      position: 'relative',
      display: 'inline-flex',
      alignItems: 'center',
      gap: '2',
      cursor: 'pointer',
      userSelect: 'none',
      _disabled: {
        cursor: 'not-allowed',
      },
    },
    control: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: '0',
      w: '4',
      h: '4',
      borderRadius: 'sm',
      borderWidth: 'hairline',
      borderStyle: 'solid',
      borderColor: 'border.default',
      bg: 'surface.default',
      color: 'white',
      transitionDuration: 'fast',
      transitionProperty: 'background-color, border-color',
      _hover: {
        // Only an unchecked, valid box darkens its border. The hover rule
        // ties on specificity with the checked and invalid ones and Panda
        // may emit it after them, so it must not match those states at all.
        '&:not([data-state="checked"], [data-state="indeterminate"], [data-invalid])':
          {
            borderColor: 'border.strong',
          },
      },
      '&[data-state="checked"], &[data-state="indeterminate"]': {
        // `interactive.accent` is a theme-invariant fill that white marks are
        // AA on in both themes (see its token note).
        bg: 'interactive.accent',
        borderColor: 'interactive.accent',
      },
      _invalid: {
        borderColor: 'text.critical',
      },
      _focusVisible: {
        outlineWidth: 'strong',
        outlineStyle: 'solid',
        outlineColor: 'border.strong',
        outlineOffset: '2px',
      },
      _disabled: {
        opacity: '0.5',
      },
    },
    indicator: {
      display: 'inline-flex',
      _hidden: {
        display: 'none',
      },
    },
    label: {
      textStyle: 'bodySm',
      color: 'text.default',
      _disabled: {
        color: 'text.muted',
      },
    },
  },
});
