import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { noMutableStateInPageObjectRule } from "./noMutableStateInPageObject.js";
import { pageObject } from "./testSupport.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

ruleTester.run(
  "no-mutable-state-in-page-object",
  noMutableStateInPageObjectRule.module,
  {
    invalid: [
      {
        code: pageObject(`private currentUser?: string;`),
        errors: [{ data: { name: "currentUser" }, messageId: "mutableField" }],
      },
      {
        code: pageObject(`private count = 0;`),
        errors: [{ messageId: "mutableField" }],
      },
      {
        code: pageObject(`protected items: string[] = [];`, "SubPageObject<X>"),
        errors: [{ messageId: "mutableField" }],
      },
      {
        // Access does not matter; a public field is state too.
        code: pageObject(`lastError = "";`, "EntryPointPageObject"),
        errors: [{ messageId: "mutableField" }],
      },
    ],
    valid: [
      { code: pageObject(`private readonly timeout = 5000;`) },
      { code: pageObject(`static instances = 0;`) },
      { code: pageObject(`declare readonly brand: string;`) },
      {
        // The locator map is not state, whichever form and modifiers hold it.
        code: pageObject(`
          private readonly locators = { ok: this.page.getByRole("button") } as const;
          private selectors = {};
        `),
      },
      {
        // Not a page object.
        code: `class Counter { count = 0; }`,
      },
      {
        // Pins the documented blind spot.
        code: `class AdminPage extends SettingsPage { private count = 0; }`,
      },
    ],
  },
);
