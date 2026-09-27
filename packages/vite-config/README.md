# @r0hitsharma/vite-config

Shared Vite build presets, so that wiring every app needs is written once.

## Installation

```bash
npm install --save-dev @r0hitsharma/vite-config vite
```

`vite` is the one required peer dependency, and Vite 8 specifically: both
presets are built on rolldown. The rest depend on the export:

| Export | Peer dependencies |
| --- | --- |
| `./code-splitting` | `vite` |
| `./react-compiler` | `vite`, `@vitejs/plugin-react`, `@rolldown/plugin-babel`, `babel-plugin-react-compiler` |

The React Compiler's three are marked optional, so an app that only splits
chunks is not made to install Babel. An app using `./react-compiler` installs
them itself:

```bash
npm install --save-dev @vitejs/plugin-react @rolldown/plugin-babel babel-plugin-react-compiler
```

The presets compose these packages rather than vendor them, so the app decides
which versions its build runs on.

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
object holding the groups below. It needs only `vite`, and it composes with
`./react-compiler` because the two live in different parts of the config.

| Group | Test | Priority | `entriesAware` |
| --- | --- | --- | --- |
| `react` | `/[\\/]node_modules[\\/](?:react\|react-dom\|scheduler)[\\/]/` | 30 | no |
| `design-system` | `/[\\/]design-system[\\/]/` | 20 | yes |
| `charting` | `/[\\/]charting[\\/]/` | 10 | yes |

A group that matches nothing emits no chunk, so an app without charts can take
the preset whole.

Neither package group names a dependency of the package it captures. Ark UI,
TanStack and lucide arrive with the design system and visx with charting
through rolldown's `includeDependenciesRecursively`, which the preset sets
explicitly rather than inheriting. That walk is also why the order is what it
is: React is a peer dependency of both packages, so it outranks them or their
walks would take it, and the design system outranks charting because charting
imports it and would otherwise pull the modules the entry needs into a
charting chunk.

### Why directory names, not package names

Vite resolves with `preserveSymlinks: false`, so a workspace or `npm link`ed
package's module ids are its real path, something like
`packages/design-system/dist/index.js`, with no `@r0hitsharma` segment in them.
A test on the scoped package name matches an npm install and silently matches
nothing when the package is linked, which is how a consumer developing against
this repository runs. So the design-system and charting tests match the
directory name, and cover both layouts.

The trade-off runs the other way: an app's own `src/design-system/` or
`src/charting/` directory is swept into the group too. Take it back with a
group that outranks the default (a tie goes to the default, which is declared
first):

```typescript
import codeSplitting, {
  GROUP_PRIORITY,
} from '@r0hitsharma/vite-config/code-splitting';

codeSplitting({
  groups: [
    {
      name: 'app-design-system',
      test: /[\\/]src[\\/]design-system[\\/]/,
      priority: GROUP_PRIORITY.designSystem + 1,
    },
  ],
});
```

Keep such a group to modules that do not import the design system package, for
the reason in the next section. React stays anchored on `node_modules`: it is
never linked, and the bare word is too common for a path segment.

### Adding app-specific groups

Pass them as `groups`; they are appended after the defaults:

```typescript
codeSplitting({
  groups: [{ name: 'maps', test: /[\\/]node_modules[\\/]maplibre-gl[\\/]/ }],
});
```

Leave their `priority` unset (0) or below 10 unless the point is to take
modules away from a default group. A group that outranks a default does not
only take its own modules: through the same dependency walk it takes every
module of that default its modules import. A drawer-only group ranked above
the design system takes the button the drawer uses, and since the entry needs
that button, the drawer now loads with the entry.

The result is a plain object, so global options go next to it:

```typescript
output: { codeSplitting: { ...codeSplitting(), minSize: 20_000 } },
```

`DEFAULT_GROUPS`, `GROUP_PRIORITY` and the three tests (`REACT_TEST`,
`DESIGN_SYSTEM_TEST`, `CHARTING_TEST`) are exported for a config that wants to
start from the defaults and reshape one. Each call returns fresh copies of the
groups, so editing the result never reaches the defaults.

### The option name matters

Vite 8 bundles with rolldown, and the option rolldown reads is
`build.rolldownOptions.output.codeSplitting`. The Rollup-era spellings are
still accepted, and none of them fails in a way that points here. Observed on
Vite 8.2.2 with rolldown 1.2.6:

| Config | Result |
| --- | --- |
| `manualChunks` function, alone | Applied, as one group with a dynamic name. No warning of any kind |
| `manualChunks` object, alone | Option validation warns, then the build fails: `manualChunks is not a function` |
| `advancedChunks`, alone | Applied, with `advancedChunks option is deprecated, please use codeSplitting instead.` |
| any of the three, plus `codeSplitting` | Ignored: `<option> option is ignored because the codeSplitting option is specified.` The object form also still logs its validation warning, but the build succeeds |

So a `manualChunks` function carried over from a Vite 7 config looks like it
works on its own: the named chunks appear. What it cannot express is
`entriesAware`, so it is permanently the flat grouping described below. Next to
this preset it does nothing at all, so delete it rather than keep it alongside.
`build.rollupOptions` is itself a deprecated alias of `build.rolldownOptions`.

### Why `entriesAware` is on

Without it a group is a single chunk. The app shell imports some design-system
code statically, so that one chunk loads up front, and it carries every
design-system module any route uses: the drawer that only one lazy route opens
is fetched on first paint, with the Ark UI code behind it. With `entriesAware`,
modules are grouped by the set of entries that reach them (dynamic imports
count as entries), so the shell's components get a chunk of their own and
drawer-only code lands in a chunk only that route loads. It is also what makes
the design system's subpath exports pay off: importing `design-system/drawer`
keeps the drawer out of the root barrel's graph, and `entriesAware` keeps it
out of the entry's chunk. Either alone leaves it there.

Charting has it for the same reason, against its `core`, `primitives` and
`xychart` subpaths: a route that imports only `primitives` should not download
`@visx/xychart` because another route asked for it.

The effect is not small. In a minimal app built against this repository's own
packages, with the design system's button in the shell and the drawer, an
xychart and a primitives chart behind three lazy routes:

| Groups | Loaded up front | Extra for the primitives route |
| --- | --- | --- |
| preset | ~193 kB | ~144 kB |
| design system flat | ~287 kB | |
| charting flat | ~193 kB | ~172 kB |

Minified JavaScript, measured as emitted bytes.

### Confirming it applied

A group rolldown never reads changes nothing visible. The chunk names are the
check: after `vite build`, `dist/assets/` should hold `react-*.js` and
`design-system~<entries>-*.js` / `charting~<entries>-*.js` files, the part
after `~` naming the entries that share that chunk. This package's own tests
make the same checks against real builds, in both the installed and the linked
layout, and pin every behaviour this section describes, each against a control
build that must break it.
