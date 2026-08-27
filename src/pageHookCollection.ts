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

/**
 * A class's hook defs, tagged with the class itself.
 *
 * `cls` is what lets `installPageHooks` merge these groups with hooks the
 * entry point declares on itself and hooks contributed through
 * `PageSetupOptions.pageHooks`: a class reached by two routes must contribute
 * once, and identity is the only reliable key — two registrations can share a
 * class, and a registered name need not match `cls.name`.
 */
export type HookGroup<TDef> = {
  className: string;
  cls: PomClass;
  defs: TDef[];
};

export async function getRegisteredPopupHandlers(
  page: Page,
): Promise<HookGroup<PopupHandlerDef>[]> {
  const hookBearing = await resolveHookBearingClasses();
  return hookBearing
    .filter(({ cls }) => Object.hasOwn(cls.prototype, "popupHandlers"))
    .map(({ cls, name }) => ({
      className: name,
      cls,
      defs: cls.createFromPage(page).popupHandlers(),
    }));
}

export async function getRegisteredRouteInterceptors(
  page: Page,
): Promise<HookGroup<RouteInterceptorDef>[]> {
  const hookBearing = await resolveHookBearingClasses();
  return hookBearing
    .filter(({ cls }) => Object.hasOwn(cls.prototype, "routeInterceptors"))
    .map(({ cls, name }) => ({
      className: name,
      cls,
      defs: cls.createFromPage(page).routeInterceptors(),
    }));
}
