import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { aaaBannerFormatRule } from "./aaaBannerFormat.js";
import { flow } from "./testSupport.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

const divider = `//${"-".repeat(32)}`;

function step(body: string) {
  return flow(`await test("Add to cart", async () => {\n${body}\n});`);
}

ruleTester.run("aaa-banner-format", aaaBannerFormatRule.module, {
  invalid: [
    {
      code: step(`
        // ARRANGE
        await home.goToProduct();
      `),
      errors: [
        {
          data: { label: "Arrange", text: "ARRANGE" },
          messageId: "wrongLabelShape",
        },
      ],
    },
    {
      code: step(`
        // act:
        await product.addToCart();
      `),
      errors: [
        { data: { label: "Act", text: "act:" }, messageId: "wrongLabelShape" },
      ],
    },
    {
      // The right label with no banner around it.
      code: step(`
        // Assert:
        await cart.assertHasItem();
      `),
      errors: [{ data: { label: "Assert" }, messageId: "missingDividers" }],
    },
    {
      // A divider on one side only is not a banner.
      code: step(`
        ${divider}
        // Arrange:
        await home.goToProduct();
      `),
      errors: [{ messageId: "missingDividers" }],
    },
    {
      // Both dividers, but the wrong width; each is reported.
      code: step(`
        //${"-".repeat(20)}
        // Arrange:
        //${"-".repeat(40)}
        await home.goToProduct();
      `),
      errors: [
        { data: { count: "20" }, messageId: "wrongDividerLength" },
        { data: { count: "40" }, messageId: "wrongDividerLength" },
      ],
    },
  ],
  valid: [
    {
      code: step(`
        ${divider}
        // Arrange:
        ${divider}
        await home.goToProduct();
        ${divider}
        // Act:
        ${divider}
        await product.addToCart();
        ${divider}
        // Assert:
        ${divider}
        await cart.assertHasItem();
      `),
    },
    {
      // Ordinary comments that mention the words in a sentence are not markers.
      code: step(`
        // Arrange the rows before acting on them; assert afterwards.
        await product.addToCart();
      `),
    },
    {
      // A block comment is not a line marker.
      code: step(`/* Arrange */ await product.addToCart();`),
    },
    {
      // Outside a step body.
      code: flow(`
        // ARRANGE
        const login = await LoginPage.create();
      `),
    },
    {
      // Not a flow module.
      code: `test("a", async () => {
        // ARRANGE
        await run();
      });`,
    },
  ],
});
