import type { Rule } from "eslint";
import type { Expression, ObjectExpression } from "estree";

import { enclosingPageObject, isLocatorHolder } from "./pageObjects.js";
import type { ClassMember } from "./pageObjects.js";
import type { PomLintRule } from "./types.js";

/**
 * Every locator in the map says what it targets.
 *
 * ```ts
 * // Reported
 * private get locators() {
 *   return {
 *     save: this.page.getByRole("button", { name: "Save" }),
 *   } as const;
 * }
 *
 * // Expected
 * private get locators() {
 *   return {
 *     /** "Save" button at the foot of the settings form. *\/
 *     save: this.page.getByRole("button", { name: "Save" }),
 *   } as const;
 * }
 * ```
 *
 * Checks the getter's returned object and the property form's initializer,
 * unwrapping `as const` / `satisfies`.
 */
export const requireLocatorJsdocRule: PomLintRule = {
  module: {
    create(context) {
      function check(node: ClassMember & Rule.NodeParentExtension): void {
        if (!isLocatorHolder(node) || !enclosingPageObject(node)) return;

        const map = locatorMap(node);
        if (!map) return;

        for (const property of map.properties) {
          if (property.type !== "Property") continue;

          const comments = context.sourceCode.getCommentsBefore(property);
          const last = comments[comments.length - 1];
          const hasJsdoc = last?.type === "Block" && last.value.startsWith("*");
          if (hasJsdoc) continue;

          context.report({
            data: { name: propertyName(property.key) },
            messageId: "missingJsdoc",
            node: property,
          });
        }
      }

      return { MethodDefinition: check, PropertyDefinition: check };
    },
    meta: {
      messages: {
        missingJsdoc:
          "Add a `/** ... */` above `{{name}}` saying which element it is and where. The selector says how it is found today; the comment says what it must find, which is what the next reader needs when the selector breaks.",
      },
    },
  },

  name: "require-locator-jsdoc",

  severity: "warn",
};

/** The object literal a holder returns or is initialized with. */
function locatorMap(member: ClassMember): ObjectExpression | undefined {
  let expression: Expression | null | undefined;

  if (member.type === "PropertyDefinition") expression = member.value;
  else if (member.value.body.type === "BlockStatement") {
    const returned = member.value.body.body.find(
      (statement) => statement.type === "ReturnStatement",
    );
    expression =
      returned?.type === "ReturnStatement" ? returned.argument : null;
  }

  const unwrapped = unwrapTypeAssertion(expression);
  return unwrapped?.type === "ObjectExpression" ? unwrapped : undefined;
}

/** `{ ... } as const` and `{ ... } satisfies T` wrap the literal in TS nodes. */
function unwrapTypeAssertion(
  node: Expression | null | undefined,
): Expression | null | undefined {
  const wrapper = node as { expression?: Expression; type: string } | null;
  if (
    wrapper?.type === "TSAsExpression" ||
    wrapper?.type === "TSSatisfiesExpression"
  )
    return unwrapTypeAssertion(wrapper.expression);

  return node;
}

function propertyName(key: Expression | { type: string }): string {
  if (key.type === "Identifier") return (key as { name: string }).name;
  if (key.type === "Literal") return String((key as { value: unknown }).value);

  return "this locator";
}
