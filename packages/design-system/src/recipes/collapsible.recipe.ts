import { defineSlotRecipe } from '@pandacss/dev';

/**
 * `collapsible` slot recipe: the skin over Ark Collapsible. Open/closed
 * styling keys off the `data-state` Ark sets on the trigger, indicator and
 * content, and `data-disabled` dims a disabled trigger, so the recipe needs no
 * runtime variant.
 *
 * The content opens and closes without a height animation on purpose: Ark
 * only delays hiding the content for a CSS animation (not a transition), which
 * would need keyframes registered in the shared theme, and an instant reveal
 * is what a reduced-motion user gets either way.
 *
 * The design-system builds with `tsc` and ships no generated `styled-system`,
 * so the component applies this recipe by its stable slot class names
 * (`collapsible__root`, `collapsible__trigger`, …). Registered in the preset +
 * staticCss.
 */
export const collapsibleRecipe = defineSlotRecipe({
  className: 'collapsible',
  description:
    'Disclosure skin over Ark Collapsible: a tokenized trigger with a chevron indicator that turns over when open, and a content region, all keyed off Ark data-state.',
  slots: ['root', 'trigger', 'indicator', 'content'],
  base: {
    root: {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'flex-start',
      gap: '2',
      width: 'full',
      color: 'text.default',
    },
    trigger: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '1.5',
      m: '0',
      px: '1.5',
      py: '1',
      // Pull the trigger's padding back out so its label lines up with the
      // content beneath it.
      mx: '-1.5',
      borderRadius: 'sm',
      borderWidth: 'none',
      bg: 'transparent',
      color: 'text.default',
      fontFamily: 'inherit',
      textStyle: 'bodySm',
      fontWeight: 'medium',
      textAlign: 'start',
      cursor: 'pointer',
      transitionDuration: 'fast',
      transitionProperty: 'background-color, color',
      _hover: {
        bg: 'interactive.hover',
        color: 'text.strong',
      },
      '&[data-state="open"]': {
        color: 'text.strong',
      },
      _disabled: {
        color: 'text.muted',
        cursor: 'not-allowed',
        bg: 'transparent',
        // `_hover` and `_disabled` tie on specificity and Panda emits the
        // hover rule last, so without this more specific rule a disabled
        // trigger would still take the hover fill.
        _hover: {
          bg: 'transparent',
          color: 'text.muted',
        },
      },
      _focusVisible: {
        outlineWidth: 'strong',
        outlineStyle: 'solid',
        outlineColor: 'border.strong',
        outlineOffset: '1px',
      },
    },
    indicator: {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: '0',
      color: 'text.muted',
      transitionDuration: 'fast',
      transitionProperty: 'transform',
      transitionTimingFunction: 'out',
      '&[data-state="open"]': {
        transform: 'rotate(180deg)',
      },
      _motionReduce: {
        transitionDuration: '0s',
      },
    },
    content: {
      width: 'full',
      minWidth: '0',
      textStyle: 'bodySm',
      color: 'text.default',
    },
  },
});
