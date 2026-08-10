import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['lib/**', 'coverage/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-explicit-any': 'error' } },
);
