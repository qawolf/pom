import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { noNonNullAssertionRule } from "./noNonNullAssertion.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

ruleTester.run("no-non-null-assertion", noNonNullAssertionRule.module, {
  invalid: [
    {
      code: `const url = process.env.URL!;`,
      errors: [{ messageId: "nonNullAssertion" }],
    },
    {
      code: `await this.page!.goto(url);`,
      errors: [{ messageId: "nonNullAssertion" }],
    },
    {
      // Every assertion in a chain is its own report.
      code: `const name = rows[0]!.cells[1]!.text;`,
      errors: [
        { messageId: "nonNullAssertion" },
        { messageId: "nonNullAssertion" },
      ],
    },
  ],
  valid: [
    { code: `const url = requireEnv("URL");` },
    { code: `const name = rows[0]?.cells[1]?.text;` },
    {
      // `!` as logical not is not the assertion.
      code: `if (!row) throw Error("No row for " + name);`,
    },
    { code: `const done = a !== b;` },
  ],
});
