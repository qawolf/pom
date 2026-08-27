import type { Page } from "playwright";

import { launch } from "@qawolf/flows/web";

import { BasePageObject } from "./basePageObject.js";
import type {
  PageHookOptions,
  PopupHandlerDef,
  RouteInterceptorDef,
} from "./pageHooks.js";
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

/**
 * Names are unique within one source so that `allowPopups` / `allowRoutes`
 * and same-name replacement are unambiguous. Across sources a repeat is
 * deliberate: the flow's hook replaces the declared one.
 */
function assertUniqueHookNames(
  defs: readonly { name: string }[],
  kind: "popup" | "route",
  source: string,
): void {
  const seen = new Set<string>();
  for (const { name } of defs) {
    if (seen.has(name))
      throw Error(`Duplicate ${kind} hook name "${name}" ${source}.`);
    seen.add(name);
  }
}

/**
 * The hooks to install: what the entry point declares, minus what the flow
 * allows through, plus what the flow adds — a flow's hook replacing a
 * declared one of the same name, allowed or not.
 */
function resolveHooks<TDef extends { name: string }>({
  additions,
  allow,
  className,
  declared,
  kind,
}: {
  additions: readonly TDef[];
  allow: string[] | "all" | undefined;
  className: string;
  declared: readonly TDef[];
  kind: "popup" | "route";
}): TDef[] {
  assertUniqueHookNames(declared, kind, `declared on ${className}`);
  assertUniqueHookNames(additions, kind, "passed to initializeBrowser");

  const allowed = new Set(allow === "all" ? [] : (allow ?? []));
  const kept =
    allow === "all" ? [] : declared.filter((def) => !allowed.has(def.name));

  const byName = new Map(kept.map((def) => [def.name, def]));
  for (const def of additions) byName.set(def.name, def);

  return [...byName.values()];
}

/**
 * The `addLocatorHandler` fallback for popups with no `cssSelector`, on one
 * page. In default mode the shield is preferred because `addLocatorHandler`
 * deadlocks when multiple overlays stack — each handler waits for the action
 * pipeline, blocking all locator operations (evaluate, count, screenshot).
 */
async function installLocatorHandlers(
  page: Page,
  defs: readonly PopupHandlerDef[],
): Promise<void> {
  for (const def of defs) {
    await page.addLocatorHandler(def.trigger(page), async () => {
      await def.dismiss(page);
    });
  }
}

export abstract class EntryPointPageObject extends BasePageObject {
  // Concrete entry points define `static async create(options)` as
  // `new this(await this.initializeBrowser(options))`, plus whatever else
  // their first page needs — a `goto`, a sign-in.

  /**
   * Launch a browser and return its first page, with the page hooks installed
   * on the browser context so that every page it produces — the first, a
   * second tab, a popup window the app opens — carries them. Installation
   * precedes the first page, so no navigation can get ahead of the
   * CSS-injection shield.
   *
   * The flow-owned `handler` and `monitor` are one-per-page objects and bind
   * to the first page only.
   */
  protected static async initializeBrowser(
    options: InitializeBrowserOptions = {},
  ): Promise<Page> {
    const {
      allowPopups,
      allowRoutes,
      handler,
      monitor,
      popupHandlers,
      routeInterceptors,
      ...launchOptions
    } = options;

    const popups = resolveHooks({
      additions: popupHandlers ?? [],
      allow: allowPopups,
      className: this.name,
      declared: this.popupHandlers(),
      kind: "popup",
    });
    const routes = resolveHooks({
      additions: routeInterceptors ?? [],
      allow: allowRoutes,
      className: this.name,
      declared: this.routeInterceptors(),
      kind: "route",
    });

    const launchResult = await launch({
      ...launchOptions,
      ...optionalHttpCredentialsFromEnv(),
    });

    if (!("browser" in launchResult))
      throw Error("Expected a browser launch result for QAW platform context.");

    const { context } = launchResult;

    for (const def of routes) await context.route(def.pattern, def.handler);

    // With a flow-owned handler every popup goes through it (below, on the
    // first page) and neither default mechanism is used.
    const cssSelectors = handler
      ? []
      : popups.flatMap((def) =>
          def.cssSelector === undefined ? [] : [def.cssSelector],
        );
    if (cssSelectors.length > 0)
      await context.addInitScript(buildPopupShieldInitScript(cssSelectors));

    const perPage = handler
      ? []
      : popups.filter((def) => def.cssSelector === undefined);

    // Every page the context produces gets the per-page fallbacks. The first
    // page is awaited below; later ones install in the background, where an
    // unhandled rejection — a popup window closed before its hooks landed —
    // must not take the process down.
    const preparing = new WeakMap<Page, Promise<void>>();
    context.on("page", (page) => {
      const prepared = installLocatorHandlers(page, perPage);
      preparing.set(page, prepared);
      prepared.catch(() => undefined);
    });

    const page = await context.newPage();
    await (preparing.get(page) ?? installLocatorHandlers(page, perPage));

    if (handler) {
      handler.install(page);
      for (const def of popups)
        await handler.add(def.name, def.trigger(page), () => def.dismiss(page));
    }

    if (monitor) monitor.install(page);

    return page;
  }

  /**
   * Popups to dismiss on every page of every browser this entry point
   * launches. Override to declare them; extend a parent entry point's with
   * `[...super.popupHandlers(), ...]`. Static because they are installed on
   * the browser context before its first page exists, so they hold no page
   * of their own — see `PopupHandlerDef`. A flow adjusts the declared set
   * through `PageHookOptions`.
   */
  protected static popupHandlers(): PopupHandlerDef[] {
    return [];
  }

  /**
   * Routes to intercept on every page of every browser this entry point
   * launches. Declared and adjusted the same way as `popupHandlers`.
   */
  protected static routeInterceptors(): RouteInterceptorDef[] {
    return [];
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
}

/**
 * How to launch the browser, and how this flow adjusts the entry point's
 * declared page hooks.
 */
export type InitializeBrowserOptions = BrowserLaunchOptions & PageHookOptions;

type BrowserLaunchOptions = {
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
