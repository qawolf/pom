import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { testAaaCommentsRule } from "./testAaaComments.js";
import { flow } from "./testSupport.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

ruleTester.run("test-aaa-comments", testAaaCommentsRule.module, {
  invalid: [
    {
      code: flow(`
        await test("Add to cart", async () => {
          await product.addToCart();
        });
      `),
      errors: [
        {
          data: { missing: "Arrange, Act, Assert", name: "Add to cart" },
          messageId: "missingSections",
        },
      ],
    },
    {
      // Only the missing sections are named.
      code: flow(`
        await test("Add to cart", async () => {
          // Arrange:
          await home.goToProduct();
          // Act:
          await product.addToCart();
        });
      `),
      errors: [
        {
          data: { missing: "Assert", name: "Add to cart" },
          messageId: "missingSections",
        },
      ],
    },
    {
      // A comment outside the step body does not count for it.
      code: flow(`
        // Arrange / Act / Assert
        await test("Add to cart", async () => {
          await product.addToCart();
        });
      `),
      errors: [{ messageId: "missingSections" }],
    },
    {
      // Each step is checked on its own.
      code: flow(`
        await test("One", async () => { /* Arrange, Act, Assert */ });
        await test("Two", async () => {});
      `),
      errors: [
        {
          data: { missing: "Arrange, Act, Assert", name: "Two" },
          messageId: "missingSections",
        },
      ],
    },
  ],
  valid: [
    {
      code: flow(`
        await test("Add to cart", async () => {
          //--------------------------------
          // Arrange:
          //--------------------------------
          await home.goToProduct();
          //--------------------------------
          // Act:
          //--------------------------------
          await product.addToCart();
          //--------------------------------
          // Assert:
          //--------------------------------
          await cart.assertHasItem();
        });
      `),
    },
    {
      // Any case, and a combined marker covers both.
      code: flow(`
        await test("Add to cart", async () => {
          // ARRANGE / ACT
          await product.addToCart();
          // assert
          await cart.assertHasItem();
        });
      `),
    },
    {
      // Not a step: no callback body to mark.
      code: flow(`await test("todo");`),
    },
    {
      // Not a flow module.
      code: `test("a", async () => { await run(); });`,
    },
  ],
});
