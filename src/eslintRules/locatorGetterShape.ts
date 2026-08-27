import type { Rule } from "eslint";

import {
  enclosingPageObject,
  locatorHolderNames,
  memberName,
} from "./pageObjects.js";
import type { ClassMember, TsClassMember } from "./pageObjects.js";
import type { PomLintRule } from "./types.js";

/**
 * A page object's locator map is a `private` getter (or property).
 *
 * ```ts
 * // Reported
 * get locators() { ... }             // public: flows can reach the locators
 * locators() { return { ... }; }     // a method: `this.locators.x` is a function
 *
 * // Expected
 * private get locators() {
 *   return { save: this.page.getByRole("button", { name: "Save" }) } as const;
 * }
 * ```
 *
 * `protected` is accepted for a page object its subclasses share. The
 * property form -- `private readonly locators = { ... } as const` -- holds the
 * same map and is held to the same access.
 */
export const locatorGetterShapeRule: PomLintRule = {
  module: {
    create(context) {
      function check(node: ClassMember & Rule.NodeParentExtension): void {
        const name = memberName(node);
        if (name === undefined || !locatorHolderNames.has(name)) return;
        if (!enclosingPageObject(node)) return;

        if (node.type === "MethodDefinition" && node.kind === "method") {
          context.report({ data: { name }, messageId: "notAGetter", node });
          return;
        }

        const { accessibility } = node as TsClassMember;
        if (accessibility === "private" || accessibility === "protected")
          return;

        context.report({ data: { name }, messageId: "notPrivate", node });
      }

      return { MethodDefinition: check, PropertyDefinition: check };
    },
    meta: {
      messages: {
        notAGetter:
          "Make `{{name}}` a getter: `private get {{name}}() { ... }`. As a method, `this.{{name}}.save` is a property of the function, not a locator, and every use has to call it first.",
        notPrivate:
          "Make `{{name}}` `private` (or `protected` when subclasses share it). Public, a flow can reach `.{{name}}.save` and drive the element itself, which is the selector-in-a-flow that the page object exists to prevent.",
      },
    },
  },

  name: "locator-getter-shape",

  severity: "error",
};
