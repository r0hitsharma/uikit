import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfigAndCreateContext } from '@pandacss/node';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  Button,
  type ButtonDensity,
  type ButtonSize,
  type ButtonVariant,
} from './Button.js';

const sizes: ButtonSize[] = ['sm', 'md', 'lg'];
const variants: ButtonVariant[] = ['panel', 'item'];
const densities: ButtonDensity[] = ['comfortable', 'compact'];

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');

// The stylesheet Panda emits for this package's own config, from staticCss
// alone: that is what produces every single-variant `button--*` class, and it
// is what a consumer's `staticCss` spread emits too.
let css = '';
beforeAll(async () => {
  const ctx = await loadConfigAndCreateContext({
    cwd: packageRoot,
    configPath: join(packageRoot, 'panda.config.ts'),
  });
  const sheet = ctx.createSheet();
  ctx.appendCssOfType('static', sheet);
  css = ctx.getCss(sheet);
}, 30_000);

/** Declarations of every rule whose selector list contains exactly `selector`. */
function declarationsFor(selector: string): Record<string, string> {
  const declarations: Record<string, string> = {};
  for (const [, selectorList = '', body = ''] of css.matchAll(
    /([^{}]+)\{([^{}]*)\}/g,
  )) {
    if (!selectorList.split(',').some((s) => s.trim() === selector)) continue;
    for (const declaration of body.split(';')) {
      const [property, ...value] = declaration.split(':');
      if (property?.trim()) {
        declarations[property.trim()] = value.join(':').trim();
      }
    }
  }
  return declarations;
}

// Why these rules are size- and density-qualified: see the `iconOnly` variant
// in `recipes/button.recipe.ts`.
describe('icon-only button stylesheet', () => {
  it.each(sizes)(
    'a %s icon-only button is as wide as it is tall, with no padding or gap',
    (size) => {
      const height = declarationsFor(`.button--size_${size}`).height;
      const square = declarationsFor(
        `.button--iconOnly_true.button--size_${size}`,
      );

      expect(height).toMatch(/^var\(--sizes-/);
      expect(square.width).toBe(height);
      expect(square['min-width']).toBe(height);
      expect(square['padding-inline']).toBe('var(--spacing-0)');
      expect(square.gap).toBe('var(--spacing-0)');
    },
  );

  it.each(sizes)(
    'a compact %s icon-only panel is the compact height, and as wide',
    (size) => {
      const height = declarationsFor('.button--panelDensity_compact').height;
      const square = declarationsFor(
        `.button--iconOnly_true.button--panelDensity_compact.button--size_${size}`,
      );

      expect(height).toMatch(/^var\(--sizes-/);
      expect(square.height).toBe(height);
      expect(square.width).toBe(height);
      expect(square['min-width']).toBe(height);
    },
  );
});

const classNamesOf = (html: string): string[] =>
  /class="([^"]*)"/.exec(html)?.[1]?.split(' ') ?? [];

describe('Button iconOnly', () => {
  it.each(
    variants.flatMap((variant) =>
      sizes.flatMap((size) =>
        densities.map((density) => [variant, size, density] as const),
      ),
    ),
  )(
    'emits the classes the square rules select on (%s, %s, %s)',
    (variant, size, density) => {
      const classes = classNamesOf(
        renderToStaticMarkup(
          createElement(Button, {
            variant,
            size,
            density,
            iconOnly: true,
            'aria-label': 'Refresh',
          }),
        ),
      );

      expect(classes).toContain('button--iconOnly_true');
      expect(classes).toContain(`button--size_${size}`);
      if (variant === 'panel' && density === 'compact') {
        expect(classes).toContain('button--panelDensity_compact');
      }
    },
  );
});
