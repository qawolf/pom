import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { noParameterPropertiesRule } from "./noParameterProperties.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

ruleTester.run("no-parameter-properties", noParameterPropertiesRule.module, {
  invalid: [
    {
      code: `class Api { constructor(private readonly client: ApiClient) {} }`,
      errors: [
        {
          data: { accessibility: "private", name: "client", type: "ApiClient" },
          messageId: "parameterProperty",
        },
      ],
    },
    {
      // `readonly` alone is still a parameter property.
      code: `class Api { constructor(readonly baseUrl: string) {} }`,
      errors: [{ messageId: "parameterProperty" }],
    },
    {
      // With a default value.
      code: `class Api { constructor(public retries: number = 3) {} }`,
      errors: [
        {
          data: { accessibility: "public", name: "retries", type: "number" },
          messageId: "parameterProperty",
        },
      ],
    },
    {
      code: `class Api { constructor(protected a: string, private b: number) {} }`,
      errors: [
        { messageId: "parameterProperty" },
        { messageId: "parameterProperty" },
      ],
    },
  ],
  valid: [
    {
      code: `class Api {
        private readonly client: ApiClient;
        constructor(client: ApiClient) { this.client = client; }
      }`,
    },
    { code: `class Api { constructor(client: ApiClient, retries = 3) {} }` },
    { code: `function make(private_: string) {}` },
  ],
});
