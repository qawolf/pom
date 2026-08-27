import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { requirePageObjectBaseClassRule } from "./requirePageObjectBaseClass.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

ruleTester.run(
  "require-page-object-base-class",
  requirePageObjectBaseClassRule.module,
  {
    invalid: [
      {
        code: `class SettingsPage {
          private get locators() { return {} as const; }
        }`,
        errors: [
          { data: { name: "SettingsPage" }, messageId: "missingBaseClass" },
        ],
      },
      {
        // The property form marks a page object just the same.
        code: `class SettingsPage {
          private readonly selectors = {} as const;
        }`,
        errors: [{ messageId: "missingBaseClass" }],
      },
      {
        code: `const SettingsPage = class {
          private get dynamicLocators() { return {} as const; }
        };`,
        errors: [
          { data: { name: "This class" }, messageId: "missingBaseClass" },
        ],
      },
    ],
    valid: [
      {
        code: `class SettingsPage extends BasePageObject {
          private get locators() { return {} as const; }
        }`,
      },
      {
        // May be a page object extending another; not a mistake a rule
        // without type information can call.
        code: `class AdminSettingsPage extends SettingsPage {
          private get locators() { return {} as const; }
        }`,
      },
      {
        // A method named `locators` is not the map.
        code: `class Helper { locators() { return {}; } }`,
      },
      {
        // Nothing page-object-like about it.
        code: `class Counter { count = 0; }`,
      },
    ],
  },
);
