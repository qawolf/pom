import type { Rule } from "eslint";
import type {
  ClassDeclaration,
  ClassExpression,
  MethodDefinition,
  PropertyDefinition,
} from "estree";

export type ClassNode = ClassDeclaration | ClassExpression;

export type ClassMember = MethodDefinition | PropertyDefinition;

/**
 * `accessibility`, `declare` and `readonly` come from the TypeScript parser;
 * estree does not model them.
 */
export type TsClassMember = ClassMember & {
  accessibility?: "private" | "protected" | "public";
  declare?: boolean;
  readonly?: boolean;
};

/** `abstract` likewise. */
export type TsClass = ClassNode & { abstract?: boolean };

/**
 * Matched on the superclass rather than the path, which is not consistent across
 * workspaces. Blind spot: a page object extending *another* page object names no
 * base class here, and following that chain would need type information.
 */
export const pageObjectBaseClasses = new Set([
  "BasePageObject",
  "EntryPointPageObject",
  "SubPageObject",
]);

export function isPageObjectClass(node: ClassNode): boolean {
  const { superClass } = node;
  return (
    superClass?.type === "Identifier" &&
    pageObjectBaseClasses.has(superClass.name)
  );
}

/**
 * The nearest enclosing class, when it is a page object. A class nested inside
 * a page-object method is judged on its own superclass, not the outer one.
 */
export function enclosingPageObject(node: Rule.Node): ClassNode | undefined {
  let current: Rule.Node | null = node.parent;

  while (current) {
    if (current.type === "ClassBody") {
      const declaration = current.parent;
      const isClass =
        declaration.type === "ClassDeclaration" ||
        declaration.type === "ClassExpression";

      return isClass && isPageObjectClass(declaration)
        ? declaration
        : undefined;
    }

    current = current.parent;
  }

  return undefined;
}

/**
 * The class member -- method, getter, or property -- whose body contains
 * `node`. Stops at the nearest class, so a member of a nested class is that
 * class's member, not the outer one's.
 */
export function enclosingClassMember(node: Rule.Node): ClassMember | undefined {
  let current: Rule.Node | null = node.parent;

  while (current) {
    if (
      current.type === "MethodDefinition" ||
      current.type === "PropertyDefinition"
    )
      return current;
    if (current.type === "ClassBody") return undefined;

    current = current.parent;
  }

  return undefined;
}

/** `selectors` are the mobile equivalents. */
export const locatorHolderNames = new Set([
  "dynamicLocators",
  "dynamicSelectors",
  "locators",
  "selectors",
]);

/**
 * The static name of a member key: `locators` or `"locators"`. A computed or
 * private key has no name here.
 */
export function memberName(member: ClassMember): string | undefined {
  if (member.computed) return undefined;

  const { key } = member;
  if (key.type === "Identifier") return key.name;
  if (key.type === "Literal" && typeof key.value === "string") return key.value;

  return undefined;
}

/**
 * The convention documents the getter, but a property holds the same map, and
 * reporting that would say "move this into `locators`" about something already
 * in `locators`. A plain *method* of that name is neither.
 */
export function isLocatorHolder(member: ClassMember | undefined): boolean {
  if (!member) return false;

  const isHolderShape =
    member.type === "PropertyDefinition" ||
    (member.type === "MethodDefinition" && member.kind === "get");
  if (!isHolderShape) return false;

  const name = memberName(member);
  return name !== undefined && locatorHolderNames.has(name);
}
