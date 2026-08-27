import type { Rule } from "eslint";

import { isFlowModule } from "./flowModules.js";
import type { PomLintRule } from "./types.js";

/**
 * Every step has its Arrange, Act and Assert sections marked.
 *
 * ```ts
 * // Reported
 * await test("Add to cart", async () => {
 *   await home.goToProduct();
 *   await product.addToCart();
 *   await cart.assertHasItem();
 * });
 *
 * // Expected
 * await test("Add to cart", async () => {
 *   // Arrange:
 *   await home.goToProduct();
 *   // Act:
 *   await product.addToCart();
 *   // Assert:
 *   await cart.assertHasItem();
 * });
 * ```
 *
 * A comment anywhere in the step body containing the word counts, in any
 * case, so a combined `// Arrange / Act:` marks both. The banner shape is
 * `aaa-banner-format`.
 */
export const testAaaCommentsRule: PomLintRule = {
  module: {
    create(context) {
      if (!isFlowModule(context.sourceCode.ast)) return {};

      return {
        CallExpression(node) {
          const step = testStep(node);
          if (!step) return;

          const [start, end] = step.body.range ?? [0, 0];
          const text = context.sourceCode
            .getAllComments()
            .filter((comment) => {
              const [from, to] = comment.range ?? [-1, -1];
              return from >= start && to <= end;
            })
            .map((comment) => comment.value)
            .join("\n");

          const missing = ["Arrange", "Act", "Assert"].filter(
            (section) => !new RegExp(`\\b${section}\\b`, "i").test(text),
          );
          if (missing.length === 0) return;

          context.report({
            data: { missing: missing.join(", "), name: step.name },
            messageId: "missingSections",
            node: step.nameNode,
          });
        },
      };
    },
    meta: {
      messages: {
        missingSections:
          'The step "{{name}}" has no {{missing}} comment. Mark the three sections -- what is set up, what the user does, what is checked -- so a reader can find the action a failure sits in without reading the whole step. A step that is all one section still says which.',
      },
    },
  },

  name: "test-aaa-comments",

  severity: "warn",
};

type TestStep = {
  body: Rule.Node;
  name: string;
  nameNode: Rule.Node;
};

/** `test("name", async () => { ... })`. */
export function testStep(node: Rule.Node): TestStep | undefined {
  if (node.type !== "CallExpression") return undefined;
  if (node.callee.type !== "Identifier" || node.callee.name !== "test")
    return undefined;

  const [nameNode, callback] = node.arguments;
  if (!nameNode || !callback) return undefined;
  if (
    callback.type !== "ArrowFunctionExpression" &&
    callback.type !== "FunctionExpression"
  )
    return undefined;
  if (callback.body.type !== "BlockStatement") return undefined;

  const name =
    nameNode.type === "Literal" && typeof nameNode.value === "string"
      ? nameNode.value
      : "<dynamic>";

  return {
    body: callback.body as Rule.Node,
    name,
    nameNode: nameNode as Rule.Node,
  };
}
