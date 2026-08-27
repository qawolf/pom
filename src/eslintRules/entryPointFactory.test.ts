import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { entryPointFactoryRule } from "./entryPointFactory.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

const create = `static async create(options?: InitializeBrowserOptions) {
  return new this(await this.initializeBrowser(options));
}`;

ruleTester.run("entry-point-factory", entryPointFactoryRule.module, {
  invalid: [
    {
      code: `class LoginPage extends EntryPointPageObject {
        async signIn() {}
      }`,
      errors: [{ data: { name: "LoginPage" }, messageId: "missingCreate" }],
    },
    {
      // An instance method named `create` is not the factory.
      code: `class LoginPage extends EntryPointPageObject {
        async create() {}
      }`,
      errors: [{ messageId: "missingCreate" }],
    },
    {
      // A static property is not the factory either.
      code: `class LoginPage extends EntryPointPageObject {
        static create = () => {};
      }`,
      errors: [{ messageId: "missingCreate" }],
    },
    {
      code: `export const LoginPage = class extends EntryPointPageObject {};`,
      errors: [
        { data: { name: "This entry point" }, messageId: "missingCreate" },
      ],
    },
  ],
  valid: [
    {
      code: `class LoginPage extends EntryPointPageObject {
        ${create}
        async signIn() {}
      }`,
    },
    {
      // The factory may do more than construct -- a `goto`, a sign-in.
      code: `class LoginPage extends EntryPointPageObject {
        static async create(options?: InitializeBrowserOptions) {
          const entry = new this(await this.initializeBrowser(options));
          await entry.goto();
          return entry;
        }
      }`,
    },
    {
      // A shared base leaves the factory to its subclasses.
      code: `abstract class WorkspaceEntryPoint extends EntryPointPageObject {}`,
    },
    {
      // Not an entry point.
      code: `class SettingsPage extends BasePageObject {}`,
    },
    {
      // A subclass of a workspace entry point names no base class here.
      code: `class LoginPage extends WorkspaceEntryPoint {}`,
    },
  ],
});
