import type { Page } from "playwright";

import { launch } from "@qawolf/flows/web";

import { BasePageObject } from "./basePageObject.js";
import {
  getRegisteredPopupHandlers,
  getRegisteredRouteInterceptors,
} from "./pageHookCollection.js";
import type { HookGroup } from "./pageHookCollection.js";
import type { PageSetupOptions } from "./pageHooks.js";
import type { PomClass, RegistrablePage } from "./pageRegistry.js";
import { buildPopupShieldInitScript } from "./popupShieldInitScript.js";

/**
 * Playwright applies HTTP auth when `httpCredentials` is set. Passing empty
 * username/password (e.g. from unset env vars coerced with `?? ""`) breaks
 * navigation on sites that do not expect preemptive auth — only include
 * credentials when both `AUTH_USERNAME` and `AUTH_PASSWORD` are non-empty.
 */
function optionalHttpCredentialsFromEnv():
  | { httpCredentials: { password: string; username: string } }
  | Record<string, never> {
  const username = process.env.AUTH_USERNAME;
  const password = process.env.AUTH_PASSWORD;
  if (username && password) return { httpCredentials: { password, username } };

  return {};
}

function assertUniqueHookNames(
  groups: { className: string; defs: { name: string }[] }[],
  kind: "popup" | "route",
): void {
  const seen = new Map<string, string>();
  for (const { className, defs } of groups) {
    for (const def of defs) {
      const prev = seen.get(def.name);
      if (prev !== undefined) {
        if (prev === className) {
          throw Error(
            `Duplicate ${kind} hook name "${def.name}" defined twice on ${className}.`,
          );
        }
        throw Error(
          `Duplicate ${kind} hook name "${def.name}" registered by both ${prev} and ${className}.`,
        );
      }
      seen.set(def.name, className);
    }
  }
}

export abstract class EntryPointPageObject extends BasePageObject {
  protected static async initializeBrowser(
    options: InitializeBrowserOptions = {},
  ): Promise<Page> {
    const launchResult = await launch({
      ...options,
      ...optionalHttpCredentialsFromEnv(),
    });

    if (!("browser" in launchResult))
      throw Error("Expected a browser launch result for QAW platform context.");

    return launchResult.context.newPage();
  }

  /**
   * Navigate to a URL (defaults to DEFAULT_URL from .env). Accepts Playwright's
   * `page.goto` options; `waitUntil: "domcontentloaded"` and `timeout: 60000`
   * are the defaults, overridable per call.
   */
  async goto(
    url?: string,
    options?: Parameters<Page["goto"]>[1],
  ): Promise<void> {
    const targetUrl = url || process.env.DEFAULT_URL;
    if (!targetUrl) {
      throw Error(
        "No URL provided and no DEFAULT_URL environment variable is set",
      );
    }
    await this.page.goto(targetUrl, {
      timeout: 60000,
      waitUntil: "domcontentloaded",
      ...options,
    });
  }

  // Concrete entry points define `static async create()` using `initializeBrowser`,
  // `new this(page)`, and `installPageHooks`.

