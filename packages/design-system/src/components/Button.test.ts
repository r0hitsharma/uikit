import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buttonRecipe } from '../recipes/button.recipe.js';
import { Button, type ButtonSize, type ButtonVariant } from './Button.js';

const sizes: ButtonSize[] = ['sm', 'md', 'lg'];
const variants: ButtonVariant[] = ['panel', 'item'];

// Read the recipe as plain nested objects: Panda's style types do not model
// the nested `&.button--size_*` selector keys.
type Styles = Record<string, unknown>;
const recipeVariants = (buttonRecipe.variants ?? {}) as Record<
  string,
  Record<string, Styles> | undefined
>;
const sizeVariant = recipeVariants.size;
const iconOnlyVariant = recipeVariants.iconOnly;

const classNamesOf = (html: string): string[] =>
  /class="([^"]*)"/.exec(html)?.[1]?.split(' ') ?? [];

// The `size` variant and the density variants all set `px`, and `item` sets a
// full width. Those are single-class rules, and which one wins against a
// single-class `iconOnly` rule depends on the order Panda happens to emit them.
// Square icon-only sizing therefore lives in `.button--iconOnly_true.button--size_*`
// rules, whose extra class wins regardless of order.
describe('icon-only button recipe', () => {
  it.each(sizes)('squares a %s button to its size height', (size) => {
    const height = sizeVariant?.[size]?.h;
    const square = iconOnlyVariant?.true?.[`&.button--size_${size}`];

    expect(height).toBeDefined();
    expect(square).toEqual({
      px: '0',
      w: height,
      minW: height,
      alignItems: 'center',
    });
  });
});

describe('Button iconOnly', () => {
  it.each(variants.flatMap((variant) => sizes.map((size) => [variant, size])))(
    'emits the classes the square rule selects on (%s, %s)',
    (variant, size) => {
      const classes = classNamesOf(
        renderToStaticMarkup(
          createElement(Button, {
            variant: variant as ButtonVariant,
            size: size as ButtonSize,
            iconOnly: true,
            'aria-label': 'Refresh',
          }),
        ),
      );

      expect(classes).toContain('button--iconOnly_true');
      expect(classes).toContain(`button--size_${size}`);
    },
  );
});
