import {
  enclosingPageObject,
  locatorHolderNames,
  memberName,
} from "./pageObjects.js";
import type { TsClassMember } from "./pageObjects.js";
import type { PomLintRule } from "./types.js";

/**
 * A page object holds no mutable state.
 *
 * ```ts
 * // Reported
 * private currentUser?: string;
 * private rowCount = 0;
 *
 * // Expected
 * async signIn(user: string) { ... }        // data flows through parameters
 * async rowCount(): Promise<number> { ... } // and return values
 * private readonly timeout = 5000;          // a constant is fine
 * ```
 *
 * `static`, `readonly` and `declare` fields are not state. The `locators` map
 * (any of its names) is not either, whichever form holds it.
 */
export const noMutableStateInPageObjectRule: PomLintRule = {
  module: {
    create(context) {
      return {
        PropertyDefinition(node) {
          const { declare, readonly } = node as TsClassMember;
          if (node.static || readonly || declare) return;

          const name = memberName(node);
          if (name === undefined || locatorHolderNames.has(name)) return;
          if (!enclosingPageObject(node)) return;

          context.report({ data: { name }, messageId: "mutableField", node });
        },
      };
    },
    meta: {
      messages: {
        mutableField:
          "Pass `{{name}}` through method parameters and return values instead of storing it on the page object. A field can drift from the page it describes -- it says one thing while the screen shows another -- and if it never changes, `readonly` says so.",
      },
    },
  },

  name: "no-mutable-state-in-page-object",

  severity: "warn",
};
