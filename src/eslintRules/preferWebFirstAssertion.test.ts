import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { preferWebFirstAssertionRule } from "./preferWebFirstAssertion.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

ruleTester.run(
  "prefer-web-first-assertion",
  preferWebFirstAssertionRule.module,
  {
    invalid: [
      {
        code: `expect(await this.locators.toast.isVisible()).toBe(true);`,
        errors: [
          {
            data: { matcher: "toBeVisible", snapshot: "isVisible" },
            messageId: "snapshotAssertion",
          },
        ],
      },
      {
        code: `expect(await rows.count()).toBe(3);`,
        errors: [
          {
            data: { matcher: "toHaveCount", snapshot: "count" },
            messageId: "snapshotAssertion",
          },
        ],
      },
      {
        code: `expect(await input.inputValue()).toEqual("x");`,
        errors: [{ messageId: "snapshotAssertion" }],
      },
      {
        code: `expect(await link.getAttribute("href")).toContain("/x");`,
        errors: [{ messageId: "snapshotAssertion" }],
      },
    ],
    valid: [
      { code: `await expect(this.locators.toast).toBeVisible();` },
      { code: `await expect(rows).toHaveCount(3);` },
      {
        // Not a locator snapshot: an API result has no web-first form.
        code: `expect(await api.getUser()).toEqual({ id: 1 });`,
      },
      {
        // Not awaited inside `expect`: a different (also fine) shape.
        code: `await expect(toast.isVisible()).resolves.toBe(true);`,
      },
      { code: `expect(total).toBe(3);` },
    ],
  },
);
