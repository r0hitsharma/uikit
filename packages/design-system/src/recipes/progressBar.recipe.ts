import { defineSlotRecipe } from '@pandacss/dev';

/**
 * `progressBar` slot recipe: a linear task-completion bar over Ark
 * `Progress`, distinct from `meter` (a measurement inside a range). Ark sets
 * the range's width inline from the value, so the recipe only paints the
 * track and fill; `tone` picks the fill hue via dark-aware `colorPalette` role
 * tokens and `size` the track thickness.
 *
 * The design-system builds with `tsc` and ships no generated `styled-system`,
 * so the component applies this recipe by its stable slot class names
 * (`progressBar__root`, …, variant `progressBar__root--tone_x`). Registered in
 * the preset + staticCss.
 */
export const progressBarRecipe = defineSlotRecipe({
  className: 'progressBar',
  description:
    'Linear task-completion progressbar over Ark Progress: label and value readout above a rounded track. The fill width comes from Ark; tone sets its hue via colorPalette role tokens and size sets the track thickness.',
  slots: ['root', 'header', 'label', 'valueText', 'track', 'range'],
  base: {
    root: {
      display: 'grid',
      gap: '1.5',
      width: 'full',
      minWidth: '0',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: '2',
    },
    label: {
      textStyle: 'bodySm',
      fontWeight: 'medium',
      color: 'text.default',
    },
    valueText: {
      textStyle: 'bodySm',
      fontVariantNumeric: 'tabular-nums',
      color: 'text.muted',
      whiteSpace: 'nowrap',
    },
    track: {
      position: 'relative',
      width: 'full',
      overflow: 'hidden',
      borderRadius: 'full',
      bg: 'surface.subtle',
    },
    range: {
      height: 'full',
      borderRadius: 'full',
      bg: 'colorPalette.solid.bg',
      transitionDuration: 'normal',
      transitionProperty: 'width',
      transitionTimingFunction: 'out',
      _motionReduce: {
        transitionDuration: '0s',
      },
    },
  },
  variants: {
    tone: {
      neutral: { root: { colorPalette: 'neutral' } },
      success: { root: { colorPalette: 'green' } },
      warning: { root: { colorPalette: 'amber' } },
      critical: { root: { colorPalette: 'red' } },
    },
    size: {
      sm: { track: { height: '1' } },
      md: { track: { height: '2' } },
    },
  },
  defaultVariants: {
    tone: 'neutral',
    size: 'md',
  },
});
