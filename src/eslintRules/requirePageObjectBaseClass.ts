import type { Rule } from "eslint";

import { isLocatorHolder } from "./pageObjects.js";
import type { ClassNode } from "./pageObjects.js";
import type { PomLintRule } from "./types.js";

/**
 * A class with a `locators` map is a page object, and extends a base class.
 *
 * ```ts
 * // Reported
 * export class SettingsPage {
 *   private get locators() { ... }
 * }
 *
 * // Expected
 * export class SettingsPage extends BasePageObject {
 *   private get locators() { ... }
 * }
 * ```
 *
 * Only a class with no superclass at all is reported. One extending a class
 * that is not a known base may be extending another page object, which a rule
 * without type information cannot tell from a mistake.
 */
export const requirePageObjectBaseClassRule: PomLintRule = {
  module: {
    create(context) {
      function check(node: ClassNode & Rule.NodeParentExtension): void {
        if (node.superClass) return;

        const looksLikePageObject = node.body.body.some(
          (member) =>
            (member.type === "MethodDefinition" ||
              member.type === "PropertyDefinition") &&
            isLocatorHolder(member),
        );
        if (!looksLikePageObject) return;

        context.report({
          data: { name: node.id?.name ?? "This class" },
          messageId: "missingBaseClass",
          node: node.id ?? node,
        });
      }

      return { ClassDeclaration: check, ClassExpression: check };
    },
    meta: {
      messages: {
        missingBaseClass:
          "`{{name}}` keeps a locator map but extends nothing. Extend `BasePageObject` (or `SubPageObject<Parent>` for a region of a page, `EntryPointPageObject` for where a flow starts): that is what gives it `this.page`, `create()` for siblings, and lets other page objects construct it.",
      },
    },
  },

  name: "require-page-object-base-class",

  severity: "warn",
};
