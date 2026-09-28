import { defineSlotRecipe } from '@pandacss/dev';

/**
 * `steps` slot recipe: the skin over Ark Steps. Every state is keyed off the
 * attributes Ark already emits, so the recipe needs no runtime variant:
 * `data-orientation` on root/list/item/separator lays the flow out
 * horizontally or vertically, and `data-complete` / `data-current` /
 * `data-incomplete` on trigger, indicator and separator mark where each step
 * stands. The progress bar's fill reads the `--percent` custom property Ark
 * sets on the root.
 *
 * The design-system builds with `tsc` and ships no generated `styled-system`,
 * so the component applies this recipe by its stable slot class names
 * (`steps__root`, `steps__list`, …). Registered in the preset + staticCss.
 */
export const stepsRecipe = defineSlotRecipe({
  className: 'steps',
  description:
    'Multi-step flow skin over Ark Steps: numbered indicators, connecting separators and a progress bar, with complete/current/incomplete states keyed off Ark data attributes and a horizontal or vertical layout from data-orientation.',
  slots: [
    'root',
    'list',
    'item',
    'trigger',
    'indicator',
    'separator',
    'content',
    'completedContent',
    'progress',
  ],
  base: {
    root: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4',
      width: 'full',
      color: 'text.default',
      '&[data-orientation="vertical"]': {
        flexDirection: 'row',
      },
    },
    list: {
      display: 'flex',
      alignItems: 'center',
      gap: '2',
      m: '0',
      p: '0',
      listStyle: 'none',
      '&[data-orientation="vertical"]': {
        flexDirection: 'column',
        alignItems: 'stretch',
        flexShrink: '0',
      },
    },
    item: {
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      gap: '2',
      flex: '1',
      minWidth: '0',
      // The last step has nothing to connect to, so it takes only its own
      // width and its separator (if the consumer rendered one) is hidden.
      '&:last-child': {
        flex: 'none',
      },
      '&:last-child > [data-part="separator"]': {
        display: 'none',
      },
      '&[data-orientation="vertical"]': {
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '1',
      },
    },
    trigger: {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '2',
      m: '0',
      p: '1',
      borderRadius: 'md',
      borderWidth: 'none',
      bg: 'transparent',
      color: 'text.muted',
      fontFamily: 'inherit',
      textStyle: 'bodySm',
      textAlign: 'start',
      whiteSpace: 'nowrap',
      cursor: 'pointer',
      transitionDuration: 'fast',
      transitionProperty: 'color, background-color',
      _hover: {
        bg: 'interactive.hover',
      },
      '&[data-current]': {
        color: 'text.strong',
        fontWeight: 'medium',
      },
      '&[data-complete]': {
        color: 'text.default',
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
      w: '7',
      h: '7',
      borderRadius: 'full',
      borderWidth: 'hairline',
      borderStyle: 'solid',
      borderColor: 'border.default',
      bg: 'surface.default',
      color: 'text.muted',
      fontSize: 'xs',
      fontWeight: 'semibold',
      fontVariantNumeric: 'tabular-nums',
      lineHeight: '1',
      transitionDuration: 'fast',
      transitionProperty: 'background-color, border-color, color',
      '&[data-current]': {
        borderWidth: 'strong',
        borderColor: 'interactive.accent',
        color: 'text.link',
      },
      '&[data-complete]': {
        borderColor: 'interactive.accent',
        bg: 'interactive.accent',
        // `interactive.accent` is a theme-invariant fill that white text is AA
        // on in both themes (see its token note).
        color: 'white',
      },
    },
    separator: {
      flex: '1',
      minWidth: '4',
      height: '1px',
      bg: 'border.subtle',
      transitionDuration: 'normal',
      transitionProperty: 'background-color',
      '&[data-complete]': {
        bg: 'interactive.accent',
      },
      '&[data-orientation="vertical"]': {
        flex: 'none',
        width: '1px',
        height: 'auto',
        minWidth: '0',
        minHeight: '6',
        // Centre the rail under the 1.75rem indicator (plus the trigger's
        // 0.25rem padding).
        marginInlineStart: 'calc(0.25rem + 0.875rem - 0.5px)',
      },
    },
    content: {
      flex: '1',
      minWidth: '0',
      textStyle: 'bodySm',
      color: 'text.default',
      _focusVisible: {
        outlineWidth: 'strong',
        outlineStyle: 'solid',
        outlineColor: 'border.strong',
        outlineOffset: '2px',
      },
    },
    completedContent: {
      flex: '1',
      minWidth: '0',
      textStyle: 'bodySm',
      color: 'text.default',
    },
    progress: {
      position: 'relative',
      width: 'full',
      height: '1.5',
      overflow: 'hidden',
      borderRadius: 'full',
      bg: 'surface.subtle',
      '&::after': {
        content: '""',
        position: 'absolute',
        insetBlock: '0',
        insetInlineStart: '0',
        width: 'var(--percent, 0%)',
        borderRadius: 'full',
        bg: 'interactive.accent',
        transitionDuration: 'normal',
        transitionProperty: 'width',
        transitionTimingFunction: 'out',
      },
    },
  },
});
