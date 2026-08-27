import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { flowExportStructureRule } from "./flowExportStructure.js";
import { flow } from "./testSupport.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

const flowImport = `import { flow } from "@qawolf/flows/web";`;

ruleTester.run("flow-export-structure", flowExportStructureRule.module, {
  invalid: [
    {
      // Imports `flow` (so it is a flow module) but exports it under a name.
      code: `${flowImport}
        export const signIn = flow("Sign in", "Web - Chrome", async () => {});`,
      errors: [{ messageId: "missingDefaultExport" }],
    },
    {
      code: `${flowImport}
        const signIn = flow("Sign in", "Web - Chrome", async () => {});
        export default signIn;`,
      errors: [{ messageId: "notAFlowCall" }],
    },
    {
      code: `${flowImport}
        export default flow("Sign in", async () => {});`,
      errors: [{ messageId: "missingArguments" }],
    },
    {
      code: `${flowImport}
        export default flow(name, "Web - Chrome", async () => {});`,
      errors: [{ messageId: "nameNotLiteral" }],
    },
  ],
  valid: [
    { code: flow(`await test("step", async () => {});`) },
    {
      code: `${flowImport}
        export default flow(
          "Sign in",
          { target: "iOS - iPhone 15 (iOS 26)", launch: { app: { env: "IOS_PATH" } } },
          async ({ test, driver }) => {},
        );`,
    },
    {
      // Skipped and only are still flows.
      code: `${flowImport}
        export default flow.skip("Sign in", "Web - Firefox", async () => {});`,
    },
    {
      // The target's value is the platform's to know: a name outside any
      // list, or a computed one, is not the rule's business.
      code: `${flowImport}
        export default flow("Sign in", "Latest iOS (iPhone)", async () => {});`,
    },
    {
      code: `${flowImport}
        export default flow("Sign in", targets.web, async () => {});`,
    },
    {
      // Not a flow module.
      code: `export const helper = () => flow;`,
    },
  ],
});
