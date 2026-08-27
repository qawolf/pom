import { isFlowModule } from "./flowModules.js";
import { enclosingPageObject } from "./pageObjects.js";
import type { PomLintRule } from "./types.js";

/**
 * No fixed sleeps, and no `waitForSelector`, in flows or page objects.
 *
 * ```ts
 * // Reported
 * await this.page.waitForTimeout(2000);
 * await this.page.waitForSelector(".loaded");
 *
 * // Expected
 * await this.locators.loaded.waitFor();
 * await expect(this.locators.loaded).toBeVisible();
 * await this.page.waitForURL(/dashboard/);
 * ```
 */
export const noWaitForTimeoutRule: PomLintRule = {
  module: {
    create(context) {
      const inFlow = isFlowModule(context.sourceCode.ast);

      return {
        CallExpression(node) {
          const { callee } = node;
          if (callee.type !== "MemberExpression" || callee.computed) return;
          if (callee.property.type !== "Identifier") return;

          const method = callee.property.name;
          if (method !== "waitForTimeout" && method !== "waitForSelector")
            return;
          if (!inFlow && !enclosingPageObject(node)) return;

          context.report({ messageId: method, node });
        },
      };
    },
    meta: {
      messages: {
        waitForSelector:
          "Use `locator.waitFor()` or a web-first assertion (`await expect(locator).toBeVisible()`) instead of `waitForSelector()`. Both take the locator the page object already names, so the wait and the action target the same element.",
        waitForTimeout:
          "Wait for the condition, not the clock: `locator.waitFor()`, `page.waitForURL()`, or a web-first assertion. A fixed sleep is too short on a slow run, which fails, and too long on every other run, which is paid on every step of every flow.",
      },
    },
  },

  name: "no-wait-for-timeout",

  severity: "error",
};
