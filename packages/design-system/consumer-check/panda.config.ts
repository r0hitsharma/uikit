import { defineConfig } from '@pandacss/dev';
import { designSystemStaticCssRecipes } from '@r0hitsharma/design-system';
import { designSystemStandalonePreset } from '@r0hitsharma/design-system/panda-preset';

// A consumer config exactly as the package README documents it: the BUILT
// preset (resolved through `node_modules`, so `dist/` must exist) and nothing
// else in `presets`, plus the shared `staticCss` map. `check.sh` fails if Panda
// reports a token this setup leaves unresolved. `validation: 'error'` is the
// one addition: it makes Panda exit non-zero on any config validation problem
// (missing, unknown, self or circular token references, and the rest), which
// it otherwise only logs as a warning. Not published: the package's
// `files` field ships only `dist`, `src` and `scripts`.
export default defineConfig({
  presets: [designSystemStandalonePreset],
  validation: 'error',
  staticCss: {
    recipes: {
      ...designSystemStaticCssRecipes,
    },
  },
  include: ['./src/**/*.ts'],
  outdir: 'styled-system',
});
