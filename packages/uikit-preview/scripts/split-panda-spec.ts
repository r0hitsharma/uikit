import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type SpecValue = {
  condition?: string;
  token: string;
  value: string;
};

type SpecToken = {
  category: string;
  cssVar?: string;
  semantic?: boolean;
};

type PandaSpec = {
  colorPalettes: unknown;
  conditions: unknown;
  keyframes: unknown;
  recipes: unknown;
  slotRecipes: unknown;
  textStyles: unknown;
  tokens: Record<string, SpecToken>;
  values: SpecValue[];
};

type TokenValue = {
  cssVar?: string;
  name: string;
  value: string;
};

type SemanticTokenValue = {
  cssVar?: string;
  name: string;
  values: Array<{
    condition: string;
    value: string;
  }>;
};

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const specDir = path.resolve(scriptDir, '../static/tokens/spec');
const sourcePath = path.join(specDir, 'source.json');
const spec = JSON.parse(readFileSync(sourcePath, 'utf8')) as PandaSpec;

const toGroups = <T>(entries: Array<[string, T]>) => {
  const groups = new Map<string, T[]>();

  for (const [category, value] of entries) {
    groups.get(category)?.push(value) ?? groups.set(category, [value]);
  }

  return [...groups].map(([type, values]) => ({ type, values }));
};

const baseTokens: Array<[string, TokenValue]> = [];
const semanticTokens = new Map<
  string,
  [category: string, value: SemanticTokenValue]
>();

for (const value of spec.values) {
  const token = spec.tokens[value.token];
  if (!token) continue;

  const name = value.token.slice(token.category.length + 1);
  if (token.semantic) {
    const entry = semanticTokens.get(value.token)?.[1] ?? {
      cssVar: token.cssVar,
      name,
      values: [],
    };
    entry.values.push({
      condition: value.condition === '_dark' ? 'dark' : 'base',
      value: value.value.startsWith('{') ? value.value : `{${value.value}}`,
    });
    semanticTokens.set(value.token, [token.category, entry]);
    continue;
  }

  if (value.condition) continue;
  baseTokens.push([
    token.category,
    { cssVar: token.cssVar, name, value: value.value },
  ]);
}

mkdirSync(specDir, { recursive: true });

const writeSpec = (name: string, type: string, data: unknown) =>
  writeFileSync(
    path.join(specDir, name),
    `${JSON.stringify({ data, type }, null, 2)}\n`,
  );

writeSpec('tokens.json', 'tokens', toGroups(baseTokens));
writeSpec(
  'semantic-tokens.json',
  'semantic-tokens',
  toGroups(
    [...semanticTokens.values()].map(([category, token]) => [category, token]),
  ),
);
writeSpec('patterns.json', 'patterns', {});
writeSpec('recipes.json', 'recipes', spec.recipes);
writeSpec('text-styles.json', 'text-styles', spec.textStyles);
writeSpec('layer-styles.json', 'layer-styles', {});
writeSpec('conditions.json', 'conditions', spec.conditions);
writeSpec('animation-styles.json', 'animation-styles', {});
writeSpec('keyframes.json', 'keyframes', spec.keyframes);
writeSpec('color-palette.json', 'color-palette', spec.colorPalettes);
