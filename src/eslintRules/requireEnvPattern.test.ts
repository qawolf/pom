import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { requireEnvPatternRule } from "./requireEnvPattern.js";
import { flow, pageObject } from "./testSupport.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

ruleTester.run("require-env-pattern", requireEnvPatternRule.module, {
  invalid: [
    {
      code: flow(`const password = process.env.ADMIN_PASSWORD;`),
      errors: [{ data: { name: "ADMIN_PASSWORD" }, messageId: "processEnv" }],
    },
    {
      // The `!` does not make it a helper call.
      code: flow(`const password = process.env.ADMIN_PASSWORD!;`),
      errors: [{ messageId: "processEnv" }],
    },
    {
      // Bracket forms, static and dynamic.
      code: flow(`
        const a = process.env["URL"];
        const b = process.env[key];
        const c = process["env"].URL;
      `),
      errors: [
        { data: { name: "URL" }, messageId: "processEnv" },
        { data: { name: "<dynamic>" }, messageId: "processEnv" },
        { data: { name: "URL" }, messageId: "processEnv" },
      ],
    },
    {
      code: pageObject(`
        async open() { await this.page.goto(process.env.DEFAULT_URL); }
      `),
      errors: [{ data: { name: "DEFAULT_URL" }, messageId: "processEnv" }],
    },
    {
      code: pageObject(
        `static async create() { return new this(await this.initializeBrowser({ storageState: process.env.STATE })); }`,
        "EntryPointPageObject",
      ),
      errors: [{ messageId: "processEnv" }],
    },
  ],
  valid: [
    { code: flow(`const password = requireEnv("ADMIN_PASSWORD");`) },
    {
      code: flow(
        `const url = optionalEnv("URL") ?? requireEnv("DEFAULT_URL");`,
      ),
    },
    {
      // `process.env` handed along whole is not a read of a variable.
      code: flow(`const env = process.env;`),
    },
    {
      // Neither a flow nor a page object: the helper's own module, and other
      // library code, read `process.env` themselves.
      code: `export function requireEnv(name: string): string {
        const value = process.env[name];
        if (!value) throw Error(name + " is not set");
        return value;
      }`,
    },
    {
      // Pins the documented blind spot.
      code: `class AdminPage extends SettingsPage {
        async open() { await this.page.goto(process.env.DEFAULT_URL); }
      }`,
    },
  ],
});
