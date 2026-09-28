import { preset as pandaBasePreset } from '@pandacss/preset-base';
import { preset as pandaDefaultPreset } from '@pandacss/preset-panda';
import { describe, expect, it, vi } from 'vitest';

import { designSystemPandaConfig } from '../panda.shared.js';
import {
  designSystemPreset,
  designSystemStandalonePreset,
} from './panda-preset.js';
import {
  designSystemRecipes,
  designSystemSlotRecipes,
} from './recipes/sharedRecipes.js';
import { borderWidthTokens } from './tokens/sharedThemeTokens.js';

const borderWidthNames = Object.keys(borderWidthTokens);

/**
 * Any `border*Width` or `outline*Width` style property. Panda resolves both
 * against the `borderWidths` token category (see `focusRingWidth` and the
 * `outlineWidth` utility in `@pandacss/preset-base`), so a raw `outlineWidth`
 * px literal is exactly as untracked as a raw `borderWidth` one.
 */
const BORDER_WIDTH_PROPERTY = /^(?:border|outline)[A-Za-z]*Width$/;

/**
 * Every `border*Width`/`outline*Width` value anywhere in a recipe, however
 * deep — variants, compound variants, slots and nested selectors are all just
 * plain objects, so one walk covers the lot without having to model Panda's
 * recipe shape.
 */
function collectBorderWidthValues(node: unknown): string[] {
  if (Array.isArray(node)) return node.flatMap(collectBorderWidthValues);
  if (typeof node !== 'object' || node === null) return [];
  return Object.entries(node).flatMap(([key, child]) =>
    BORDER_WIDTH_PROPERTY.test(key) && typeof child === 'string'
      ? [child]
      : collectBorderWidthValues(child),
  );
}

describe('borderWidths token scale', () => {
  // Panda ships no `borderWidths` tokens of its own, so this scale existing at
  // all is the whole point: without it a consumer running `strictTokens` has to
  // write every border as an arbitrary `[value]`.
  it('is registered on the preset', () => {
    expect(
      designSystemStandalonePreset.theme?.extend?.tokens?.borderWidths,
    ).toBe(borderWidthTokens);
  });

  // The failure `tokens/sharedThemeTokens.ts` exists to prevent: a scale added
  // to the published preset and not to the config this repo's own preview
  // builds with, so every `var(--border-widths-*)` read there resolves to
  // nothing — silently, exactly as `identity.*` once did.
  it('is registered identically on the internal shared config', () => {
    expect(designSystemPandaConfig.theme?.extend?.tokens?.borderWidths).toBe(
      designSystemStandalonePreset.theme?.extend?.tokens?.borderWidths,
    );
  });

  it('covers the hairline through the accent rail', () => {
    expect(borderWidthTokens).toEqual({
      none: { value: '0' },
      hairline: { value: '1px' },
      strong: { value: '2px' },
      accent: { value: '3px' },
    });
  });

  // `thin`/`medium`/`thick` are CSS-wide `border-width` keywords: a token by
  // one of those names that failed to register would render as a plausible
  // width rather than failing loudly, so the scale must not use them.
  it('avoids the CSS-wide border-width keywords', () => {
    expect(borderWidthNames).not.toContain('thin');
    expect(borderWidthNames).not.toContain('medium');
    expect(borderWidthNames).not.toContain('thick');
  });
});

describe('shared recipes', () => {
  // Pins the migration off hardcoded widths. Recipe values are typed as plain
  // strings, so nothing at the type level can tell `'hairline'` from `'1px'` or
  // from a typo — this walk is the only thing that can.
  it('express every border width as a borderWidths token', () => {
    const used = [
      ...collectBorderWidthValues(designSystemRecipes),
      ...collectBorderWidthValues(designSystemSlotRecipes),
    ];

    expect(used.length).toBeGreaterThan(0);
    for (const value of used) {
      expect(borderWidthNames, value).toContain(value);
    }
  });
});

/** Every `{category.path}` token reference in a token tree, however deep. */
function collectTokenReferences(node: unknown): string[] {
  if (typeof node === 'string') {
    return [...node.matchAll(/\{([^}]+)\}/g)].map((match) => match[1] ?? '');
  }
  if (typeof node !== 'object' || node === null) return [];
  return Object.values(node).flatMap(collectTokenReferences);
}

/** Whether `path` (e.g. `colors.neutral.50`) names a token in `tree`. */
function hasToken(tree: unknown, path: string): boolean {
  let node = tree;
  for (const segment of path.split('.')) {
    if (typeof node !== 'object' || node === null || !(segment in node)) {
      return false;
    }
    node = (node as Record<string, unknown>)[segment];
  }
  return typeof node === 'object' && node !== null;
}

describe('base presets', () => {
  // Panda drops its own default presets as soon as a consumer sets `presets`,
  // so `presets: [designSystemStandalonePreset]` only resolves the base palette the
  // semantic tokens point into because the preset declares it itself.
  it('are declared on the preset', () => {
    expect(designSystemStandalonePreset.presets).toEqual([
      pandaBasePreset,
      pandaDefaultPreset,
    ]);
  });

  it('define every token the semantic tokens reference', () => {
    const extend = designSystemStandalonePreset.theme?.extend;
    // Resolve against what the preset itself carries (its own tokens plus the
    // presets it declares), which is all a `presets: [designSystemStandalonePreset]`
    // consumer gets.
    const nestedTokens = (designSystemStandalonePreset.presets ?? []).map(
      (nested) =>
        typeof nested === 'object' && !(nested instanceof Promise)
          ? nested.theme?.tokens
          : undefined,
    );
    const trees = [...nestedTokens, extend?.tokens, extend?.semanticTokens];
    const references = collectTokenReferences(extend?.semanticTokens);

    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      // `colorPalette` is Panda's virtual palette, resolved per component.
      if (reference.startsWith('colors.colorPalette.')) continue;
      expect(
        trees.some((tree) => hasToken(tree, reference)),
        reference,
      ).toBe(true);
    }
  });
});

describe('deprecated designSystemPreset', () => {
  // Panda reads a preset's `presets` while resolving every config that lists
  // it, so this is where a consumer on the old name gets the upgrade notice.
  it('is the standalone preset, and warns once when Panda reads its presets', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(designSystemPreset.theme).toBe(designSystemStandalonePreset.theme);
      expect(warn).not.toHaveBeenCalled();

      expect(designSystemPreset.presets).toBe(
        designSystemStandalonePreset.presets,
      );
      void designSystemPreset.presets;
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain(
        '`designSystemPreset` is deprecated',
      );
      // Consumer guards grep Panda's output for this phrase; the notice must
      // not trip them.
      expect(String(warn.mock.calls[0]?.[0])).not.toContain('Missing token');
    } finally {
      warn.mockRestore();
    }
  });

  it('keeps every key the standalone preset has', () => {
    expect(Object.keys(designSystemPreset).sort()).toEqual(
      Object.keys(designSystemStandalonePreset).sort(),
    );
  });
});
