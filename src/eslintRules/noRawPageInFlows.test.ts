import { RuleTester } from "eslint";
import { createRequire } from "node:module";

import { noRawPageInFlowsRule } from "./noRawPageInFlows.js";
import { flow } from "./testSupport.js";

const require = createRequire(import.meta.url);

const ruleTester = new RuleTester({
  parser: require.resolve("@typescript-eslint/parser"),
  parserOptions: { ecmaVersion: "latest", sourceType: "module" },
});

/** Reported inside a flow; the valid list pins that it is not, outside one. */
const flowBody = `const { page } = await launch(); await page.goto("/");`;

ruleTester.run("no-raw-page-in-flows", noRawPageInFlowsRule.module, {
  invalid: [
    {
      code: flow(`
        const { page } = await launch();
        await page.goto("https://example.com");
      `),
      errors: [{ data: { method: "goto" }, messageId: "rawPage" }],
    },
    {
      // Every reach for the page is reported, not just the first.
      code: flow(`
        await page.click("#submit");
        await page.waitForTimeout(1000);
      `),
      errors: [{ messageId: "rawPage" }, { messageId: "rawPage" }],
    },
    {
      // Recognised by the default export alone, with no import of `flow`.
      code: `export default flow("Name", "Web - Chrome", async ({ page }) => {
        await page.fill("#email", "a@b.c");
      });`,
      errors: [{ messageId: "rawPage" }],
    },
    {
      // A skipped flow is still a flow.
      code: `export default flow.skip("Name", "Web - Chrome", async ({ page }) => {
        await page.reload();
      });`,
      errors: [{ messageId: "rawPage" }],
    },
    {
      // Outside the callback, in the same module, is still the flow's code.
      code: `import { flow } from "@qawolf/flows/web";
        async function warmUp(page: Page) { await page.goto("/"); }
        export default flow("Name", "Web - Chrome", async () => {});`,
      errors: [{ messageId: "rawPage" }],
    },
  ],
  valid: [
    {
      // The flow talks to page objects.
      code: flow(`
        const login = await LoginPage.create();
        await login.goto();
        await login.signIn("a@b.c");
      `),
    },
    {
      // Not a driving method: reading the URL or the context is fine.
      code: flow(`
        const { page } = await launch();
        const url = page.url();
        const context = page.context();
      `),
    },
    {
      // Only an identifier named `page`: `this.page` is a page object's own.
      code: flow(`
        class Helper { async open() { await this.page.goto("/"); } }
      `),
    },
    {
      // Not a flow module: nothing marks it as one, so it is not checked.
      code: `async function run(page: Page) { await page.goto("/"); }`,
    },
    {
      // The filename is not the signal, the code is: a `.flow.ts` file that
      // neither imports `flow` nor exports a flow call is not a flow.
      code: `async function run(page: Page) { await page.goto("/"); }`,
      filename: "src/flows/sign-in.flow.ts",
    },
    {
      // Pins the negative: this body is reported when it is in a flow.
      code: flowBody,
    },
  ],
});
