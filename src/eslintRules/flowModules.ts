import type { Rule } from "eslint";
import type {
  ArrowFunctionExpression,
  CallExpression,
  FunctionExpression,
  Program,
} from "estree";

export type FlowCallback = ArrowFunctionExpression | FunctionExpression;

/**
 * A flow module is recognised from its code, the way a page object is
 * recognised from its superclass: it imports `flow` from `@qawolf/flows` (any
 * subpath -- `@qawolf/flows/web`, `/ios`, `/android`) or default-exports a
 * `flow(...)` call. The `.flow.ts` filename is a workspace convention the
 * rules do not depend on, so a flow kept elsewhere is still checked, and a
 * file that merely mentions `flow` in passing is not.
 */
export function isFlowModule(program: Program): boolean {
  return program.body.some((statement) => {
    if (statement.type === "ImportDeclaration") {
      return (
        isFlowsPackage(statement.source.value) &&
        statement.specifiers.some(
          (specifier) =>
            specifier.type === "ImportSpecifier" &&
            specifier.imported.type === "Identifier" &&
            specifier.imported.name === "flow",
        )
      );
    }

    return (
      statement.type === "ExportDefaultDeclaration" &&
      statement.declaration.type === "CallExpression" &&
      isFlowCall(statement.declaration)
    );
  });
}

function isFlowsPackage(source: unknown): boolean {
  return (
    typeof source === "string" &&
    (source === "@qawolf/flows" || source.startsWith("@qawolf/flows/"))
  );
}

/** `flow(...)`, and the `flow.skip(...)` / `flow.only(...)` variants. */
export function isFlowCall(node: CallExpression): boolean {
  const { callee } = node;
  if (callee.type === "Identifier") return callee.name === "flow";

  return (
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "Identifier" &&
    callee.object.name === "flow" &&
    callee.property.type === "Identifier" &&
    (callee.property.name === "skip" || callee.property.name === "only")
  );
}

/** The callback a flow call runs: its last argument, when that is a function. */
export function flowCallbackOf(node: CallExpression): FlowCallback | undefined {
  const last = node.arguments[node.arguments.length - 1];
  if (
    last?.type === "ArrowFunctionExpression" ||
    last?.type === "FunctionExpression"
  )
    return last;

  return undefined;
}

/** Whether `node` sits inside a flow callback, at any depth. */
export function isInsideFlowCallback(node: Rule.Node): boolean {
  let current: Rule.Node | null = node.parent;

  while (current) {
    if (
      (current.type === "ArrowFunctionExpression" ||
        current.type === "FunctionExpression") &&
      current.parent.type === "CallExpression" &&
      isFlowCall(current.parent) &&
      flowCallbackOf(current.parent) === current
    )
      return true;

    current = current.parent;
  }

  return false;
}
