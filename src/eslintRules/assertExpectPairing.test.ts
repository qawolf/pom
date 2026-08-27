import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { assertExpectPairingRule } from "./assertExpectPairing.js";
import { pageObject } from "./testSupport.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

ruleTester.run("assert-expect-pairing", assertExpectPairingRule.module, {
  invalid: [
    {
      code: pageObject(`
        async save() {
          await this.locators.save.click();
          await expect(this.locators.toast).toBeVisible();
        }
      `),
      errors: [
        {
          data: { name: "save", suggested: "assertSave" },
          messageId: "expectOutsideAssert",
        },
      ],
    },
    {
      // Nested in a callback inside the method is still the method's.
      code: pageObject(`
        async checkAll(names: string[]) {
          await Promise.all(
            names.map((name) => expect(this.locators.row(name)).toBeVisible()),
          );
        }
      `),
      errors: [{ messageId: "expectOutsideAssert" }],
    },
    {
      // The soft form asserts too.
      code: pageObject(`
        async open() { expect.soft(this.locators.title).toBeVisible(); }
      `),
      errors: [{ messageId: "expectOutsideAssert" }],
    },
    {
      // A static factory is a method like any other.
      code: pageObject(
        `static async create() {
          const page = await this.initializeBrowser();
          await expect(page).toHaveURL(/login/);
          return new this(page);
        }`,
        "EntryPointPageObject",
      ),
      errors: [{ messageId: "expectOutsideAssert" }],
    },
    {
      // `assert` must be followed by a capital: `assertion()` is not `assert*()`.
      code: pageObject(
        `async assertion() { await expect(this.locators.x).toBeVisible(); }`,
        "SubPageObject<HomePage>",
      ),
      errors: [{ messageId: "expectOutsideAssert" }],
    },
  ],
  valid: [
    {
      code: pageObject(`
        async save() { await this.locators.save.click(); }
        async assertSaved() { await expect(this.locators.toast).toBeVisible(); }
      `),
    },
    {
      // A property initializer is not a method; the rule is about method names.
      code: pageObject(
        `private readonly check = () => expect(this.locators.x).toBeVisible();`,
      ),
    },
    {
      // Not a page object.
      code: `class Api {
        async save() { expect(await this.post()).toBe(200); }
      }`,
    },
    {
      // Pins the documented blind spot: a page object extending another names
      // no base class here.
      code: `class AdminSettingsPage extends SettingsPage {
        async save() { await expect(this.locators.toast).toBeVisible(); }
      }`,
    },
    {
      // Outside any class.
      code: `async function save() { await expect(x).toBeVisible(); }`,
    },
  ],
});
