import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { requireLocatorJsdocRule } from "./requireLocatorJsdoc.js";
import { pageObject } from "./testSupport.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

ruleTester.run("require-locator-jsdoc", requireLocatorJsdocRule.module, {
  invalid: [
    {
      code: pageObject(`
        private get locators() {
          return {
            save: this.page.getByRole("button", { name: "Save" }),
          } as const;
        }
      `),
      errors: [{ data: { name: "save" }, messageId: "missingJsdoc" }],
    },
    {
      // Only the undocumented entry is reported.
      code: pageObject(`
        private get selectors() {
          return {
            /** "Save" button at the foot of the form. */
            save: this.page.getByRole("button", { name: "Save" }),
            cancel: this.page.getByRole("button", { name: "Cancel" }),
          } as const;
        }
      `),
      errors: [{ data: { name: "cancel" }, messageId: "missingJsdoc" }],
    },
    {
      // A line comment, or a block comment that is not JSDoc, is not enough.
      code: pageObject(`
        private get dynamicLocators() {
          return {
            // Row by name.
            row: (name: string) => this.page.getByText(name),
            /* Cell by index. */
            cell: (index: number) => this.page.locator("td").nth(index),
          } as const;
        }
      `),
      errors: [{ messageId: "missingJsdoc" }, { messageId: "missingJsdoc" }],
    },
    {
      // The property form, and a `satisfies` wrapper.
      code: pageObject(`
        private readonly locators = {
          save: this.page.getByRole("button"),
        } satisfies Record<string, Locator>;
      `),
      errors: [{ messageId: "missingJsdoc" }],
    },
  ],
  valid: [
    {
      code: pageObject(`
        private get locators() {
          return {
            /** "Save" button at the foot of the form. */
            save: this.page.getByRole("button", { name: "Save" }),
            /**
             * "Cancel" link beside it.
             */
            cancel: this.page.getByRole("link", { name: "Cancel" }),
          } as const;
        }
      `),
    },
    {
      // Spread entries have nothing of their own to document.
      code: pageObject(`
        private get locators() {
          return { ...this.shared } as const;
        }
      `),
    },
    {
      // Not a holder.
      code: pageObject(`
        private get defaults() { return { timeout: 5000 } as const; }
      `),
    },
    {
      // Not a page object.
      code: `class Toolbar {
        private get locators() { return { save: this.page.getByRole("button") }; }
      }`,
    },
  ],
});
