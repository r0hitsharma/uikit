# @r0hitsharma/vite-config

Shared Vite build presets, so that wiring every app needs is written once.

## Installation

```bash
npm install --save-dev @r0hitsharma/vite-config \
  vite @vitejs/plugin-react @rolldown/plugin-babel babel-plugin-react-compiler
```

The four packages are peer dependencies: the preset composes them, it does not
vendor them, so the app decides which versions its build runs on. Vite 8 is
required: the preset is built on rolldown's plugin API. The
[code-splitting](#code-splitting) export uses only `vite`.

## React Compiler

```typescript
import reactCompiler from '@r0hitsharma/vite-config/react-compiler';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), reactCompiler()],
});
```

`react()` stays responsible for JSX and Fast Refresh; `reactCompiler()` adds the
compiler. Order matters only in that both must be present.

### Why this is not a `@vitejs/plugin-react` option

Vite 8 bundles with rolldown, whose transformer is Oxc, and Oxc does not run
Babel plugins. The React Compiler is a Babel plugin, so it arrives as a separate
Babel pass — `@rolldown/plugin-babel` carrying `reactCompilerPreset()` — rather
than as a `babel.plugins` entry on `react()`.

That preset ships a `code` filter and no `id` filter, which means every module
passing the code test is handed to Babel. Babel is the one part of the pipeline
that is not Oxc, so this preset adds the `id` filter the preset omits.

### Options

| Option | Default | Effect |
| --- | --- | --- |
| `exclude` | `[]` | Extra module ids kept out of the Babel pass, merged after the defaults rather than replacing them |
| `excludeStyledSystem` | `true` | Whether the default `styled-system` exclusion applies |
| `compiler` | `undefined` | Options forwarded to `babel-plugin-react-compiler` |

Excluded by default:

| Pattern | Why |
| --- | --- |
| `/[/\\]node_modules[/\\]/` | Dependencies ship compiled; also `@rolldown/plugin-babel`'s own default, restated so this preset does not depend on that default staying put |
| `/[/\\]styled-system[/\\](?!jsx[/\\])/` | Panda's generated output — style objects, token maps, type declarations — which every design-system consumer has and which holds no components |

The `jsx` carve-out is deliberate. Under `jsxFramework: 'react'` Panda generates
real `forwardRef` components into `styled-system/jsx/`, and this repo's own
shared Panda config sets exactly that. Since `exclude` only ever adds, a blanket
`styled-system` exclusion would skip the compiler on genuine components — so the
default is narrowed to the part of the tree that is component-free under every
Panda setting, rather than left for consumers to correct.

That leaves one assumption: that the segment means Panda's `outdir` at all. A
project where it does not — a hand-written `styled-system/` directory, say —
would hit exactly the failure this preset exists to prevent, a build that
type-checks, exits 0 and ships those components unoptimized, with no way to say
so through an append-only `exclude`. `excludeStyledSystem: false` drops that one
pattern:

```typescript
reactCompiler({ excludeStyledSystem: false });
```

`node_modules` is not part of the trade and stays out of the pass either way. It
is also `@rolldown/plugin-babel`'s own default `exclude`, applied to the pass
independently of the filter this preset sets, so an option to compile
dependencies would not work even if one existed.

Add your own generated trees:

```typescript
reactCompiler({ exclude: [/[/\\]src[/\\]generated[/\\]/] });
```

Regular expressions rather than globs, and the defaults are regexes for the
same reason: a string pattern is compiled by two different matchers.
`@rolldown/plugin-babel` compiles one copy with a bare `picomatch(pattern)`,
which defaults to `dot: false`, so a project living under `.cache/` or `.pnpm/`
drops out of a `**` glob entirely. rolldown's own id filter has no such blind
spot and is the one that decides for this wiring, which is why a glob is not
wrong here today — but it is right by way of which of the two gates happens to
be authoritative, and that is a plugin internal. A `RegExp` is
`pattern.test(id)` on both sides.

Leave `compiler` unset on React 19.2 and later. The compiler then emits calls
into `react/compiler-runtime`, which those versions ship; only an older React
needs an explicit `target`.

### Confirming it ran

An unwired compiler is silent — the build succeeds and produces the same output
it always did. The compiler's runtime import is the marker to look for, since
nothing else in an app imports it:

```bash
vite build --minify false
grep -rc 'react/compiler-runtime' dist/assets/*.js
```

This package's own tests assert exactly that, against real builds — including
that the excluded trees really do come out untouched.

## Linting for it

The compiler's own static analysis is available as oxlint rules, and the `react`
preset in [`@r0hitsharma/oxlint-config`](../oxlint-config/README.md) enables
19 of them. A consumer on that preset gets the build and the lint agreeing
without configuring anything.

They are named one at a time — `react/hooks`, `react/purity`,
`react/immutability`, `react/preserve-manual-memoization` and the rest — because
the umbrella `react/react-compiler` rule no longer exists. oxlint 1.79.0 split it
into one rule per compiler diagnostic, matching `eslint-plugin-react-hooks` v6,
and naming the old umbrella is now a hard config-parse failure:
`Rule 'react-compiler' not found in plugin 'react'`.

Five further split rules are deferred to `off` in that preset, each with its
reason and current finding count recorded beside it in
[`react.ts`](../oxlint-config/react.ts).

## Code splitting

```typescript
import codeSplitting from '@r0hitsharma/vite-config/code-splitting';
import reactCompiler from '@r0hitsharma/vite-config/react-compiler';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), reactCompiler()],
  build: {
    rolldownOptions: {
      output: { codeSplitting: codeSplitting() },
    },
  },
});
```

`codeSplitting()` returns the value of rolldown's `output.codeSplitting`: an
object holding the groups below. It only needs `vite`; the React Compiler peers
are not involved, and the two exports compose by living in different parts of
the config.

| Group | Captures | Priority | `entriesAware` |
| --- | --- | --- | --- |
| `react` | `react`, `react-dom`, `scheduler` | 30 | no |
| `design-system` | `@r0hitsharma/design-system` | 20 | yes |
| `charting` | `@r0hitsharma/charting` | 10 | no |

Each group also takes the dependencies of what it captures (rolldown's
`includeDependenciesRecursively`, on by default), so Ark UI lands with the
design system and visx with charting. That is also why the order is what it
is: React outranks everything so no other group's walk drags it along, and the
design system outranks charting because charting imports it.

The groups match on a `node_modules/@r0hitsharma/...` path segment, the scope
these packages publish under (exported as `PACKAGE_SCOPE`). A package resolved
anywhere else falls through to rolldown's automatic chunking: an `npm link`ed
checkout, for one, which rolldown resolves to its real path unless
`resolve.preserveSymlinks` is set.

### Adding app-specific groups

Pass them as `groups`; they are appended after the defaults:

```typescript
codeSplitting({
  groups: [{ name: 'maps', test: /[\\/]node_modules[\\/]maplibre-gl[\\/]/ }],
});
```

Leave their `priority` unset (0) or below 10. A group that outranks a default
group does not just take its own modules: through the same dependency walk it
takes every module of that group its modules import. A drawer-only group ranked
above the design system takes the button the drawer uses, and since the entry
needs that button, the drawer now loads with the entry.

The result is a plain object, so global options go next to it:

```typescript
output: { codeSplitting: { ...codeSplitting(), minSize: 20_000 } },
```

`DEFAULT_GROUPS` and `GROUP_PRIORITY` are exported for a config that wants to
start from the defaults and drop or reshape one.

### The option name matters

Vite 8 bundles with rolldown, and the option rolldown reads is
`build.rolldownOptions.output.codeSplitting`. The Rollup-era alternatives look
like they still apply, and mostly do not:

- `manualChunks` survives only in function form, deprecated, as a shim rolldown
  rewrites into one `codeSplitting` group. Its object form is gone: the build
  fails with `manualChunks is not a function`.
- `advancedChunks` is deprecated too.
- Once `codeSplitting` is set, rolldown ignores both of them, with a warning
  and nothing else. A `manualChunks` left over from a Vite 7 config, next to
  this preset, type-checks, builds and does nothing, so delete it rather than
  keep it alongside.

`build.rollupOptions` is itself a deprecated alias of `build.rolldownOptions`
in Vite 8.

### Why `entriesAware` is on for the design system

Without it a group is a single chunk. The app shell imports some design-system
code statically, so that one chunk loads up front, and it carries every
design-system module any route uses: the drawer that only one lazy route opens
is fetched on first paint. With `entriesAware`, modules are grouped by the set
of entries that reach them (dynamic imports count as entries), so the shell's
components get a chunk of their own and drawer-only code lands in a chunk only
that route loads.

The effect is not small. A minimal app with the design system's button in its
shell and the drawer and a chart behind lazy routes loads about 190 kB of
minified JavaScript up front with the preset, and about 280 kB with the same
groups minus `entriesAware`.

### Confirming it applied

A group rolldown never reads changes nothing visible. The chunk names are the
check: after `vite build`, `dist/assets/` should hold `react-*.js`,
`charting-*.js` and `design-system~<entry>-*.js` files, the part after `~`
naming the entries that share that chunk. This package's own tests make the
same checks against a real build, including that lazy-only design-system code
stays out of everything the entry loads, and that it does not once
`entriesAware` is dropped.
