/** @type {import('eslint').Linter.Config} */
module.exports = {
	root: true,
	extends: ['eslint:recommended', 'prettier'],
	parserOptions: {
		ecmaVersion: 2022,
		sourceType: 'module'
	},
	env: {
		browser: true,
		es2022: true,
		node: true
	},
	overrides: [
		{
			files: ['*.ts', '*.tsx'],
			parser: '@typescript-eslint/parser',
			extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
			rules: {
				'@typescript-eslint/no-unused-vars': [
					'error',
					{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
				],
				'@typescript-eslint/no-explicit-any': 'warn'
			}
		},
		{
			files: ['*.svelte'],
			parser: 'svelte-eslint-parser',
			parserOptions: {
				parser: '@typescript-eslint/parser'
			},
			extends: [
				'eslint:recommended',
				'plugin:@typescript-eslint/recommended',
				'plugin:svelte/recommended',
				'prettier'
			],
			rules: {
				'svelte/no-at-html-tags': 'warn'
			}
		}
	]
};
