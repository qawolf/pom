import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { fileNamingConventionRule } from "./fileNamingConvention.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

const code = `export const ok = true;`;

ruleTester.run("file-naming-convention", fileNamingConventionRule.module, {
  invalid: [
    {
      code,
      errors: [
        {
          data: {
            basename: "SignInPage.ts",
            expected: "`sign-in-page.ts`, `main-nav-component.ts`",
          },
          messageId: "notKebabCase",
        },
      ],
      filename: "/repo/src/pages/auth/SignInPage.ts",
    },
    {
      code,
      errors: [
        {
          data: {
            basename: "addToCart.flow.ts",
            expected: "`add-to-cart.flow.ts`",
          },
          messageId: "notKebabCase",
        },
      ],
      filename: "/repo/src/flows/cart/addToCart.flow.ts",
    },
    {
      // Backslashes are a path too.
      code,
      errors: [{ messageId: "notKebabCase" }],
      filename: "C:\\repo\\src\\lib\\env_utils.ts",
    },
    {
      code,
      errors: [{ messageId: "notKebabCase" }],
      filename: "/repo/src/lib/Helpers.test.ts",
    },
  ],
  valid: [
    { code, filename: "/repo/src/pages/auth/sign-in-page.ts" },
    { code, filename: "/repo/src/flows/cart/add-to-cart-us.flow.ts" },
    { code, filename: "/repo/src/lib/env-utils.ts" },
    { code, filename: "/repo/src/lib/env-utils.test.ts" },
    { code, filename: "/repo/src/seq/step-2.ts" },
    {
      // Only files under `src/` are named by the convention.
      code,
      filename: "/repo/tools/MyScript.ts",
    },
    { code, filename: "/repo/eslint.config.js" },
  ],
});
