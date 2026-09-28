const js = require('@eslint/js');
const globals = require('globals');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = [
    {
        ignores: ['dist/**', 'node_modules/**']
    },
    js.configs.recommended,
    {
        files: ['**/*.{js,jsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: {
                ecmaFeatures: { jsx: true }
            },
            globals: {
                ...globals.browser,
                ...globals.node
            }
        },
        plugins: {
            react,
            'react-hooks': reactHooks
        },
        rules: {
            'no-console': 'off',
            'no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                caughtErrors: 'none',
                varsIgnorePattern: '^React$'
            }],
            'react/jsx-uses-vars': 'error',
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'error'
        }
    },
    {
        files: ['main.js', 'preload.js', 'ipc/**/*.js', 'eslint.config.js'],
        languageOptions: {
            sourceType: 'commonjs'
        }
    }
];
