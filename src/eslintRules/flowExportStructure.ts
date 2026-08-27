import type { Rule } from "eslint";

import { isFlowCall, isFlowModule } from "./flowModules.js";
import type { PomLintRule } from "./types.js";

/**
 * A flow module default-exports one `flow(name, target, callback)`.
 *
 * ```ts
 * // Reported
 * export const signIn = flow("Sign in", "Web - Chrome", async () => {});
 * export default flow(name, "Web - Chrome", async () => {});
 *
 * // Expected
 * export default flow("Sign in", "Web - Chrome", async ({ test }) => {});
 * export default flow(
 *   "Sign in",
 *   { target: "iOS - iPhone 15 (iOS 26)", launch: { app: { env: "IOS_PATH" } } },
 *   async ({ test, driver }) => {},
 * );
 * ```
 *
 * The target's value is not checked. The platform serves its execution
 * targets as a catalogue (`executionTarget.findMany`) that grows and retires
 * entries without a release of this package, so any list here would be wrong
 * within months -- and it was: the vendored rule's list lacked names that
 * hundreds of flows already ran on.
 */
export const flowExportStructureRule: PomLintRule = {
  module: {
    create(context) {
      const program = context.sourceCode.ast;
      if (!isFlowModule(program)) return {};

      return {
        "Program:exit"() {
          const exported = program.body.find(
            (statement) => statement.type === "ExportDefaultDeclaration",
          );
          if (exported?.type !== "ExportDefaultDeclaration") {
            context.report({
              messageId: "missingDefaultExport",
              node: program as unknown as Rule.Node,
            });
            return;
          }

          const { declaration } = exported;
          if (
            declaration.type !== "CallExpression" ||
            !isFlowCall(declaration)
          ) {
            context.report({
              messageId: "notAFlowCall",
              node: declaration as Rule.Node,
            });
            return;
          }

          if (declaration.arguments.length < 3) {
            context.report({
              messageId: "missingArguments",
              node: declaration as Rule.Node,
            });
            return;
          }

          const [name] = declaration.arguments;
          if (name && name.type !== "Literal") {
            context.report({
              messageId: "nameNotLiteral",
              node: name as Rule.Node,
            });
          }
        },
      };
    },
    meta: {
      messages: {
        missingArguments:
          "`flow()` takes three arguments: `flow(name, target, callback)`. The name is what the run is listed under, the target is the platform preset it runs on, and the callback is the flow.",
        missingDefaultExport:
          "Default-export the flow: `export default flow(name, target, callback)`. The runner loads a flow module by its default export; a flow exported under a name, or not at all, never runs.",
        nameNotLiteral:
          "Give `flow()` a string literal as its name. The platform lists and matches runs by this string, so it has to be readable from the file without executing it.",
        notAFlowCall:
          "Default-export the `flow(...)` call itself, not something else. The runner expects the module's default export to be the flow.",
      },
    },
  },

  name: "flow-export-structure",

  severity: "error",
};
