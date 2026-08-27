import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { noAnySharedStateRule } from "./noAnySharedState.js";
import { flow } from "./testSupport.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

ruleTester.run("no-any-shared-state", noAnySharedStateRule.module, {
  invalid: [
    {
      code: flow(`let cart: any;`),
      errors: [{ data: { name: "cart" }, messageId: "anyType" }],
    },
    {
      code: flow(`let cart;`),
      errors: [{ data: { name: "cart" }, messageId: "missingType" }],
    },
    {
      // An `any` cast as the initializer is the same untyped state.
      code: flow(`let cart = undefined as any;`),
      errors: [{ messageId: "anyType" }],
    },
    {
      // `any` anywhere in the type: arrays, unions, type arguments.
      code: flow(`
        let a: any[];
        let b: string | any;
        let c: Promise<any>;
      `),
      errors: [
        { messageId: "anyType" },
        { messageId: "anyType" },
        { messageId: "anyType" },
      ],
    },
    {
      // Inside a step is still inside the flow callback.
      code: flow(`await test("step", async () => { let inner; });`),
      errors: [{ messageId: "missingType" }],
    },
  ],
  valid: [
    { code: flow(`let cart: CartPage;`) },
    { code: flow(`let cart: Awaited<ReturnType<typeof checkout.goToCart>>;`) },
    {
      // An initializer gives inference something to work with.
      code: flow(`let cart = await checkout.goToCart();`),
    },
    {
      // Not shared between steps: a `const` is assigned once.
      code: flow(`const cart: any = null;`),
    },
    {
      // Outside the flow callback, in the same module.
      code: `import { flow } from "@qawolf/flows/web";
        let shared;
        export default flow("Name", "Web - Chrome", async () => {});`,
    },
    {
      // Not a flow module.
      code: `async function run() { let cart; }`,
    },
  ],
});
