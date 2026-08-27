import type { Rule } from "eslint";

import type { ClassNode, TsClass } from "./pageObjects.js";
import type { PomLintRule } from "./types.js";

/**
 * A concrete entry point has the `static create()` factory a flow starts from.
 *
 * ```ts
 * // Reported
 * export class LoginPage extends EntryPointPageObject {
 *   async signIn() { ... }
 * }
 *
 * // Expected
 * export class LoginPage extends EntryPointPageObject {
 *   static async create(options?: InitializeBrowserOptions) {
 *     return new this(await this.initializeBrowser(options));
 *   }
 * }
 * ```
 *
 * `initializeBrowser` is `protected static`, so `create` is the one place a
 * flow can get a browser with the entry point's page hooks installed. An
 * `abstract` entry point is a shared base and is left to its subclasses.
 */
export const entryPointFactoryRule: PomLintRule = {
  module: {
    create(context) {
      function check(node: ClassNode & Rule.NodeParentExtension): void {
        if (
          node.superClass?.type !== "Identifier" ||
          node.superClass.name !== "EntryPointPageObject"
        )
          return;
        if ((node as TsClass).abstract) return;

        const hasCreate = node.body.body.some(
          (member) =>
            member.type === "MethodDefinition" &&
            member.static &&
            member.kind === "method" &&
            !member.computed &&
            member.key.type === "Identifier" &&
            member.key.name === "create",
        );
        if (hasCreate) return;

        context.report({
          data: { name: node.id?.name ?? "This entry point" },
          messageId: "missingCreate",
          node: node.id ?? node,
        });
      }

      return { ClassDeclaration: check, ClassExpression: check };
    },
    meta: {
      messages: {
        missingCreate:
          "`{{name}}` extends EntryPointPageObject but has no `static create()`. An entry point is where a flow starts, so it is the one page object a flow constructs: `static async create(options?: InitializeBrowserOptions) { return new this(await this.initializeBrowser(options)); }` launches the browser with this entry point's page hooks installed.",
      },
    },
  },

  name: "entry-point-factory",

  severity: "error",
};
