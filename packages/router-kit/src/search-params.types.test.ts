import { describe, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import { z as mini } from 'zod/mini';

import { oneOfParam, textParam, toSearchOption } from './search-params.js';

/**
 * Type-level coverage of what the builders promise: a closed-set param reaches
 * the component as the literal union it declared, and a text param always
 * carries the absent case. Both are checked by `npm run type:check`, so the
 * assertions live in a function that is never called.
 */

const TABS = ['overview', 'detail'] as const;

describe('search param builders — inference', () => {
  it('is asserted by tsc, not at runtime', () => {
    expectTypeOf(oneOfParam).toBeFunction();
    expectTypeOf(textParam).toBeFunction();
  });
});

export function typeAssertions(): void {
  const schema = z.object({
    q: textParam(),
    tab: oneOfParam(TABS),
  });

  type Search = z.infer<typeof schema>;

  // A text param is always `string | undefined`: the absent case is part of the
  // type, so no consumer can read it as a guaranteed string.
  expectTypeOf<Search['q']>().toEqualTypeOf<string | undefined>();

  // A closed-set param narrows to the literal union, not to `string`.
  expectTypeOf<Search['tab']>().toEqualTypeOf<
    'overview' | 'detail' | undefined
  >();

  // @ts-expect-error - a value outside the declared set is not assignable
  const outsideSet: Search['tab'] = 'archive';
  void outsideSet;

  // @ts-expect-error - a text param may be absent, so it is not a bare string
  const notOptional: string = ({} as Search).q;
  void notOptional;

  expectTypeOf(toSearchOption('detail', TABS)).toEqualTypeOf<
    'overview' | 'detail' | undefined
  >();

  // @ts-expect-error - the option set has to be strings; there is no coercion
  toSearchOption('1', [1, 2]);

  // A mutable `string[]` widens the union to `string`, which defeats the point
  // of the closed set — hence the `as const` in every example.
  const mutableSet: string[] = ['overview', 'detail'];
  expectTypeOf(toSearchOption('detail', mutableSet)).toEqualTypeOf<
    string | undefined
  >();

  // The same inference through a mini object: an app on `zod/mini` gets the
  // literal union and the absent case too, not a widened `unknown`.
  const miniSchema = mini.object({ q: textParam(), tab: oneOfParam(TABS) });
  type MiniSearch = mini.infer<typeof miniSchema>;
  expectTypeOf<MiniSearch>().toEqualTypeOf<Search>();

  // A classic object with a classic transform on top — the shape an app's
  // shared schema usually takes — still infers through the mini children.
  const transformed = z
    .object({ q: textParam() })
    .transform(({ q }) => ({ q, hasQuery: q !== undefined }));
  expectTypeOf<z.infer<typeof transformed>>().toEqualTypeOf<{
    q: string | undefined;
    hasQuery: boolean;
  }>();
}
