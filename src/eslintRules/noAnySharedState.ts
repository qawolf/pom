import type { Rule } from "eslint";
import type { Expression } from "estree";

import { isFlowModule, isInsideFlowCallback } from "./flowModules.js";
import type { PomLintRule } from "./types.js";

/**
 * State a flow shares between steps is typed as the page object it holds.
 *
 * ```ts
 * // Reported
 * let cart: any;
 * let cart;
 * let cart = undefined as any;
 *
 * // Expected
 * let cart: CartPage;
 * let cart: Awaited<ReturnType<typeof checkout.goToCart>>;
 * ```
 *
 * Only `let` declarations inside the flow callback -- the ones assigned in
 * one `test` step and read in the next. A `let` with an initializer is left
 * to inference unless that initializer is an `any` cast.
 */
export const noAnySharedStateRule: PomLintRule = {
  module: {
    create(context) {
      if (!isFlowModule(context.sourceCode.ast)) return {};

      return {
        VariableDeclaration(node) {
          if (node.kind !== "let" || !isInsideFlowCallback(node)) return;

          for (const declarator of node.declarations) {
            if (declarator.id.type !== "Identifier") continue;

            const { name } = declarator.id;
            const annotation = (declarator.id as WithTypeAnnotation)
              .typeAnnotation?.typeAnnotation;

            if (annotation) {
              if (containsAny(annotation)) {
                context.report({
                  data: { name },
                  messageId: "anyType",
                  node: annotation as unknown as Rule.Node,
                });
              }
              continue;
            }

            if (!declarator.init) {
              context.report({
                data: { name },
                messageId: "missingType",
                node: declarator,
              });
              continue;
            }

            if (isAnyCast(declarator.init)) {
              context.report({
                data: { name },
                messageId: "anyType",
                node: declarator.init,
              });
            }
          }
        },
      };
    },
    meta: {
      messages: {
        anyType:
          "Type `{{name}}` as what it holds -- the page object's class (`let {{name}}: SomePage`), or `Awaited<ReturnType<typeof ...>>` of the method that produces it -- instead of `any`. As `any`, every method called on it in a later step is unchecked, and a renamed method is found on the runner instead of by `tsc`.",
        missingType:
          "Give `{{name}}` a type: the page object's class (`let {{name}}: SomePage`), or `Awaited<ReturnType<typeof ...>>` of the method that produces it. Declared bare it is `any`, and every method called on it in a later step is unchecked.",
      },
    },
  },

  name: "no-any-shared-state",

  severity: "error",
};

/** TypeScript type nodes, which estree does not model. */
type TsType = {
  elementType?: TsType;
  type: string;
  typeArguments?: { params: TsType[] };
  typeParameters?: { params: TsType[] };
  types?: TsType[];
};

type WithTypeAnnotation = { typeAnnotation?: { typeAnnotation: TsType } };

function containsAny(type: TsType): boolean {
  if (type.type === "TSAnyKeyword") return true;
  if (type.type === "TSArrayType" && type.elementType)
    return containsAny(type.elementType);
  if (type.type === "TSUnionType" || type.type === "TSIntersectionType")
    return (type.types ?? []).some(containsAny);
  if (type.type === "TSTypeReference") {
    // `typeParameters` is the pre-v6 typescript-eslint name of `typeArguments`.
    const args = type.typeArguments ?? type.typeParameters;
    return (args?.params ?? []).some(containsAny);
  }

  return false;
}

/** `x as any` / `<any>x`. */
function isAnyCast(node: Expression): boolean {
  const cast = node as { type: string; typeAnnotation?: TsType };
  return (
    (cast.type === "TSAsExpression" || cast.type === "TSTypeAssertion") &&
    cast.typeAnnotation?.type === "TSAnyKeyword"
  );
}
