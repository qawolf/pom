import type { PomLintRule } from "./types.js";

/**
 * Assert on the locator, not on a snapshot taken from it.
 *
 * ```ts
 * // Reported
 * expect(await this.locators.toast.isVisible()).toBe(true);
 * expect(await this.locators.rows.count()).toBe(3);
 *
 * // Expected
 * await expect(this.locators.toast).toBeVisible();
 * await expect(this.locators.rows).toHaveCount(3);
 * ```
 *
 * Unscoped: the pattern is wrong wherever it appears.
 */
export const preferWebFirstAssertionRule: PomLintRule = {
  module: {
    create(context) {
      return {
        CallExpression(node) {
          if (
            node.callee.type !== "Identifier" ||
            node.callee.name !== "expect"
          )
            return;

          const [argument] = node.arguments;
          if (argument?.type !== "AwaitExpression") return;

          const awaited = argument.argument;
          if (
            awaited.type !== "CallExpression" ||
            awaited.callee.type !== "MemberExpression" ||
            awaited.callee.computed ||
            awaited.callee.property.type !== "Identifier"
          )
            return;

          const snapshot = awaited.callee.property.name;
          const matcher = webFirstMatchers.get(snapshot);
          if (!matcher) return;

          context.report({
            data: { matcher, snapshot },
            messageId: "snapshotAssertion",
            node,
          });
        },
      };
    },
    meta: {
      messages: {
        snapshotAssertion:
          "Use `await expect(locator).{{matcher}}(...)` instead of `expect(await locator.{{snapshot}}())`. The web-first form retries until the condition holds or the timeout passes; the snapshot is one reading taken before the app has finished, and fails on the run where it was a moment early.",
      },
    },
  },

  name: "prefer-web-first-assertion",

  severity: "warn",
};

/** Snapshot method to the matcher that waits for the same condition. */
const webFirstMatchers = new Map([
  ["count", "toHaveCount"],
  ["getAttribute", "toHaveAttribute"],
  ["innerText", "toHaveText"],
  ["inputValue", "toHaveValue"],
  ["isChecked", "toBeChecked"],
  ["isDisabled", "toBeDisabled"],
  ["isEnabled", "toBeEnabled"],
  ["isHidden", "toBeHidden"],
  ["isVisible", "toBeVisible"],
  ["textContent", "toHaveText"],
]);
