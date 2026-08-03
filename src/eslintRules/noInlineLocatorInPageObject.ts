import type { Rule } from "eslint";

import type { PomLintRule } from "./types.js";

/**
 * Page objects keep every locator in a named getter.
 *
 * ```ts
 * // Reported
 * async signIn() {
 *   await this.page.getByRole("button", { name: "Sign in" }).click();
 * }
 *
 * // Expected
 * private get locators() {
 *   return { signInButton: this.page.getByRole("button", { name: "Sign in" }) } as const;
 * }
 * async signIn() {
 *   await this.locators.signInButton.click();
 * }
 * ```
 */
export const noInlineLocatorInPageObjectRule: PomLintRule = {
  module: {
    create(context) {
      return {
        MemberExpression(node) {
          const name = locatorCallName(node);
          if (!name || !isOutsideLocatorHolder(node)) return;

          context.report({ data: { name }, messageId: "inlineLocator", node });
        },
      };
    },
    meta: {
      messages: {
        inlineLocator:
          "Move this `{{name}}` call into the page object's `locators` or `dynamicLocators` (`selectors` on mobile) and reference it from here. A locator named for its purpose is fixed in one place when the markup changes; inline, it is invisible to every other method that needs the same element.",
      },
    },
  },

  name: "no-inline-locator-in-page-object",

  severity: "warn",
};

/** `selectors` are the mobile equivalents. */
const locatorHolderNames = new Set([
  "dynamicLocators",
  "dynamicSelectors",
  "locators",
  "selectors",
]);

/**
 * Matched on the superclass rather than the path, which is not consistent across
 * workspaces. Blind spot: a page object extending *another* page object names no
 * base class here, and following that chain would need type information.
 */
const pageObjectBaseClasses = new Set([
  "BasePageObject",
  "EntryPointPageObject",
  "SubPageObject",
]);

/**
 * `frameLocator` counts: an iframe locator is built the same way. Only a plain
 * `this.page` matches -- `this.page!` and `(this.page as Page)` wrap it in nodes
 * ESLint's types do not model, and neither is worth a cast to reach.
 */
function locatorCallName(node: Rule.Node): string | undefined {
  if (node.type !== "MemberExpression") return undefined;
  if (node.property.type !== "Identifier") return undefined;
  // The callee, not merely inside a call -- `register(this.page.getByRole)`
  // passes the builder along without building anything.
  if (node.parent.type !== "CallExpression" || node.parent.callee !== node)
    return undefined;

  const { name } = node.property;
  const builds =
    name === "locator" || name === "frameLocator" || name.startsWith("getBy");
  if (!builds) return undefined;

  const target = node.object;
  const isThisPage =
    target.type === "MemberExpression" &&
    target.object.type === "ThisExpression" &&
    target.property.type === "Identifier" &&
    target.property.name === "page";

  return isThisPage ? name : undefined;
}

/**
 * Keys on the enclosing class member, not on "is this inside a function": a
 * `dynamicLocators` entry is itself a function --
 * `airportOption: (name: string) => this.page.getByText(name)`.
 */
function isOutsideLocatorHolder(node: Rule.Node): boolean {
  let member: Rule.Node | undefined;
  let current: Rule.Node | null = node.parent;

  while (current) {
    if (
      current.type === "MethodDefinition" ||
      current.type === "PropertyDefinition"
    )
      member ??= current;

    if (current.type === "ClassBody") {
      const declaration = current.parent;
      const superClass =
        declaration.type === "ClassDeclaration" ||
        declaration.type === "ClassExpression"
          ? declaration.superClass
          : undefined;

      if (
        superClass?.type !== "Identifier" ||
        !pageObjectBaseClasses.has(superClass.name)
      )
        return false;

      return !isLocatorHolder(member);
    }

    current = current.parent;
  }

  return false;
}

/**
 * The convention documents the getter, but a property holds the same map, and
 * reporting that would say "move this into `locators`" about something already
 * in `locators`. A plain *method* of that name is neither, and is reported.
 */
function isLocatorHolder(member: Rule.Node | undefined): boolean {
  if (!member) return false;

  const isHolderShape =
    member.type === "PropertyDefinition" ||
    (member.type === "MethodDefinition" && member.kind === "get");
  if (!isHolderShape) return false;

  return (
    member.key.type === "Identifier" && locatorHolderNames.has(member.key.name)
  );
}
