/**
 * Source-text builders shared by the rule tests. A flow module is recognised
 * by its `flow` import from `@qawolf/flows`, so `flow` wraps a body in that
 * import and the `export default flow(...)` call; a page object is recognised
 * by its superclass, so `pageObject` wraps a class body in one.
 */

export function flow(body: string): string {
  return `import { flow } from "@qawolf/flows/web";
export default flow("Sign in", "Web - Chrome", async ({ test, page }) => {
${body}
});`;
}

export function pageObject(body: string, base = "BasePageObject"): string {
  return `class SettingsPage extends ${base} {\n${body}\n}`;
}
