import type { Rule } from "eslint";

import type { PomLintRule } from "./types.js";

/**
 * No postfix `!`.
 *
 * ```ts
 * // Reported
 * const url = process.env.URL!;
 * await this.page!.goto(url);
 *
 * // Expected
 * const url = requireEnv("URL");
 * if (!row) throw Error("No row for " + name);
 * ```
 *
 * Unscoped: applies to every file the consumer lints.
 */
export const noNonNullAssertionRule: PomLintRule = {
  module: {
    create(context) {
      return {
        TSNonNullExpression(node: Rule.Node) {
          context.report({ messageId: "nonNullAssertion", node });
        },
      };
    },
    meta: {
      messages: {
        nonNullAssertion:
          "Replace the `!` with a check that says what happens when the value is missing: `?.`, a type guard, or an explicit throw with the name of what was not found. The `!` tells the compiler to stop looking, so the run fails later, in whatever the missing value was used for, with a message about that instead.",
      },
    },
  },

  name: "no-non-null-assertion",

  severity: "error",
};
