import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // `_archive/landing-nextjs-legacy/` est l'ancien projet Next.js du site
  // vitrine (voir docs/MIGRATION_SITE_VITRINE_REPORT.md), archivé après
  // décision explicite (E6, voir docs/ARCHITECTURE_PLATFORM_TENANT_FINAL.md)
  // — conservé tel quel comme référence historique, pas linté par
  // l'outillage du projet principal (config/tsconfig distincts).
  { ignores: ['dist', '_archive'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  }
);
