import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { locatorGetterShapeRule } from "./locatorGetterShape.js";
import { pageObject } from "./testSupport.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

const map = `return { save: this.page.getByRole("button") } as const;`;

ruleTester.run("locator-getter-shape", locatorGetterShapeRule.module, {
  invalid: [
    {
      code: pageObject(`get locators() { ${map} }`),
      errors: [{ data: { name: "locators" }, messageId: "notPrivate" }],
    },
    {
      code: pageObject(`public get selectors() { ${map} }`),
      errors: [{ data: { name: "selectors" }, messageId: "notPrivate" }],
    },
    {
      code: pageObject(`get dynamicLocators() { return {} as const; }`),
      errors: [{ messageId: "notPrivate" }],
    },
    {
      // A method: `this.locators.save` is then a property of a function.
      code: pageObject(`private locators() { ${map} }`),
      errors: [{ data: { name: "locators" }, messageId: "notAGetter" }],
    },
    {
      // The property form is held to the same access.
      code: pageObject(
        `readonly locators = { save: this.page.getByRole("button") } as const;`,
      ),
      errors: [{ messageId: "notPrivate" }],
    },
    {
      code: pageObject(`get locators() { ${map} }`, "EntryPointPageObject"),
      errors: [{ messageId: "notPrivate" }],
    },
  ],
  valid: [
    { code: pageObject(`private get locators() { ${map} }`) },
    {
      code: pageObject(
        `private get dynamicSelectors() { return {} as const; }`,
      ),
    },
    {
      // Subclasses of a shared page object may need the map.
      code: pageObject(`protected get locators() { ${map} }`),
    },
    {
      code: pageObject(
        `private readonly locators = { save: this.page.getByRole("button") } as const;`,
      ),
    },
    {
      // Not one of the holder names.
      code: pageObject(`get title() { return this.page.title(); }`),
    },
    {
      // Not a page object.
      code: `class Toolbar { get locators() { return {}; } }`,
    },
    {
      // Pins the documented blind spot.
      code: `class AdminPage extends SettingsPage { get locators() { return {}; } }`,
    },
  ],
});
