import { isFlowModule } from "./flowModules.js";
import type { PomLintRule } from "./types.js";

/**
 * A flow drives the app through page-object methods, never through `page`.
 *
 * ```ts
 * // Reported
 * await page.goto(url);
 * await page.click("#submit");
 *
 * // Expected
 * const login = await LoginPage.create();
 * await login.submit();
 * ```
 *
 * Matches a member named like a Playwright `Page` method on an identifier
 * named `page` -- the flow callback's own `page`, or one taken off a
 * `launch()` result. Locator builders (`page.getByRole`, `page.locator`) are
 * `no-selectors-in-flows`, which reports them on any receiver.
 */
export const noRawPageInFlowsRule: PomLintRule = {
  module: {
    create(context) {
      if (!isFlowModule(context.sourceCode.ast)) return {};

      return {
        MemberExpression(node) {
          if (node.object.type !== "Identifier" || node.object.name !== "page")
            return;
          if (node.computed || node.property.type !== "Identifier") return;

          const method = node.property.name;
          if (!pageApiMethods.has(method)) return;

          context.report({ data: { method }, messageId: "rawPage", node });
        },
      };
    },
    meta: {
      messages: {
        rawPage:
          "Call a page-object method instead of `page.{{method}}()` here. A flow says what the user does; how the app is driven belongs to the page object, where every flow shares it and it is fixed in one place when the app changes.",
      },
    },
  },

  name: "no-raw-page-in-flows",

  severity: "error",
};

/** Playwright `Page` methods a flow reaches for when it bypasses the page object. */
const pageApiMethods = new Set([
  "$",
  "$$",
  "$$eval",
  "$eval",
  "addInitScript",
  "addLocatorHandler",
  "check",
  "click",
  "close",
  "dblclick",
  "dispatchEvent",
  "dragTo",
  "evaluate",
  "evaluateHandle",
  "fill",
  "focus",
  "getAttribute",
  "goBack",
  "goForward",
  "goto",
  "hover",
  "innerHTML",
  "innerText",
  "isChecked",
  "isDisabled",
  "isEnabled",
  "isVisible",
  "press",
  "reload",
  "route",
  "screenshot",
  "selectOption",
  "setChecked",
  "setInputFiles",
  "setViewportSize",
  "tap",
  "textContent",
  "type",
  "uncheck",
  "unroute",
  "waitForEvent",
  "waitForFunction",
  "waitForLoadState",
  "waitForNavigation",
  "waitForSelector",
  "waitForTimeout",
  "waitForURL",
]);
