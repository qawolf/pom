import { isFlowModule } from "./flowModules.js";
import { enclosingPageObject } from "./pageObjects.js";
import type { PomLintRule } from "./types.js";

/**
 * Environment variables are read through the workspace's `requireEnv()`.
 *
 * ```ts
 * // Reported
 * const password = process.env.ADMIN_PASSWORD;
 * const password = process.env.ADMIN_PASSWORD!;
 *
 * // Expected
 * const password = requireEnv("ADMIN_PASSWORD");
 * const url = optionalEnv("URL") ?? requireEnv("DEFAULT_URL");
 * ```
 *
 * Scoped to flows and page objects; the helper's own module, and other
 * library code, read `process.env` themselves.
 */
export const requireEnvPatternRule: PomLintRule = {
  module: {
    create(context) {
      const inFlow = isFlowModule(context.sourceCode.ast);

      return {
        MemberExpression(node) {
          const { object } = node;
          const isProcessEnv =
            object.type === "MemberExpression" &&
            object.object.type === "Identifier" &&
            object.object.name === "process" &&
            ((!object.computed &&
              object.property.type === "Identifier" &&
              object.property.name === "env") ||
              (object.property.type === "Literal" &&
                object.property.value === "env"));
          if (!isProcessEnv) return;
          if (!inFlow && !enclosingPageObject(node)) return;

          let name = "<dynamic>";
          if (!node.computed && node.property.type === "Identifier")
            name = node.property.name;
          else if (
            node.property.type === "Literal" &&
            typeof node.property.value === "string"
          )
            name = node.property.value;

          context.report({ data: { name }, messageId: "processEnv", node });
        },
      };
    },
    meta: {
      messages: {
        processEnv:
          'Read `{{name}}` through the workspace\'s env helper -- `requireEnv("{{name}}")`, or `optionalEnv("{{name}}")` when it may be unset -- instead of `process.env.{{name}}`. The helper fails at the read, naming the variable; a bare read yields `undefined` and fails later, in whatever the value was used for.',
      },
    },
  },

  name: "require-env-pattern",

  severity: "error",
};
