import type { Rule } from "eslint";
import type { ImportDeclaration, Node, Program } from "estree";

import type { PomLintRule } from "./types.js";

/**
 * A page created by name must be bound by a value import, not a type-only one.
 *
 * ```ts
 * // Reported
 * import type { CartPage } from "../cart/cart-page.ts";
 * await this.create("CartPage");
 *
 * // Expected
 * import { CartPage } from "../cart/cart-page.ts";
 * await this.create("CartPage");
 * ```
 *
 * With no page registry, `create("CartPage")` resolves the name by reading the
 * *calling file's own source* for an import that binds it. On the cloud runner
 * that file is the compiled `.js`, where a type-only import has been erased:
 * the specifier is gone and the call throws `Unknown page`. Neither `tsc` nor
 * the playground (which executes the `.ts`, import still present) can catch
 * it — only a cloud run does, which is why this is an `error`.
 *
 * The check mirrors the runtime lookup in `pageModuleResolution.ts` exactly:
 * a named import matches on the *imported* name (so `import type { CartPage
 * as Other }` still resolves `"CartPage"`), a default import matches on its
 * local name, the first matching import wins, and imports from bare package
 * specifiers are never followed — a type-only one of those fails identically
 * on every platform, loudly and on the first run, so it is not reported.
 */
export const requireValueImportForCreatedPageRule: PomLintRule = {
  module: {
    create(context) {
      return {
        CallExpression(node) {
          const name = createdPageName(node);
          if (!name) return;

          const binding = importBinding(name, context.getSourceCode().ast);
          if (!binding?.isTypeOnly || !isPathSpecifier(binding.specifier))
            return;

          context.report({ data: { name }, messageId: "typeOnlyImport", node });
        },
      };
    },
    meta: {
      messages: {
        typeOnlyImport:
          '`{{name}}` is bound by a type-only import, which compilation erases. `create("{{name}}")` resolves the name by reading this file\'s imports at runtime, so on the cloud runner the compiled file no longer says where `{{name}}` lives and the call throws `Unknown page`. Drop the `type` keyword — a value import survives compilation — or pass the class instead: `this.create({{name}})`.',
      },
    },
  },

  name: "require-value-import-for-created-page",

  severity: "error",
};

/**
 * The page name a call creates: `this.create("X")`, including the annotated
 * `this.create<X>("X")`, where the string argument is what resolves. Only a
 * literal name can be checked against the imports; a variable is left alone,
 * and so is the class form `this.create(X)`, which tsc already polices.
 */
function createdPageName(node: Rule.Node): string | undefined {
  if (node.type !== "CallExpression") return undefined;

  const [first] = node.arguments;
  if (first?.type !== "Literal" || typeof first.value !== "string")
    return undefined;

  const { callee } = node;
  const isThisCreate =
    callee.type === "MemberExpression" &&
    !callee.computed &&
    callee.object.type === "ThisExpression" &&
    callee.property.type === "Identifier" &&
    callee.property.name === "create";

  return isThisCreate ? first.value : undefined;
}

/** `importKind` comes from the TypeScript parser; estree does not model it. */
type WithImportKind = { importKind?: "type" | "value" };

type ImportBinding = { isTypeOnly: boolean; specifier: string };

/**
 * The first import that binds `name` the way the runtime lookup would find it.
 * `undefined` means the name is not imported at all — either registered, or a
 * failure the runtime reports identically on every platform; one file cannot
 * judge which, so it is not reported here.
 */
function importBinding(
  name: string,
  program: Program,
): ImportBinding | undefined {
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") continue;

    const specifier = matchingSpecifier(name, statement);
    if (!specifier) continue;

    const isTypeOnly =
      (statement as WithImportKind).importKind === "type" ||
      (specifier as WithImportKind).importKind === "type";

    return { isTypeOnly, specifier: String(statement.source.value) };
  }

  return undefined;
}

function matchingSpecifier(
  name: string,
  declaration: ImportDeclaration,
): Node | undefined {
  return declaration.specifiers.find((specifier) => {
    // A named import matches on the imported (exported) name, which is what
    // the runtime reads; a default import has only its local name.
    if (specifier.type === "ImportSpecifier") {
      return (
        specifier.imported.type === "Identifier" &&
        specifier.imported.name === name
      );
    }

    return (
      specifier.type === "ImportDefaultSpecifier" &&
      specifier.local.name === name
    );
  });
}

/** Mirrors `moduleCandidates`: only these specifiers are followed at runtime. */
function isPathSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("file:")
  );
}
