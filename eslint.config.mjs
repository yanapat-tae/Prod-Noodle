import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig(
  { ignores: ['node_modules/**', 'dist/**', '.html-preview-build/**', '.local-data/**', '.pnpm-*/**'] },
  { files: ['**/*.{js,mjs,ts,tsx}'], extends: [js.configs.recommended] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
    rules: {
      // Existing JSON/RPC boundaries are checked at runtime; stricter types are future work.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
    },
  },
  { files: ['src/**', 'preview/**'], languageOptions: { globals: globals.browser } },
  { files: ['server/**', 'scripts/**', 'tests/**', '*.config.{ts,mjs}'], languageOptions: { globals: globals.node } },
  { files: ['supabase/functions/**'], languageOptions: { globals: { ...globals.browser, Deno: 'readonly' } } },
  { files: ['public/sw.js'], languageOptions: { globals: globals.serviceworker } },
);
