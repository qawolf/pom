import { isFlowModule } from "./flowModules.js";
import type { PomLintRule } from "./types.js";

/**
 * Selectors are authored in page objects, never in flows.
 *
 * ```ts
 * // Reported
 * await page.getByRole("button", { name: "Save" }).click();
 * await dialog.locator(".confirm").click();
 *
 * // Expected
 * await settings.save();
 * ```
 *
 * Any receiver counts, not only `page`: a locator narrowed from another
 * locator is still a selector the flow now owns.
 */
export const noSelectorsInFlowsRule: PomLintRule = {
  module: {
    create(context) {
      if (!isFlowModule(context.sourceCode.ast)) return {};

      return {
        CallExpression(node) {
          const { callee } = node;
          if (callee.type !== "MemberExpression" || callee.computed) return;
          if (callee.property.type !== "Identifier") return;

          const method = callee.property.name;
          if (!locatorBuilders.has(method)) return;

          context.report({ data: { method }, messageId: "selector", node });
        },
      };
    },
    meta: {
      messages: {
        selector:
          "Move this `{{method}}()` into a page object and call a method on it from here. A selector in a flow is invisible to every other flow that needs the same element and is fixed once per flow when the markup changes; in the page object's `locators` it is named for its purpose and fixed once.",
      },
    },
  },

  name: "no-selectors-in-flows",

  severity: "error",
};

const locatorBuilders = new Set([
  "frameLocator",
  "getByAltText",
  "getByLabel",
  "getByPlaceholder",
  "getByRole",
  "getByTestId",
  "getByText",
  "getByTitle",
  "locator",
]);
