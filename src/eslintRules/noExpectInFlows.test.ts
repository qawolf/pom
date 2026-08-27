import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { noExpectInFlowsRule } from "./noExpectInFlows.js";
import { flow } from "./testSupport.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

const expectInFlow = [{ messageId: "expectInFlow" }];

ruleTester.run("no-expect-in-flows", noExpectInFlowsRule.module, {
  invalid: [
    {
      code: flow(`await expect(page.getByText("Saved")).toBeVisible();`),
      errors: expectInFlow,
    },
    {
      code: flow(`expect(total).toBe(3);`),
      errors: expectInFlow,
    },
    {
      // The soft and poll forms assert just the same.
      code: flow(`
        expect.soft(total).toBe(3);
        await expect.poll(() => count()).toBe(3);
      `),
      errors: [...expectInFlow, ...expectInFlow],
    },
    {
      // Inside a test step is still inside the flow.
      code: flow(`
        await test("checks", async () => {
          await expect(page).toHaveURL(/done/);
        });
      `),
      errors: expectInFlow,
    },
  ],
  valid: [
    {
      code: flow(`await settings.assertSaved();`),
    },
    {
      // Another object's `expect` is not the assertion library.
      code: flow(`await mock.expect("GET /users");`),
    },
    {
      // Not a flow module.
      code: `async function check() { await expect(x).toBeVisible(); }`,
    },
  ],
});