  /**
   * Install all page hooks. Call before goto().
   *
   * Hook defs come from three places: every POM registered in the page
   * registry that overrode `popupHandlers()` / `routeInterceptors()`, this
   * entry point's own overrides, and any POM class passed as
   * `options.pageHooks`. A workspace can therefore install hooks with no
   * registry at all. See `pageHookCollection.ts` for the auto-detection
   * mechanism and `collectHookGroups` for how the three are merged.
   */
  protected async installPageHooks(options?: PageSetupOptions): Promise<void> {
    const skipPopups = new Set(options?.allowPopups);
    const skipRoutes = new Set(options?.allowRoutes);

    const popupGroups = this.collectHookGroups({
      explicit: options?.pageHooks,
      kind: "popupHandlers",
      read: (source) => source.popupHandlers(),
      registryGroups: await getRegisteredPopupHandlers(this.page),
    });
    const routeGroups = this.collectHookGroups({
      explicit: options?.pageHooks,
      kind: "routeInterceptors",
      read: (source) => source.routeInterceptors(),
      registryGroups: await getRegisteredRouteInterceptors(this.page),
    });
    assertUniqueHookNames(popupGroups, "popup");
    assertUniqueHookNames(routeGroups, "route");

    const popupDefs = popupGroups.flatMap((g) => g.defs);
    const routeDefs = routeGroups.flatMap((g) => g.defs);

    if (options?.handler) {
      options.handler.install(this.page);
      for (const def of popupDefs) {
        if (skipPopups.has(def.name)) continue;
        await options.handler.add(def.name, def.trigger, def.dismiss);
      }
    } else {
      const cssSelectors: string[] = [];
      for (const def of popupDefs) {
        if (skipPopups.has(def.name)) continue;
        if (def.cssSelector) cssSelectors.push(def.cssSelector);
        // A popup without a cssSelector cannot use the CSS-injection shield, so
        // it falls back to addLocatorHandler. In default mode the shield is
        // preferred because addLocatorHandler deadlocks when multiple overlays
        // stack — each handler waits for the action pipeline, blocking all
        // locator operations (evaluate, count, screenshot).
        else {
          await this.page.addLocatorHandler(def.trigger, async () => {
            await def.dismiss();
          });
        }
      }
      if (cssSelectors.length > 0)
        await this.page.addInitScript(buildPopupShieldInitScript(cssSelectors));
    }

    for (const routeDef of routeDefs) {
      if (skipRoutes.has(routeDef.name)) continue;
      await this.page.route(routeDef.pattern, routeDef.handler);
    }

    if (options?.monitor) options.monitor.install(this.page);
  }

  /**
   * Hook groups from all three sources — the page registry, this entry point
   * itself, and the classes named in `options.pageHooks` — with each class
   * contributing exactly once however it was reached.
   *
   * Dedupe is by class identity rather than by name because contributing
   * twice is not merely wasteful: the second contribution repeats every hook
   * name and `assertUniqueHookNames` throws. An entry point that a workspace
   * also registers is the common case, so identity is what keeps the registry
   * and the two registry-free routes compatible with each other.
   *
   * `Object.hasOwn` matches how the registry detects overrides, so a class
   * that only inherits `popupHandlers()` contributes nothing here either.
   */
  private collectHookGroups<TDef>({
    explicit,
    kind,
    read,
    registryGroups,
  }: {
    explicit: PomClass[] | undefined;
    kind: "popupHandlers" | "routeInterceptors";
    read: (source: RegistrablePage) => TDef[];
    registryGroups: HookGroup<TDef>[];
  }): HookGroup<TDef>[] {
    const groups = [...registryGroups];
    const seen = new Set<PomClass>(groups.map((group) => group.cls));
    // `this.constructor` is typed `Function`; at runtime it is the concrete
    // entry-point class, which carries `createFromPage` and `prototype`.
    const self = this.constructor as unknown as PomClass;

    for (const cls of [self, ...(explicit ?? [])]) {
      if (seen.has(cls) || !Object.hasOwn(cls.prototype, kind)) continue;
      seen.add(cls);
      // `this` is already bound to the page, so only contributed classes are
      // constructed.
      const source = cls === self ? this : cls.createFromPage(this.page);
      groups.push({ className: cls.name, cls, defs: read(source) });
    }

    return groups;
  }
}

export type InitializeBrowserOptions = {
  device?: BrowserDeviceOverride;
  permissions?: string[];
  proxy?: BrowserProxyConfig;
  slowMo?: number;
};

type BrowserDeviceOverride = {
  deviceScaleFactor?: number;
  hasTouch?: boolean;
  isMobile?: boolean;
  userAgent?: string;
  viewport?: { height: number; width: number };
};

type BrowserProxyConfig = {
  password?: string;
  server: string;
  username?: string;
};
