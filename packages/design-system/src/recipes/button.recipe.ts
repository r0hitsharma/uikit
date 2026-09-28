import { defineRecipe } from '@pandacss/dev';

/**
 * Semantic button contract.
 *
 * IMPORTANT — single-variant-only design. Components in this package apply
 * recipe classes as STRINGS (they never call the recipe fn), and CSS coverage
 * comes from `staticCss: { recipes: { button: ['*'] } }`. `['*']` emits ONLY
 * single-variant classes — it does NOT emit `compoundVariants` CSS, and an
 * EMPTY variant value (`{}`) emits no class at all. So every combination must
 * resolve to a NON-EMPTY single variant that `Button.tsx` selects explicitly.
 * There are intentionally NO `compoundVariants` here.
 *
 * - Structural `variant` (`panel` | `item`) sets layout/role.
 * - `emphasis="solid"` carries the CTA / destructive fill via dark-aware
 *   `colorPalette.solid.*` role tokens directly in the variant value.
 * - Density differs by structural variant, so it is split into `itemDensity`
 *   (padding/type) and `panelDensity` (height/type); `Button.tsx` translates the
 *   public `density` prop to the right one based on `variant`.
 * - `size` sets panel/text height; `iconOnly` makes the button square at its
 *   height through nested size- and density-qualified selectors (see the
 *   variant below).
 */

/** Square box for an icon-only button whose `size` has height `side`. */
const iconOnlySquare = (side: '6' | '8' | '9') => ({
  px: '0',
  gap: '0',
  w: side,
  minW: side,
  alignItems: 'center',
});

/**
 * Box for an icon-only compact panel: `panelDensity.compact`'s height, pinned
 * here so it does not depend on stylesheet order either, and a matching width.
 */
const compactIconOnlySquare = { h: '7', w: '7', minW: '7' };

export const buttonRecipe = defineRecipe({
  className: 'button',
  description:
    'Semantic button contract (single-variant-only for staticCss ["*"]). variant (panel|item) sets layout; emphasis="solid" + colorPalette produce CTA/destructive fills via dark-aware role tokens; itemDensity/panelDensity + size set metrics; iconOnly squares the button at its size.',
  base: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '1.5',
    borderRadius: 'md',
    borderWidth: 'hairline',
    borderStyle: 'solid',
    transitionDuration: 'fast',
    transitionProperty: 'background-color, color, border-color, box-shadow',
    _disabled: {
      opacity: '0.5',
      cursor: 'not-allowed',
    },
  },
  variants: {
    variant: {
      panel: {
        bg: 'surface.default',
        borderColor: 'border.subtle',
        color: 'text.default',
        textDecoration: 'none',
        cursor: 'pointer',
        textStyle: 'bodySm',
        lineHeight: '1.3',
        _hover: {
          borderColor: 'border.default',
        },
      },
      item: {
        display: 'flex',
        width: 'full',
        alignItems: 'baseline',
        textAlign: 'left',
        borderColor: 'transparent',
        bg: 'transparent',
        color: 'text.default',
        cursor: 'pointer',
        _hover: {
          bg: 'interactive.hover',
          borderColor: 'border.default',
        },
      },
    },
    // Box metrics AND type step. `size` now sets font-size too, so a default
    // button no longer inherits the larger body step. Item and compact-panel
    // buttons are meant to take their type (and compact panels their height)
    // from `itemDensity`/`panelDensity`. Those are single-class rules like
    // `size`, so which one wins depends on the order Panda emits them in, not
    // on the order they are declared here.
    size: {
      sm: {
        h: '6',
        px: '2',
        fontSize: 'xs',
      },
      md: {
        h: '8',
        px: '2.5',
        fontSize: 'sm',
      },
      lg: {
        h: '9',
        px: '3',
        fontSize: 'sm',
      },
    },
    // Item padding/type. Applied by the component only when variant==='item'.
    // Metrics kept byte-exact to the previous `density` variant.
    itemDensity: {
      comfortable: {
        px: '2',
        py: '1.5',
        fontSize: 'sm',
      },
      compact: {
        px: '2',
        py: '1',
        fontSize: 'xs',
      },
    },
    // Panel density. Applied by the component only when variant==='panel'
    // AND density==='compact' (comfortable panels are driven by `size`).
    panelDensity: {
      compact: {
        h: '7',
        px: '2',
        fontSize: 'xs',
        gap: '1',
      },
    },
    // CTA / destructive fill, straight in the variant value (no compound, no
    // variant gate — solid on an item button is fine/rare).
    emphasis: {
      solid: {
        bg: 'colorPalette.solid.bg',
        color: 'colorPalette.solid.fg',
        borderColor: 'colorPalette.solid.border',
        _hover: {
          bg: 'colorPalette.solid.bgHover',
          borderColor: 'colorPalette.solid.bgHover',
        },
        _active: {
          bg: 'colorPalette.solid.bgActive',
          borderColor: 'colorPalette.solid.bgActive',
        },
      },
    },
    colorPalette: {
      neutral: { colorPalette: 'neutral' },
      gray: { colorPalette: 'gray' },
      green: { colorPalette: 'green' },
      red: { colorPalette: 'red' },
      amber: { colorPalette: 'amber' },
      blue: { colorPalette: 'blue' },
    },
    selected: {
      true: {
        bg: 'interactive.selected',
      },
    },
    tone: {
      subdued: {
        color: 'text.muted',
      },
    },
    // Icon-only buttons are square for every variant, size and density: no
    // padding or gap, a width (and min-width, so a flex row cannot squeeze it)
    // equal to the box's height, and the icon centred on both axes.
    //
    // These are NOT compoundVariants, which staticCss ['*'] would never emit;
    // they are nested selectors inside this single variant, so they are
    // covered by ['*'] like any other variant class. Specificity, not
    // declaration order, decides every conflict:
    // - `.button--iconOnly_true.button--size_*` (two classes) outranks the
    //   single-class `size`, `itemDensity`, `panelDensity` and `variant` rules
    //   that also set padding, gap, width or alignment.
    // - A compact panel is `panelDensity.compact`'s height (`h: 7`) at every
    //   size, so `.button--iconOnly_true.button--panelDensity_compact.button--size_*`
    //   (three classes) outranks the size rules and sets that height and a
    //   matching width.
    // So the result does not depend on the order Panda emits these classes in.
    // `Button` always emits a `size` class, which is why every metric lives in
    // the size-qualified rules rather than the bare variant.
    iconOnly: {
      true: {
        justifyContent: 'center',
        '&.button--size_sm': iconOnlySquare('6'),
        '&.button--size_md': iconOnlySquare('8'),
        '&.button--size_lg': iconOnlySquare('9'),
        '&.button--panelDensity_compact.button--size_sm': compactIconOnlySquare,
        '&.button--panelDensity_compact.button--size_md': compactIconOnlySquare,
        '&.button--panelDensity_compact.button--size_lg': compactIconOnlySquare,
      },
    },
  },
  defaultVariants: {
    variant: 'panel',
    size: 'md',
    colorPalette: 'neutral',
  },
});
