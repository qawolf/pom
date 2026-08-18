/**
 * Resolving a page name to a module.
 *
 * `this.create("SomePage")` names a class the calling file has almost always
 * already imported for the return type — `import type { SomePage } from
 * "../primary/some-page.ts"` — so that file's own imports say where the module
 * lives, wherever it lives. A type-only import leaves nothing behind at
 * runtime, so the specifier comes from the caller's source text rather than
 * from its module graph.
 *
 * When no import names the class, resolution falls back to the kebab-cased
 * module next to the caller (`./some-page.js`). That covers a file whose
 * type-only import was erased by compilation, a bundle, and a source that
 * cannot be read at all.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const MODULE_EXTENSIONS = [".js", ".ts"] as const;

const EXTENSION_PATTERN = /\.[cm]?[jt]s$/;

/** `SomePage` -> `some-page`, `APIKeyPage` -> `api-key-page`. */
export function toKebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase();
}

/**
 * The specifier of the import that binds `name`, if the source has one.
 *
 * Matches only import statements at the start of a line, which is where module
 * syntax lives in practice, so a lazy clause match cannot run past the end of
 * its own statement. Covers `import type { X } from`, `import { type X } from`,
 * `import { X as Y } from` (matched on the imported name, which is the export
 * to read), a default binding, and a multi-line named list.
 */
export function importedSpecifier(
  name: string,
  source: string,
): string | undefined {
  const importPattern =
    /^[ \t]*import\s+(?:type\s+)?(\{[^{}]*\}|[A-Za-z_$][\w$]*(?:\s*,\s*\{[^{}]*\})?)\s+from\s*["']([^"']+)["']/gm;

  for (const [, clause = "", specifier] of source.matchAll(importPattern))
    if (specifier && boundNames(clause).includes(name)) return specifier;

  return undefined;
}

function boundNames(clause: string): string[] {
  const braceStart = clause.indexOf("{");
  const defaultBinding = (
    braceStart === -1 ? clause : clause.slice(0, braceStart)
  )
    .replace(/,\s*$/, "")
    .trim();

  const names = defaultBinding ? [defaultBinding] : [];
  if (braceStart === -1) return names;

  const named = clause.slice(braceStart + 1, clause.lastIndexOf("}"));
  for (const entry of named.split(",")) {
    const imported = entry
      .trim()
      .replace(/^type\s+/, "")
      .split(/\s+as\s+/)[0];
    if (imported) names.push(imported);
  }

  return names;
}

/**
 * File URLs to try for `name` from `callerUrl`, in order: what the caller's
 * import points at, then the kebab-cased module beside it.
 *
 * An import is followed only when it is relative or absolute — a bare
 * specifier belongs to the workspace's dependency resolution, not to this
 * file-path walk.
 */
export function moduleCandidates(name: string, callerUrl: string): string[] {
  const specifier = importedSpecifier(name, callerSource(callerUrl) ?? "");
  const isPathSpecifier =
    specifier?.startsWith(".") ||
    specifier?.startsWith("/") ||
    specifier?.startsWith("file:");

  const fromImport =
    specifier && isPathSpecifier ? withExtensions(specifier, callerUrl) : [];
  const fromConvention = withExtensions(`./${toKebabCase(name)}`, callerUrl);

  // Order is precedence, so it must survive formatting: what the calling file
  // imports beats what the naming convention guesses.
  const candidates = [...fromImport, ...fromConvention];
  return candidates.filter((url, index) => candidates.indexOf(url) === index);
}

/**
 * The specifier as written, then with each known extension, so that a source
 * compiled to a different extension than it imports still resolves —
 * `"./some-page.js"` finds `some-page.ts` when TypeScript sources run directly.
 */
function withExtensions(specifier: string, callerUrl: string): string[] {
  const asWritten = new URL(specifier, callerUrl).href;
  const withoutExtension = asWritten.replace(EXTENSION_PATTERN, "");
  const written = EXTENSION_PATTERN.test(asWritten) ? [asWritten] : [];

  return [
    ...written,
    ...MODULE_EXTENSIONS.map((extension) => `${withoutExtension}${extension}`),
  ];
}

const sourceByUrl = new Map<string, string | undefined>();

function callerSource(callerUrl: string): string | undefined {
  if (!sourceByUrl.has(callerUrl))
    sourceByUrl.set(callerUrl, readIfPossible(callerUrl));

  return sourceByUrl.get(callerUrl);
}

function readIfPossible(url: string): string | undefined {
  try {
    return readFileSync(fileURLToPath(url), "utf8");
  } catch {
    // An unreadable caller — a virtual path, a deleted file — is not an error
    // here: resolution just falls back to the naming convention.
    return undefined;
  }
}

function isExistingFile(url: string): boolean {
  try {
    return existsSync(fileURLToPath(url));
  } catch {
    return false;
  }
}

export type PageModuleImport = {
  moduleNamespace: Record<string, unknown> | undefined;
  tried: string[];
  url: string | undefined;
};

/**
 * Imports the first candidate that exists, reporting every candidate so an
 * unresolved name can say what it looked for. Existence is checked before
 * importing so that a module-not-found thrown from *inside* the page object —
 * a bad import of its own — surfaces instead of being read as "no such page".
 */
export async function importPageModule(
  name: string,
  callerUrl: string,
): Promise<PageModuleImport> {
  const tried = moduleCandidates(name, callerUrl);
  const url = tried.find(isExistingFile);
  if (!url) return { moduleNamespace: undefined, tried, url: undefined };

  return {
    moduleNamespace: (await import(url)) as Record<string, unknown>,
    tried,
    url,
  };
}

/** Candidate URLs as paths relative to the caller, for error messages. */
export function describeCandidates(
  candidates: string[],
  callerUrl: string,
): string {
  const callerDirectory = dirname(fileURLToPath(callerUrl));

  return candidates
    .map((candidate) => {
      const path = relative(callerDirectory, fileURLToPath(candidate));
      return `"${path.startsWith(".") ? path : `./${path}`}"`;
    })
    .join(", ");
}
