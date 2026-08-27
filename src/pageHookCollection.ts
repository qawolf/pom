/**
 * Page-hook collection — resolves which registered POMs declare
 * `popupHandlers()` / `routeInterceptors()`, and reads their defs.
 *
 * `EntryPointPageObject.installPageHooks` takes the classes
 * (`getRegisteredHookBearingClasses`) rather than the per-kind groups, because
 * it merges them with the entry point itself and with `pageHooks`
 * contributors and must construct each class at most once. The per-kind
 * collectors below stay for callers that ask the registry one kind at a time.
 *
 * Hook defs can only be read off a loaded class, so this loads every lazy
 * registry entry except those registered `{ providesPageHooks: false }`.
 * Overrides are detected via `Object.hasOwn(cls.prototype, ...)`, so only
 * classes that directly declare the override are picked up.
 */
import type { Page } from "playwright";

import type { PopupHandlerDef, RouteInterceptorDef } from "./pageHooks.js";
import {
  classDeclaresPageHooks,
  entries,
  loadPageClass,
} from "./pageRegistry.js";
import type { PomClass } from "./pageRegistry.js";

export type HookBearingClass = { cls: PomClass; name: string };

/** Every registered class that directly declares either hook override, tagged
 *  with the name it was registered under. */
export async function getRegisteredHookBearingClasses(): Promise<
  HookBearingClass[]
> {
  const resolved = await Promise.all(
    Object.entries(entries).map(async ([name, entry]) => {
      if (entry.kind === "lazy" && entry.providesPageHooks === false)
        return undefined;
      const cls =
        entry.kind === "eager" ? entry.cls : await loadPageClass(name, entry);
      return classDeclaresPageHooks(cls) ? { cls, name } : undefined;
    }),
  );
  return resolved.filter((entry) => entry !== undefined);
}

export async function getRegisteredPopupHandlers(
  page: Page,
): Promise<{ className: string; defs: PopupHandlerDef[] }[]> {
  const hookBearing = await getRegisteredHookBearingClasses();
  return hookBearing
    .filter(({ cls }) => Object.hasOwn(cls.prototype, "popupHandlers"))
    .map(({ cls, name }) => ({
      className: name,
      defs: cls.createFromPage(page).popupHandlers(),
    }));
}

export async function getRegisteredRouteInterceptors(
  page: Page,
): Promise<{ className: string; defs: RouteInterceptorDef[] }[]> {
  const hookBearing = await getRegisteredHookBearingClasses();
  return hookBearing
    .filter(({ cls }) => Object.hasOwn(cls.prototype, "routeInterceptors"))
    .map(({ cls, name }) => ({
      className: name,
      defs: cls.createFromPage(page).routeInterceptors(),
    }));
}
