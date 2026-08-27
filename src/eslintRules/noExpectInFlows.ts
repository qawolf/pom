import { isFlowModule } from "./flowModules.js";
import type { PomLintRule } from "./types.js";

/**
 * Assertions live in `assert*()` page-object methods, not in flows.
 *
 * ```ts
 * // Reported
 * await expect(page.getByText("Saved")).toBeVisible();
 *
 * // Expected
 * await settings.assertSaved();
 * ```
 *
 * `expect(...)` and the `expect.soft(...)` / `expect.poll(...)` forms alike.
 */
export const noExpectInFlowsRule: PomLintRule = {
  module: {
    create(context) {
      if (!isFlowModule(context.sourceCode.ast)) return {};

      return {
        CallExpression(node) {
          if (!isExpectCall(node.callee)) return;

          context.report({ messageId: "expectInFlow", node });
        },
      };
    },
    meta: {
      messages: {
        expectInFlow:
          'Move this assertion into an `assert*()` method on the page object and call that from here. The page object knows what "saved" looks like; a flow only knows that it should be. Kept there, the check is shared by every flow and fixed in one place when the app changes.',
      },
    },
  },

  name: "no-expect-in-flows",

  severity: "warn",
};

/** `expect(...)`, or `expect.soft(...)` / `expect.poll(...)`. */
export function isExpectCall(callee: {
  name?: string;
  object?: { name?: string; type: string };
  type: string;
}): boolean {
  if (callee.type === "Identifier") return callee.name === "expect";

  return (
    callee.type === "MemberExpression" &&
    callee.object?.type === "Identifier" &&
    callee.object.name === "expect"
  );
}
