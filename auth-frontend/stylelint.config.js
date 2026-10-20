/** @type {import('stylelint').Config} */
export default {
    extends: ["stylelint-config-standard"],
    rules: {
        "at-rule-no-unknown": [
            true,
            {
                ignoreAtRules: [
                    "tailwind",
                    "apply",
                    "variants",
                    "responsive",
                    "screen",
                    "layer",
                    "import",
                    "plugin",
                    "source",
                    "custom-variant",
                    "theme",
                ],
            },
        ],
        // Stylelint 17 checks at-rule preludes; Tailwind's @apply takes class names.
        "at-rule-prelude-no-invalid": [true, {ignoreAtRules: ["apply"]}],
        "custom-property-pattern": null, // Allow custom properties to be named anything
        "import-notation": null,
        "function-no-unknown": [
            true,
            {
                ignoreFunctions: ["theme"],
            },
        ],
        "selector-class-pattern": null,
        "declaration-block-no-redundant-longhand-properties": null,
    },
    ignoreFiles: ["dist/**", "node_modules/**"],
};
