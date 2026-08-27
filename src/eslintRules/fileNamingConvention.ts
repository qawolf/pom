import type { PomLintRule } from "./types.js";

/**
 * Files under `src/` are named in kebab-case.
 *
 * ```
 * // Reported
 * src/pages/SignInPage.ts
 * src/flows/addToCart.flow.ts
 *
 * // Expected
 * src/pages/sign-in-page.ts
 * src/flows/add-to-cart.flow.ts
 * ```
 *
 * The one rule here that is about the path, because the path is its subject.
 * Only files under a `src/` directory are checked; the extension and the
 * `.flow` / `.test` / `.spec` suffix are not part of the name.
 */
export const fileNamingConventionRule: PomLintRule = {
  module: {
    create(context) {
      const path = context.filename.split("\\").join("/");
      if (!path.includes("/src/")) return {};

      return {
        Program(node) {
          const basename = path.slice(path.lastIndexOf("/") + 1);
          const stem = basename.replace(
            /(\.(flow|test|spec))?\.(ts|tsx|mts|cts|js|mjs|cjs)$/,
            "",
          );
          if (kebabCase.test(stem)) return;

          context.report({
            data: { basename, expected: expectedFor(path) },
            messageId: "notKebabCase",
            node,
          });
        },
      };
    },
    meta: {
      messages: {
        notKebabCase:
          "Rename `{{basename}}` to kebab-case: {{expected}}. Every other file in the workspace is named this way, and on a case-sensitive runner an import that matches the name in the wrong case resolves on the workstation and fails there.",
      },
    },
  },

  name: "file-naming-convention",

  severity: "warn",
};

const kebabCase = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function expectedFor(path: string): string {
  if (path.includes("/flows/")) return "`add-to-cart.flow.ts`";
  if (path.includes("/pages/"))
    return "`sign-in-page.ts`, `main-nav-component.ts`";

  return "`my-helper.ts`";
}
