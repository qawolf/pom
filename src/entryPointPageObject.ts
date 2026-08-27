import type { Page } from "playwright";

import { launch } from "@qawolf/flows/web";

import { BasePageObject } from "./basePageObject.js";
import { getRegisteredHookBearingClasses } from "./pageHookCollection.js";
import type {
  PageSetupOptions,
  PopupHandlerDef,
  RouteInterceptorDef,
} from "./pageHooks.js";
import type { PomClass, RegistrablePage } from "./pageRegistry.js";
import { buildPopupShieldInitScript } from "./popupShieldInitScript.js";

/** Hook defs of one kind, attributed to the declaring class's name so a
 *  duplicate-name error can say which classes collided. */
type HookGroup<TDef> = {
  className: string;
  defs: TDef[];
};

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

  /** Close the browser that owns this page, swallowing teardown failures. */
  async closeBrowser(): Promise<void> {
    await this.page
      .context()
      .browser()
      ?.close()
      .catch(() => {});
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

    const { popupGroups, routeGroups } = await this.collectHookGroups(
      options?.pageHooks,
    );
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
   * Hook groups of both kinds from all three sources — the page registry, this
   * entry point itself, and the classes named in `options.pageHooks` —
   * collected in one pass so each class is constructed at most once, and
   * contributes exactly once however it was reached.
   *
   * Dedupe is by class identity rather than by name because contributing
   * twice is not merely wasteful: the second contribution repeats every hook
   * name and `assertUniqueHookNames` throws. Identity is also the only
   * reliable key — a registered name need not match `cls.name`, and one class
   * can be registered under two names — so a registry alias, an entry point a
   * workspace also registers, and a class both registered and named in
   * `pageHooks` all collapse to a single contribution.
   *
   * Both kinds are read together because collecting them in separate passes
   * would construct a class declaring both overrides twice, double-firing any
   * side effect in its constructor.
   *
   * `Object.hasOwn` matches how the registry detects overrides, so a class
   * that only inherits `popupHandlers()` / `routeInterceptors()` contributes
   * nothing of that kind here either.
   */
  private async collectHookGroups(
    contributors: PomClass[] | undefined,
  ): Promise<{
    popupGroups: HookGroup<PopupHandlerDef>[];
    routeGroups: HookGroup<RouteInterceptorDef>[];
  }> {
    const popupGroups: HookGroup<PopupHandlerDef>[] = [];
    const routeGroups: HookGroup<RouteInterceptorDef>[] = [];
    const seen = new Set<PomClass>();
    // `this.constructor` is typed `Function`; at runtime it is the concrete
    // entry-point class, which carries `createFromPage`, `name` and `prototype`.
    const self = this.constructor as unknown as PomClass;

    // Registry first, so a class reached both ways keeps the name it was
    // registered under in any duplicate-name error.
    const registered = await getRegisteredHookBearingClasses();
    const candidates: { className: string; cls: PomClass }[] = [
      ...registered.map(({ cls, name }) => ({ className: name, cls })),
      { className: self.name, cls: self },
      ...(contributors ?? []).map((cls) => ({ className: cls.name, cls })),
    ];

    for (const { className, cls } of candidates) {
      if (seen.has(cls)) continue;
      seen.add(cls);

      const ownPopups = Object.hasOwn(cls.prototype, "popupHandlers");
      const ownRoutes = Object.hasOwn(cls.prototype, "routeInterceptors");
      if (!ownPopups && !ownRoutes) continue;

      // `this` is already bound to the page, so only other classes are
      // constructed — and each of those exactly once.
      const source: RegistrablePage =
        cls === self ? this : cls.createFromPage(this.page);
      if (ownPopups)
        popupGroups.push({ className, defs: source.popupHandlers() });
      if (ownRoutes)
        routeGroups.push({ className, defs: source.routeInterceptors() });
    }

    return { popupGroups, routeGroups };
  }
}

export type InitializeBrowserOptions = {
  args?: string[];
  browser?: "chrome" | "chromium" | "firefox" | "msedge" | "webkit";
  channel?: string;
  device?: BrowserDeviceOverride;
  extraHTTPHeaders?: Record<string, string>;
  headless?: boolean;
  permissions?: string[];
  proxy?: BrowserProxyConfig;
  slowMo?: number;
  storageState?: string;
  viewport?: null | { height: number; width: number };
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
