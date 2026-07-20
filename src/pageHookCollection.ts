/**
 * Page-hook collection — reads `popupHandlers()` / `routeInterceptors()` defs
 * off every registered POM for `EntryPointPageObject.installPageHooks`.
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

async function resolveHookBearingClasses(): Promise<
  { cls: PomClass; name: string }[]
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
  const hookBearing = await resolveHookBearingClasses();
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
  const hookBearing = await resolveHookBearingClasses();
  return hookBearing
    .filter(({ cls }) => Object.hasOwn(cls.prototype, "routeInterceptors"))
    .map(({ cls, name }) => ({
      className: name,
      defs: cls.createFromPage(page).routeInterceptors(),
    }));
}
