import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/**', '.expo/**', 'dist/**', 'build/**', 'supabase/.temp/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Build config files are CommonJS and run in Node, not in the bundle.
    files: ['babel.config.js', 'metro.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' },
    },
  },
  {
    // Repo scripts are ES modules run by Node directly, never bundled. They
    // print to the terminal and set an exit code, which is their whole job.
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: { console: 'readonly', process: 'readonly' },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      // Unused args are fine when prefixed with _, which keeps signatures honest.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Supabase responses are untyped at the edge; casts there are deliberate.
      '@typescript-eslint/no-explicit-any': 'error',
      eqeqeq: ['error', 'smart'],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
);
