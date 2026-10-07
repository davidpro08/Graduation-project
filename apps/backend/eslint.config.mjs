import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: globals.node, parserOptions: { tsconfigRootDir: import.meta.dirname } } },
  { files: ['tests/**/*.cjs', 'scripts/**/*.cjs'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
];
