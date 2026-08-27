import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { noWaitForTimeoutRule } from "./noWaitForTimeout.js";
import { flow, pageObject } from "./testSupport.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

ruleTester.run("no-wait-for-timeout", noWaitForTimeoutRule.module, {
  invalid: [
    {
      code: flow(`await page.waitForTimeout(1000);`),
      errors: [{ messageId: "waitForTimeout" }],
    },
    {
      code: flow(`await page.waitForSelector(".loaded");`),
      errors: [{ messageId: "waitForSelector" }],
    },
    {
      code: pageObject(`
        async open() {
          await this.page.waitForTimeout(500);
          await this.page.waitForSelector(".loaded");
        }
      `),
      errors: [
        { messageId: "waitForTimeout" },
        { messageId: "waitForSelector" },
      ],
    },
    {
      // The receiver does not matter: a frame or a second page waits the same.
      code: pageObject(
        `async open(frame: Frame) { await frame.waitForTimeout(1); }`,
        "SubPageObject<HomePage>",
      ),
      errors: [{ messageId: "waitForTimeout" }],
    },
  ],
  valid: [
    {
      code: pageObject(`
        async open() {
          await this.locators.loaded.waitFor();
          await this.page.waitForURL(/dashboard/);
          await expect(this.locators.loaded).toBeVisible();
        }
      `),
    },
    {
      // Neither a flow nor a page object: a helper is not checked.
      code: `async function settle(page: Page) { await page.waitForTimeout(1); }`,
    },
    {
      // Pins the documented blind spot.
      code: `class AdminPage extends SettingsPage {
        async open() { await this.page.waitForTimeout(1); }
      }`,
    },
  ],
});
