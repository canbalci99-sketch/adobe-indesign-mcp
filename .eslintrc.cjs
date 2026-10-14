/**
 * Lint config.
 *
 * The lint script existed for years without a config: `eslint src/` printed a
 * usage error and exited 0, so CI "passed" a check that could not fail. A check
 * that cannot fail is worse than no check, because it is trusted.
 *
 * `recommended` here, not `strict-type-checked`: the type-aware rules need a
 * project reference, roughly double the lint time, and this codebase talks to
 * InDesign through strings, where `any` is the honest type at the boundary.
 */
module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist/', 'node_modules/', 'coverage/', 'plugin/', '*.cjs', '*.mjs'],
  rules: {
    // MCP handlers receive `unknown` from the transport and narrow it; the DOM
    // is reached through ExtendScript strings. `any` at that seam is deliberate.
    '@typescript-eslint/no-explicit-any': 'off',
    // Unused args are often part of a handler signature that must match.
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    // `try { ... } catch (e) {}` is the documented way to probe for an optional
    // InDesign DOM property that throws instead of returning undefined.
    'no-empty': ['error', { allowEmptyCatch: true }],
    '@typescript-eslint/no-unused-expressions': [
      'error',
      { allowShortCircuit: true, allowTernary: true },
    ],
  },
};
