/**
 * Resolving a page name to a module by convention, for workspaces with no
 * `register-pages.ts`. A page object that calls `this.create("SomePage")`
 * without a registry gets the sibling module next to its own file —
 * `./some-page.js`, or `./some-page.ts` when TypeScript sources run directly.
 *
 * This is the fallback path only: a registered name never reaches it, so
 * registration always wins over the convention.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const MODULE_EXTENSIONS = [".js", ".ts"] as const;

/** `SomePage` -> `some-page`, `APIKeyPage` -> `api-key-page`. */
export function toKebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/** Absolute file URLs tried for `name`, in order, next to `callerUrl`. */
export function siblingModuleCandidates(
  name: string,
  callerUrl: string,
): string[] {
  const fileName = toKebabCase(name);
  return MODULE_EXTENSIONS.map(
    (extension) => new URL(`./${fileName}${extension}`, callerUrl).href,
  );
}

export type SiblingPageModule = {
  moduleNamespace: Record<string, unknown>;
  url: string;
};

/**
 * Imports the first candidate that exists, or resolves `undefined` when none
 * do. Existence is checked before importing so that a module-not-found thrown
 * from *inside* the sibling — a bad import of its own — surfaces instead of
 * being read as "no such page".
 */
export async function importSiblingPageModule(
  name: string,
  callerUrl: string,
): Promise<SiblingPageModule | undefined> {
  for (const url of siblingModuleCandidates(name, callerUrl)) {
    if (!existsSync(fileURLToPath(url))) continue;

    const moduleNamespace = (await import(url)) as Record<string, unknown>;
    return { moduleNamespace, url };
  }

  return undefined;
}
