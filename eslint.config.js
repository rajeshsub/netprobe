import js from '@eslint/js'
import ts from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import svelte from 'eslint-plugin-svelte'
import svelteParser from 'svelte-eslint-parser'
import globals from 'globals'

const svelte5Runes = {
  $state: 'readonly',
  $derived: 'readonly',
  $effect: 'readonly',
  $props: 'readonly',
  $bindable: 'readonly',
  $inspect: 'readonly',
  $host: 'readonly',
}

const unusedVarsRule = [
  'error',
  { varsIgnorePattern: '^_', argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
]

export default [
  js.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    files: ['**/*.ts'],
    ignores: ['**/*.svelte.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.app.json',
        extraFileExtensions: ['.svelte'],
      },
    },
    plugins: { '@typescript-eslint': ts },
    rules: {
      ...ts.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': unusedVarsRule,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
    },
  },
  {
    files: ['**/*.svelte.ts'],
    languageOptions: {
      parser: tsParser,
      globals: {
        ...globals.browser,
        ...svelte5Runes,
      },
    },
    plugins: { '@typescript-eslint': ts },
    rules: {
      ...ts.configs.recommended.rules,
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': unusedVarsRule,
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tsParser,
      },
      globals: {
        ...globals.browser,
        ...svelte5Runes,
      },
    },
    plugins: { svelte, '@typescript-eslint': ts },
    rules: {
      ...svelte.configs.recommended.rules,
      'no-unused-vars': unusedVarsRule,
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['src/lib/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.svelte-kit/**',
      'public/**',
      'vite.config.ts',
      'svelte.config.js',
      'eslint.config.js',
    ],
  },
]
