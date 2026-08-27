import { isFlowModule } from "./flowModules.js";
import type { PomLintRule } from "./types.js";

/**
 * A flow makes no HTTP calls of its own.
 *
 * ```ts
 * // Reported
 * const response = await fetch(`${apiUrl}/users`, { method: "POST" });
 * import axios from "axios";
 *
 * // Expected
 * const user = await api.createUser(); // a helper on Playwright's request API
 * ```
 */
export const noFetchAxiosInFlowsRule: PomLintRule = {
  module: {
    create(context) {
      if (!isFlowModule(context.sourceCode.ast)) return {};

      return {
        CallExpression(node) {
          if (node.callee.type !== "Identifier" || node.callee.name !== "fetch")
            return;

          context.report({ messageId: "fetch", node });
        },
        ImportDeclaration(node) {
          if (node.source.value !== "axios") return;

          context.report({ messageId: "axios", node });
        },
      };
    },
    meta: {
      messages: {
        axios:
          "Move the HTTP call behind a helper built on Playwright's request API instead of importing `axios` into the flow. The flow then reads as what the user does, and the request -- its URL, auth and shape -- is fixed in one place when the API changes.",
        fetch:
          "Move this `fetch()` behind a helper built on Playwright's request API. The flow then reads as what the user does, and the request -- its URL, auth and shape -- is fixed in one place when the API changes.",
      },
    },
  },

  name: "no-fetch-axios-in-flows",

  severity: "error",
};
