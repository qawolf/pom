// ESLint config for @qawolf/pom.
//
// This is a self-contained replica of the meaningful, publicly-installable
// subset of the platform monorepo's `plugin:@qawolf/main` config. The custom
// `@qawolf/*` rules (max-lines, restrict-names, imports-config, …) and the
// React/JSX rules are intentionally omitted: the former ship only in the
// internal, GitHub-Packages-only `@qawolf/eslint-plugin`, and the latter do
// not apply to this non-React library. TypeScript strictness lives in
// tsconfig.json and matches the monorepo exactly.

module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  env: {
    node: true,
    es2024: true,
  },
  plugins: [
    "@typescript-eslint",
    "import",
    "n",
    "promise",
    "jest",
    "eslint-comments",
    "perfectionist",
  ],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:import/recommended",
    "plugin:import/typescript",
    "plugin:n/recommended",
    "plugin:promise/recommended",
    "plugin:jest/recommended",
    "plugin:eslint-comments/recommended",
    // Must be last: turns off rules that conflict with Prettier.
    "prettier",
  ],
  settings: {
    "import/resolver": {
      typescript: true,
      node: true,
    },
  },
  rules: {
    // --- Rules the monorepo turns off on top of the recommended presets ---
    "@typescript-eslint/switch-exhaustiveness-check": "off",
    "import/default": "off",
    "import/namespace": "off",
    "import/no-named-as-default": "off",
    "import/no-named-as-default-member": "off",
    "import/order": "off",
    "jest/no-jest-import": "off",
    "n/no-missing-import": "off",
    "no-inner-declarations": "off",
    "promise/always-return": "off",
    "promise/no-callback-in-promise": "off",

    // --- Style / correctness rules ---
    "@typescript-eslint/consistent-type-definitions": ["error", "type"],
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { fixStyle: "separate-type-imports" },
    ],
    "@typescript-eslint/no-non-null-assertion": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        args: "all",
        argsIgnorePattern: "^_",
        ignoreRestSiblings: true,
        varsIgnorePattern: "^_",
      },
    ],
    curly: ["error", "multi-or-nest"],
    eqeqeq: ["error", "always", { null: "ignore" }],
    "import/consistent-type-specifier-style": ["error", "prefer-top-level"],
    "import/no-cycle": ["error", { ignoreExternal: true }],
    "import/no-duplicates": "error",
    "max-params": ["error", { max: 3 }],
    "no-constant-condition": ["error", { checkLoops: false }],
    "no-restricted-globals": [
      "error",
      {
        name: "isNaN",
        message:
          "Use Number.isNaN. It is newer and has more reliable and predictable behavior.",
      },
    ],
    "no-restricted-syntax": [
      "error",
      {
        selector: "ExportDefaultDeclaration",
        message: "Use named exports instead of default exports",
      },
      {
        selector: "TSEnumDeclaration",
        message: "Use string unions instead of enums",
      },
      {
        selector: "UnaryExpression[operator='void']",
        message:
          "Use explicit `return undefined` instead of void. If you have a promise that you want to drop on the floor, use an explicit eslint-disable-next-line comment with an explanation of why dropping it on the floor is alright.",
      },
    ],
    "no-sequences": ["error", { allowInParentheses: false }],
    "no-throw-literal": "error",
    "object-shorthand": [
      "error",
      "always",
      { avoidExplicitReturnArrows: true },
    ],

    // --- eslint-comments ---
    "eslint-comments/disable-enable-pair": ["error", { allowWholeFile: true }],
    "eslint-comments/require-description": [
      "error",
      { ignore: ["eslint-enable"] },
    ],

    // --- jest ---
    "jest/expect-expect": [
      "error",
      {
        assertFunctionNames: ["expect", "expectTypeOf", "expectForbiddenError"],
      },
    ],
    "jest/no-commented-out-tests": "error",
    "jest/no-disabled-tests": "error",
    "jest/valid-title": [
      "error",
      { ignoreTypeOfDescribeName: true, ignoreTypeOfTestName: true },
    ],

    // --- node ---
    "n/no-unsupported-features/es-syntax": [
      "error",
      { ignores: ["dynamicImport", "modules"] },
    ],
    "n/no-extraneous-import": [
      "error",
      { allowModules: ["@jest/globals", "expect-type", "playwright"] },
    ],

    // --- promise ---
    "promise/catch-or-return": ["error", { allowFinally: true }],
    "promise/no-nesting": "error",
    "promise/no-promise-in-callback": "error",
    "promise/no-return-in-finally": "error",
    "promise/valid-params": "error",

    // --- perfectionist (natural sort), matching the monorepo options ---
    "perfectionist/sort-array-includes": ["error", { type: "natural" }],
    "perfectionist/sort-classes": ["error", { type: "natural" }],
    "perfectionist/sort-decorators": ["error", { type: "natural" }],
    "perfectionist/sort-enums": ["error", { type: "natural" }],
    "perfectionist/sort-exports": ["error", { type: "natural" }],
    "perfectionist/sort-imports": [
      "error",
      {
        type: "natural",
        sortSideEffects: true,
        internalPattern: ["^~/", "^@/", "^app/"],
        customGroups: {
          type: { "qawolf-type": ["^@qawolf/"] },
          value: { qawolf: ["^@qawolf/"] },
        },
        groups: [
          ["side-effect", "side-effect-style"],
          ["builtin", "builtin-type", "external", "external-type"],
          ["qawolf", "qawolf-type"],
          ["internal", "internal-type"],
          ["parent", "parent-type"],
          ["index", "index-type", "sibling", "sibling-type"],
          "object",
          "unknown",
        ],
      },
    ],
    "perfectionist/sort-interfaces": ["error", { type: "natural" }],
    "perfectionist/sort-maps": ["error", { type: "natural" }],
    "perfectionist/sort-named-exports": [
      "error",
      { type: "natural", groupKind: "types-first" },
    ],
    "perfectionist/sort-named-imports": [
      "error",
      { type: "natural", groupKind: "types-first", ignoreAlias: true },
    ],
    "perfectionist/sort-object-types": ["error", { type: "natural" }],
    "perfectionist/sort-objects": [
      "error",
      { type: "natural", partitionByNewLine: true },
    ],
    "perfectionist/sort-sets": ["error", { type: "natural" }],
    "perfectionist/sort-switch-case": ["error", { type: "natural" }],

    // --- package-local import restrictions (from the monorepo package config) ---
    "no-restricted-imports": [
      "error",
      {
        patterns: ["@qawolf/playground-*", "@qawolf/runner-*", "@qawolf/pom"],
      },
    ],
  },
  overrides: [
    {
      // Hand-authored JS config files: allow default exports and CommonJS, and
      // keep them grouped/commented for readability rather than object-sorted.
      files: ["*.{cjs,js,mjs}", "**/*.config.{cjs,js,mjs}"],
      rules: {
        "no-restricted-syntax": "off",
        "perfectionist/sort-objects": "off",
        "@typescript-eslint/no-require-imports": "off",
        "@typescript-eslint/no-var-requires": "off",
        "n/no-unpublished-import": "off",
        "n/no-unpublished-require": "off",
      },
    },
    {
      // Test and type-test files may import devDependencies.
      files: ["**/*.test.{cts,ts,tsx}", "**/*.type-test.{cts,ts,tsx}"],
      rules: {
        "n/no-unpublished-import": "off",
      },
    },
    {
      // Type-test files assert types via bare expressions.
      files: ["**/*.type-test.{cts,ts,tsx}"],
      rules: {
        "@typescript-eslint/no-unused-expressions": "off",
      },
    },
  ],
  ignorePatterns: ["dist", "node_modules"],
};
