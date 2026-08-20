import type { Page } from "playwright";

import { launch } from "@qawolf/flows/web";

import { BasePageObject } from "./basePageObject.js";
import {
  getRegisteredPopupHandlers,
  getRegisteredRouteInterceptors,
} from "./pageHookCollection.js";
import type { PageSetupOptions } from "./pageHooks.js";
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
   * Hook defs come from the page registry — every POM that overrode
   * `popupHandlers()` or `routeInterceptors()` on its class contributes
   * here, not just the entry point. See `pageHookCollection.ts` for the
   * auto-detection mechanism.
   */
  protected async installPageHooks(options?: PageSetupOptions): Promise<void> {
    const skipPopups = new Set(options?.allowPopups);
    const skipRoutes = new Set(options?.allowRoutes);

    const popupGroups = await getRegisteredPopupHandlers(this.page);
    const routeGroups = await getRegisteredRouteInterceptors(this.page);
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
