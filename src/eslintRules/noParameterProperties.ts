import type { Rule } from "eslint";
import type { Node } from "estree";

import type { PomLintRule } from "./types.js";

/**
 * No constructor parameter properties.
 *
 * ```ts
 * // Reported
 * constructor(private readonly api: ApiClient) {}
 *
 * // Expected
 * private readonly api: ApiClient;
 * constructor(api: ApiClient) {
 *   this.api = api;
 * }
 * ```
 *
 * Unscoped: applies to every file the consumer lints. On a page object the
 * constructor itself is `no-page-object-constructor`.
 */
export const noParameterPropertiesRule: PomLintRule = {
  module: {
    create(context) {
      return {
        TSParameterProperty(node: Rule.Node) {
          const property = node as unknown as ParameterProperty;
          const parameter =
            property.parameter.type === "AssignmentPattern"
              ? property.parameter.left
              : property.parameter;
          const name =
            parameter.type === "Identifier" && parameter.name
              ? parameter.name
              : "the parameter";
          const annotation = parameter.typeAnnotation?.typeAnnotation;

          context.report({
            data: {
              accessibility: property.accessibility ?? "private",
              name,
              type: annotation
                ? context.sourceCode.getText(annotation as Node)
                : "unknown",
            },
            messageId: "parameterProperty",
            node,
          });
        },
      };
    },
    meta: {
      messages: {
        parameterProperty:
          "Declare `{{accessibility}} {{name}}: {{type}};` as a class field and assign it in the constructor body. A parameter property is not erasable syntax: Node's type stripping rejects the file and `erasableSyntaxOnly` reports it, so it never gets as far as running.",
      },
    },
  },

  name: "no-parameter-properties",

  severity: "error",
};

/** The TypeScript parser's node for `private x: T` in a constructor. */
type ParameterProperty = {
  accessibility?: "private" | "protected" | "public";
  parameter:
    | { left: Parameter; type: "AssignmentPattern" }
    | (Parameter & { type: "Identifier" });
};

type Parameter = {
  name?: string;
  type: string;
  typeAnnotation?: { typeAnnotation: { type: string } };
};
