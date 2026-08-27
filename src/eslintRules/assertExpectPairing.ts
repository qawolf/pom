import { isExpectCall } from "./noExpectInFlows.js";
import {
  enclosingClassMember,
  enclosingPageObject,
  memberName,
} from "./pageObjects.js";
import type { PomLintRule } from "./types.js";

/**
 * Inside a page object, only an `assert*()` method asserts.
 *
 * ```ts
 * // Reported
 * async save() {
 *   await this.locators.save.click();
 *   await expect(this.locators.toast).toBeVisible();
 * }
 *
 * // Expected
 * async save() {
 *   await this.locators.save.click();
 * }
 * async assertSaved() {
 *   await expect(this.locators.toast).toBeVisible();
 * }
 * ```
 *
 * The name is the contract: a flow reading `await settings.save()` cannot see
 * that it also asserts, and a flow that wants to save without asserting --
 * because this run expects failure -- has no way to. Split, each can be
 * called on its own and the assertion is reusable.
 */
export const assertExpectPairingRule: PomLintRule = {
  module: {
    create(context) {
      return {
        CallExpression(node) {
          if (!isExpectCall(node.callee)) return;
          if (!enclosingPageObject(node)) return;

          const member = enclosingClassMember(node);
          if (member?.type !== "MethodDefinition") return;

          const name = memberName(member);
          if (name === undefined || isAssertMethodName(name)) return;

          context.report({
            data: { name, suggested: `assert${capitalize(name)}` },
            messageId: "expectOutsideAssert",
            node,
          });
        },
      };
    },
    meta: {
      messages: {
        expectOutsideAssert:
          "`{{name}}()` asserts, but its name does not say so. Move the `expect` into an `assert*()` method -- `{{suggested}}()` if it is the whole of the check -- and have the flow call both. A flow reading `{{name}}()` cannot see that it asserts, and one that needs the action without the check cannot get it.",
      },
    },
  },

  name: "assert-expect-pairing",

  severity: "error",
};

function isAssertMethodName(name: string): boolean {
  return /^assert[A-Z]/.test(name);
}

function capitalize(name: string): string {
  return name.charAt(0).toUpperCase() + name.slice(1);
}
