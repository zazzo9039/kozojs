import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['lib/**', 'templates/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { console: 'readonly', process: 'readonly', Buffer: 'readonly', __dirname: 'readonly' } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
