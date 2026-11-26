import globals from 'globals';
export default [{ files: ['**/*.js'], ignores: ['node_modules/**','coverage/**'], languageOptions: { globals: { ...globals.node } }, rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }], 'no-console': 'off' } }];
