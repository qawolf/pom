import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { noLegacySelectorsRule } from "./noLegacySelectors.js";
import { pageObject } from "./testSupport.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

function locators(entries: string) {
  return pageObject(
    `private get locators() { return { ${entries} } as const; }`,
  );
}

ruleTester.run("no-legacy-selectors", noLegacySelectorsRule.module, {
  invalid: [
    {
      code: locators(`save: this.page.locator("//button[@id='save']")`),
      errors: [{ messageId: "xpath" }],
    },
    {
      code: locators(`save: this.page.locator("xpath=//button")`),
      errors: [{ messageId: "xpath" }],
    },
    {
      code: locators(`first: this.page.locator("(//li)[1]")`),
      errors: [{ messageId: "xpath" }],
    },
    {
      code: locators(`frame: this.page.frameLocator("//iframe")`),
      errors: [{ messageId: "xpath" }],
    },
    {
      code: locators(`
        save: this.page.locator("text=Save"),
        form: this.page.locator("css=.form"),
        email: this.page.locator("id=email"),
      `),
      errors: [
        { messageId: "legacyEngine" },
        { messageId: "legacyEngine" },
        { messageId: "legacyEngine" },
      ],
    },
    {
      code: locators(`save: this.page.locator(".form >> text=Save")`),
      errors: [{ messageId: "chainCombinator" }],
    },
    {
      // A template literal's static text is classified too.
      code: locators(
        "row: (name: string) => this.page.locator(`.row >> text=${name}`)",
      ),
      errors: [{ messageId: "chainCombinator" }],
    },
    {
      // Anywhere in the page object, not only in the map.
      code: pageObject(
        `async open() { await this.page.locator("//a").click(); }`,
      ),
      errors: [{ messageId: "xpath" }],
    },
  ],
  valid: [
    {
      code: locators(`
        save: this.page.getByRole("button", { name: "Save" }),
        form: this.page.locator(".form"),
        hint: this.page.locator(".form:has-text('Save')"),
        link: this.page.locator("a[href='https://example.com/x']"),
        chained: this.page.locator(".form").getByText("Save"),
      `),
    },
    {
      // Not a string the rule can read.
      code: locators(`row: (selector: string) => this.page.locator(selector)`),
    },
    {
      // Only `locator()` / `frameLocator()` arguments are classified.
      code: locators(`text: this.page.getByText("//")`),
    },
    {
      // Not a page object.
      code: `class Helper {
        find(page: Page) { return page.locator("//div"); }
      }`,
    },
  ],
});
