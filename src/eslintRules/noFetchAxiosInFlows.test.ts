import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { noFetchAxiosInFlowsRule } from "./noFetchAxiosInFlows.js";
import { flow } from "./testSupport.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

ruleTester.run("no-fetch-axios-in-flows", noFetchAxiosInFlowsRule.module, {
  invalid: [
    {
      code: flow(`const response = await fetch("https://api.example.com");`),
      errors: [{ messageId: "fetch" }],
    },
    {
      code: `import axios from "axios";
        ${flow(`await axios.get("https://api.example.com");`)}`,
      errors: [{ messageId: "axios" }],
    },
  ],
  valid: [
    { code: flow(`const user = await api.createUser();`) },
    {
      // A method named `fetch` on something else is not the global.
      code: flow(`await cache.fetch("users");`),
    },
    {
      // Not a flow module.
      code: `import axios from "axios";
        export async function createUser() { await fetch("/users"); }`,
    },
  ],
});
