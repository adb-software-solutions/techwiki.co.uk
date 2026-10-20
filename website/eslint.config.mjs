import pluginNext from "@next/eslint-plugin-next";
import parser from "@typescript-eslint/parser";

export default [
    // On its own, so it applies to every config: beside other keys, `ignores`
    // only narrows that one object and ESLint still lints the build output.
    {
        ignores: ["node_modules/**", ".next/**", "out", "coverage/**"],
    },
    {
        name: "ESLint Config - nextjs",
        languageOptions: {
            parser,
            parserOptions: {
                ecmaVersion: "latest",
                sourceType: "module",
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
        plugins: {
            "@next/next": pluginNext,
        },
        files: ["**/*.{js,mjs,cjs,ts,jsx,tsx}"],
        rules: {
            ...pluginNext.configs.recommended.rules,
            ...pluginNext.configs["core-web-vitals"].rules,
            "no-html-link-for-pages": 0,
            "@next/next/no-html-link-for-pages": "off",
            "react-hooks/exhaustive-deps": 0,
        },
    },
];
