import type { Statement } from "estree";

import { flowCallbackOf, isFlowCall, isFlowModule } from "./flowModules.js";
import type { PomLintRule } from "./types.js";

/**
 * Once the steps start, everything in the flow callback is a step.
 *
 * ```ts
 * // Reported
 * await test("Sign in", async () => { ... });
 * const cart = await home.goToCart();     // between steps
 * await test("Add to cart", async () => { ... });
 *
 * // Expected
 * const testData = { ... };               // setup, before the first step
 * await test("Sign in", async () => { ... });
 * await test("Add to cart", async () => { ... });
 * ```
 *
 * Only the flow callback's top-level statements after its first
 * `await test(...)` are checked.
 */
export const noCodeBetweenStepsRule: PomLintRule = {
  module: {
    create(context) {
      if (!isFlowModule(context.sourceCode.ast)) return {};

      return {
        CallExpression(node) {
          if (!isFlowCall(node)) return;

          const body = flowCallbackOf(node)?.body;
          if (body?.type !== "BlockStatement") return;

          const first = body.body.findIndex(isTestStep);
          if (first === -1) return;

          for (const statement of body.body.slice(first + 1)) {
            if (isTestStep(statement)) continue;

            context.report({ messageId: "betweenSteps", node: statement });
          }
        },
      };
    },
    meta: {
      messages: {
        betweenSteps:
          "Move this into a `test(...)` step, or above the first one as setup. Code between steps runs outside every step, so the platform attributes its time and its failures to nothing; inside a step it is timed, retried and reported as part of that step.",
      },
    },
  },

  name: "no-code-between-steps",

  severity: "error",
};

/** `await test(...)` as a statement. */
function isTestStep(statement: Statement): boolean {
  if (statement.type !== "ExpressionStatement") return false;

  const { expression } = statement;
  if (expression.type !== "AwaitExpression") return false;

  const call = expression.argument;
  return (
    call.type === "CallExpression" &&
    call.callee.type === "Identifier" &&
    call.callee.name === "test"
  );
}
