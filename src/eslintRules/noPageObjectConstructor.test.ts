import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { noPageObjectConstructorRule } from "./noPageObjectConstructor.js";
import { pageObject } from "./testSupport.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

const constructor = [{ messageId: "constructor" }];

ruleTester.run(
  "no-page-object-constructor",
  noPageObjectConstructorRule.module,
  {
    invalid: [
      {
        // Extra parameters cannot be supplied by `createFromPage` or `create`.
        code: pageObject(`
          constructor(page: Page, private readonly locale: string) {
            super(page);
          }
        `),
        errors: constructor,
      },
      {
        // Forwarding `page` alone does nothing the base does not already do.
        code: pageObject(`constructor(page: Page) { super(page); }`),
        errors: constructor,
      },
      {
        code: pageObject(
          `constructor(page: Page) { super(page); }`,
          "SubPageObject<HomePage>",
        ),
        errors: constructor,
      },
      {
        code: pageObject(
          `private constructor(page: Page) { super(page); }`,
          "EntryPointPageObject",
        ),
        errors: constructor,
      },
    ],
    valid: [
      { code: pageObject(`async save() {}`) },
      {
        // Not a page object.
        code: `class Api { constructor(private readonly baseUrl: string) {} }`,
      },
      {
        // Pins the documented blind spot.
        code: `class AdminPage extends SettingsPage {
          constructor(page: Page) { super(page); }
        }`,
      },
    ],
  },
);
