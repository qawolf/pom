import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { noCodeBetweenStepsRule } from "./noCodeBetweenSteps.js";
import { flow } from "./testSupport.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

ruleTester.run("no-code-between-steps", noCodeBetweenStepsRule.module, {
  invalid: [
    {
      code: flow(`
        await test("Sign in", async () => {});
        const cart = await home.goToCart();
        await test("Add to cart", async () => {});
      `),
      errors: [{ messageId: "betweenSteps" }],
    },
    {
      // After the last step is still after the first.
      code: flow(`
        await test("Sign in", async () => {});
        await login.closeBrowser();
      `),
      errors: [{ messageId: "betweenSteps" }],
    },
    {
      // A `test(...)` that is not awaited as a statement is not a step.
      code: flow(`
        await test("Sign in", async () => {});
        test("Add to cart", async () => {});
        const done = await test("Check out", async () => {});
      `),
      errors: [{ messageId: "betweenSteps" }, { messageId: "betweenSteps" }],
    },
    {
      code: `import { flow } from "@qawolf/flows/web";
        export default flow.skip("Name", "Web - Chrome", async ({ test }) => {
          await test("Sign in", async () => {});
          let x = 1;
        });`,
      errors: [{ messageId: "betweenSteps" }],
    },
  ],
  valid: [
    {
      code: flow(`
        let cart: CartPage;
        const testData = { email: requireEnv("EMAIL") };
        await test("Sign in", async () => {});
        await test("Add to cart", async () => {
          cart = await home.goToCart();
        });
      `),
    },
    {
      // No steps at all: nothing to be between.
      code: flow(`const login = await LoginPage.create();`),
    },
    {
      // Not a flow module.
      code: `async function run({ test }) {
        await test("a", async () => {});
        const x = 1;
      }`,
    },
  ],
});
