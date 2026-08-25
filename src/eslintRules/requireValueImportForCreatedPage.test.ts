import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { requireValueImportForCreatedPageRule } from "./requireValueImportForCreatedPage.js";

// RuleTester takes the parser as a resolved path, and this package is ESM.
// A Node built-in is fine here: only the rules are constrained, not the tests.
const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

const typeOnlyImport = [{ messageId: "typeOnlyImport" }];

function pageObject(body: string) {
  return `class CheckoutPage extends BasePageObject {\n${body}\n}`;
}

ruleTester.run(
  "require-value-import-for-created-page",
  requireValueImportForCreatedPageRule.module,
  {
    invalid: [
      {
        code: `import type { CartPage } from "../cart/cart-page.ts";
          ${pageObject(`async goToCart() { return this.create("CartPage"); }`)}`,
        errors: typeOnlyImport,
      },
      {
        // The inline form erases the same way as the statement form.
        code: `import { type CartPage } from "../cart/cart-page.ts";
          ${pageObject(`async goToCart() { return this.create("CartPage"); }`)}`,
        errors: typeOnlyImport,
      },
      {
        // The runtime matches the imported name, not the local alias, so this
        // import is exactly what `create("CartPage")` reads -- and loses.
        code: `import type { CartPage as Cart } from "../cart/cart-page.ts";
          ${pageObject(`async goToCart() { return this.create("CartPage"); }`)}`,
        errors: typeOnlyImport,
      },
      {
        // The annotated form resolves by the string argument.
        code: `import type { CartPage } from "../cart/cart-page.ts";
          ${pageObject(
            `async goToCart() { return this.create<CartPage>("CartPage"); }`,
          )}`,
        errors: typeOnlyImport,
      },
      {
        // The free function shares the caller-source resolution.
        code: `import { createPage } from "@qawolf/pom";
          import type { CartPage } from "../cart/cart-page.ts";
          async function openCart(tab: Page) { return createPage("CartPage", tab); }`,
        errors: typeOnlyImport,
      },
      {
        // A default export binds by its local name.
        code: `import type CartPage from "../cart/cart-page.ts";
          ${pageObject(`async goToCart() { return this.create("CartPage"); }`)}`,
        errors: typeOnlyImport,
      },
      {
        // Every unresolvable call site is reported, not just the first.
        code: `import type { CartPage } from "../cart/cart-page.ts";
          ${pageObject(`
            async goToCart() { return this.create("CartPage"); }
            async backToCart() { return this.create("CartPage"); }
          `)}`,
        errors: [...typeOnlyImport, ...typeOnlyImport],
      },
    ],
    valid: [
      {
        // The correct state: a value import survives compilation.
        code: `import { CartPage } from "../cart/cart-page.ts";
          ${pageObject(`async goToCart() { return this.create("CartPage"); }`)}`,
      },
      {
        // No import at all is the sibling-convention path, which is
        // legitimate and cannot be judged from one file.
        code: pageObject(
          `async goToCart() { return this.create("CartPage"); }`,
        ),
      },
      {
        // A bare package specifier is never followed by the runtime lookup,
        // so its import kind changes nothing.
        code: `import type { CartPage } from "@customer/pages";
          ${pageObject(`async goToCart() { return this.create("CartPage"); }`)}`,
      },
      {
        // The runtime matches the imported name: this import binds `Other`,
        // so `create("CartPage")` never reads it.
        code: `import type { Other as CartPage } from "../cart/cart-page.ts";
          ${pageObject(`async goToCart() { return this.create("CartPage"); }`)}`,
      },
      {
        // An aliased *value* import still resolves at runtime.
        code: `import { CartPage as Cart } from "../cart/cart-page.ts";
          ${pageObject(`async goToCart() { return this.create("CartPage"); }`)}`,
      },
      {
        // Only `this.create` and `createPage` resolve through the caller's
        // source; another object's `create` is unrelated.
        code: `import type { CartPage } from "../cart/cart-page.ts";
          ${pageObject(
            `async goToCart(factory: PageFactory) { return factory.create("CartPage"); }`,
          )}`,
      },
      {
        // A variable name cannot be checked against the imports.
        code: `import type { CartPage } from "../cart/cart-page.ts";
          ${pageObject(
            `async goTo(name: string) { return this.create(name); }`,
          )}`,
      },
    ],
  },
);
