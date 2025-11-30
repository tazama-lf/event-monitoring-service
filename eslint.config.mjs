// SPDX-License-Identifier: Apache-2.0
import eslintPluginEslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import stylistic from '@stylistic/eslint-plugin';
import tsEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import eslintStandard from 'eslint-config-love';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig([
  eslintConfigPrettier,
  globalIgnores(['**/coverage/**', '**/build/**', '**/node_modules/**', '**/__tests__/**', '*.ts']),
  {
    files: ['**/*.ts'],
    plugins: {
      ...eslintStandard.plugins,
      ['@eslint-community/eslint-comments']: eslintPluginEslintComments,
      ['@stylistic']: stylistic,
      ['@typescript-eslint']: tsEslint,
    },
    languageOptions: {
      ...eslintStandard.languageOptions,
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        project: ['./tsconfig.json'],
      },
    },
    rules: {
      ...eslintStandard.rules,
      ...eslintPluginEslintComments.configs.recommended.rules,
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: ['eslint-enable'] }],
      '@eslint-community/eslint-comments/disable-enable-pair': 'error',
      '@typescript-eslint/init-declarations': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-magic-numbers': 'warn',
      '@typescript-eslint/no-var-requires': 'off',
      '@typescript-eslint/no-unsafe-type-assertion': 'off',
      '@typescript-eslint/no-use-before-define': 'off',
      '@typescript-eslint/prefer-destructuring': 'warn',
      '@typescript-eslint/prefer-optional-chain': 'warn',
      '@typescript-eslint/restrict-template-expressions': 'error',
      '@typescript-eslint/strict-boolean-expressions': 'off',
      '@typescript-eslint/max-params': ['error', { max: 6 }],
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/await-thenable': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
      '@stylistic/quotes': ['error', 'single'],
      'complexity': ['warn', { max: 15 }],
      'max-depth': 'off',
      'new-cap': 'off',
      'no-console': 'error',
      'no-unneeded-ternary': 'off',
      'promise/avoid-new': 'off',
      /* eslint-comments are bundled with eslint-config-love but they are using the unmaintained plugin. Replaced with @eslint-community/eslint-plugin-eslint-comments */
      'eslint-comments/require-description': 'off',
      'eslint-comments/disable-enable-pair': 'off',
      'eslint-comments/no-aggregating-enable': 'off',
      'eslint-comments/no-duplicate-disable': 'off',
      'eslint-comments/no-unlimited-disable': 'off',
      'eslint-comments/no-unused-enable': 'off',
    },
  },
]);
