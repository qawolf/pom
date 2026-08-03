import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { noInlineLocatorInPageObjectRule } from "./noInlineLocatorInPageObject.js";

// RuleTester takes the parser as a resolved path, and this package is ESM.
// A Node built-in is fine here: only the rules are constrained, not the tests.
const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

const inlineLocator = [{ messageId: "inlineLocator" }];

function pageObject(body: string, base = "BasePageObject") {
  return `class SignInPage extends ${base} {\n${body}\n}`;
}

ruleTester.run(
  "no-inline-locator-in-page-object",
  noInlineLocatorInPageObjectRule.module,
  {
    invalid: [
      {
        code: pageObject(`
          async signIn() {
            await this.page.getByRole("button", { name: "Sign in" }).click();
          }
        `),
        errors: inlineLocator,
      },
      {
        code: pageObject(`
          async search() {
            await this.page.locator("#search").fill("hello");
          }
        `),
        errors: inlineLocator,
      },
      {
        code: pageObject(`
          async confirm() {
            await this.page.frameLocator("#f").getByRole("button").click();
          }
        `),
        errors: inlineLocator,
      },
      {
        // A getter, but not one of the locator holders.
        code: pageObject(`
          private get header() {
            return this.page.getByRole("banner");
          }
        `),
        errors: inlineLocator,
      },
      {
        // A plain method named `locators` is neither the getter nor a property.
        code: pageObject(`
          locators() {
            return { ok: this.page.getByRole("button") };
          }
        `),
        errors: inlineLocator,
      },
      {
        code: pageObject(
          `async start() { await this.page.getByText("Go").click(); }`,
          "EntryPointPageObject",
        ),
        errors: inlineLocator,
      },
      {
        code: pageObject(
          `async start() { await this.page.getByText("Go").click(); }`,
          "SubPageObject<HomePage>",
        ),
        errors: inlineLocator,
      },
      {
        // A class expression is still a page object.
        code: `const SignInPage = class extends BasePageObject {
          async signIn() {
            await this.page.getByRole("button").click();
          }
        };`,
        errors: inlineLocator,
      },
      {
        // Nested inside a callback in a method body -- still a method body.
        code: pageObject(`
          async pickFirst(names: string[]) {
            await Promise.all(
              names.map((name) => this.page.getByText(name).click()),
            );
          }
        `),
        errors: inlineLocator,
      },
      {
        // A holder present does not excuse a locator built outside it.
        code: pageObject(`
          private get locators() {
            return { ok: this.page.getByRole("button") } as const;
          }
          async submit() {
            await this.page.getByRole("button", { name: "Other" }).click();
          }
        `),
        errors: inlineLocator,
      },
    ],
    valid: [
      {
        code: pageObject(`
          private get locators() {
            return {
              emailInput: this.page.getByLabel("Email"),
              signInButton: this.page.getByRole("button", { name: "Sign in" }),
            } as const;
          }
        `),
      },
      {
        // The entry is a function, which is why the check keys on the member.
        code: pageObject(`
          private get dynamicLocators() {
            return {
              airportOption: (airportName: string) =>
                this.page.getByText(airportName),
            } as const;
          }
        `),
      },
      {
        // The property form holds the same map.
        code: pageObject(`
          private readonly locators = {
            ok: this.page.getByRole("button"),
          } as const;
        `),
      },
      {
        code: pageObject(`
          private get selectors() {
            return { ok: this.page.locator("#ok") } as const;
          }
        `),
      },
      {
        code: pageObject(`
          private get dynamicSelectors() {
            return { row: (id: string) => this.page.locator(id) } as const;
          }
        `),
      },
      {
        // Not locator builders, and they have no locator equivalent.
        code: pageObject(`
          async open(url: string) {
            await this.page.goto(url);
            await this.page.waitForLoadState();
          }
        `),
      },
      {
        // Narrowing off a locator already on the instance, not off `this.page`.
        code: pageObject(`
          async confirm() {
            await this.dialog.getByRole("button", { name: "OK" }).click();
          }
        `),
      },
      {
        // Pins the documented `!` / `as` limitation.
        code: pageObject(
          `async a() { await this.page!.getByRole("button").click(); }`,
        ),
      },
      {
        // A reference, not a call: nothing is being built. Covers both being
        // assigned and being handed to another function, which is still a
        // `CallExpression` parent but not its callee.
        code: pageObject(`
          async wire() {
            const build = this.page.getByRole;
            register(this.page.locator);
            return build;
          }
        `),
      },
      {
        // A locator handed in rather than built from this.page.
        code: pageObject(`
          async clickIn(row: { getByRole(role: string): { click(): Promise<void> } }) {
            await row.getByRole("button").click();
          }
        `),
      },
      {
        // Pins the documented blind spot, and covers any non-page-object class,
        // which takes the same path.
        code: `class AdminLoginPage extends LoginPage {
          async signIn() {
            await this.page.getByRole("button").click();
          }
        }`,
      },
    ],
  },
);
