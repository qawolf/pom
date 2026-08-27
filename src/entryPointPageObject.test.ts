import { describe, expect, it, jest } from "@jest/globals";
import type { Browser, Locator, Page, Route } from "playwright";

import { BasePageObject } from "./basePageObject.js";
import type { InitializeBrowserOptions } from "./entryPointPageObject.js";
import type { NetworkMonitor } from "./networkMonitor.js";
import type {
  PageSetupOptions,
  PopupHandlerDef,
  RouteInterceptorDef,
} from "./pageHooks.js";
import { PopupHandler } from "./popupHandler.js";

const launch = jest.fn<(options: unknown) => Promise<unknown>>();

jest.unstable_mockModule("@qawolf/flows/web", () => ({ launch }));

const { EntryPointPageObject } = await import("./entryPointPageObject.js");

class TestEntryPointPageObject extends EntryPointPageObject {
  static async launchBrowser(options: InitializeBrowserOptions): Promise<Page> {
    return this.initializeBrowser(options);
  }
}

function pageWithBrowser(browser: Browser | null): Page {
  return {
    context: () => ({ browser: () => browser }),
  } as unknown as Page;
}

describe("[CI] EntryPointPageObject browser lifecycle", () => {
  it("closes the browser that owns its page", async () => {
    const close = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const entry = new TestEntryPointPageObject(
      pageWithBrowser({ close } as unknown as Browser),
    );

    await entry.closeBrowser();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("resolves when its page has no owning browser", async () => {
    const entry = new TestEntryPointPageObject(pageWithBrowser(null));

    await expect(entry.closeBrowser()).resolves.toBeUndefined();
  });

  it("resolves when browser teardown rejects", async () => {
    const close = jest
      .fn<() => Promise<void>>()
      .mockRejectedValue(Error("browser already closed"));
    const entry = new TestEntryPointPageObject(
      pageWithBrowser({ close } as unknown as Browser),
    );

    await expect(entry.closeBrowser()).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("[CI] EntryPointPageObject browser launch", () => {
  it("accepts and forwards every Figma entry-point launch option", async () => {
    const page = {} as Page;
    const newPage = jest.fn(() => page);
    launch.mockResolvedValue({ browser: {}, context: { newPage } });
    const options: InitializeBrowserOptions = {
      args: ["--use-fake-device-for-media-stream"],
      browser: "firefox",
      channel: "chrome",
      extraHTTPHeaders: { "app-shell": "true" },
      headless: false,
      storageState: "/tmp/preauthorized.json",
      viewport: null,
    };
    const compatibleBrowserEngines: NonNullable<
      InitializeBrowserOptions["browser"]
    >[] = ["chrome", "chromium", "firefox", "msedge", "webkit"];

    await expect(TestEntryPointPageObject.launchBrowser(options)).resolves.toBe(
      page,
    );

    expect(compatibleBrowserEngines).toContain(options.browser);
    expect(launch).toHaveBeenCalledWith(
      expect.objectContaining({
        args: ["--use-fake-device-for-media-stream"],
        browser: "firefox",
        channel: "chrome",
        extraHTTPHeaders: { "app-shell": "true" },
        headless: false,
        storageState: "/tmp/preauthorized.json",
        viewport: null,
      }),
    );
  });
});

/**
 * Records what `installPageHooks` installed. The shield path and the
 * `addLocatorHandler` path are distinguished because which one a def takes is
 * behaviour a workspace depends on: `addLocatorHandler` deadlocks when
 * overlays stack, so a `cssSelector` def reaching it would be a regression.
 */
function makeFakePage(): {
  initScripts: string[];
  locatorHandlerTriggers: Locator[];
  page: Page;
  routes: string[];
} {
  const initScripts: string[] = [];
  const locatorHandlerTriggers: Locator[] = [];
  const routes: string[] = [];
  const page = {
    async addInitScript(script: string) {
      initScripts.push(script);
    },
    async addLocatorHandler(trigger: Locator) {
      locatorHandlerTriggers.push(trigger);
    },
    async route(pattern: string) {
      routes.push(pattern);
    },
  } as unknown as Page;

  return { initScripts, locatorHandlerTriggers, page, routes };
}

function popupDef(name: string, cssSelector?: string): PopupHandlerDef {
  return {
    ...(cssSelector === undefined ? {} : { cssSelector }),
    dismiss: async () => undefined,
    name,
    trigger: { name } as unknown as Locator,
  };
}

function routeDef(name: string, pattern: string): RouteInterceptorDef {
  return {
    async handler(route: Route) {
      await route.fallback();
    },
    name,
    pattern,
  };
}

/** A non-entry POM that owns a popup — the `pageHooks` contributor case. */
class PendoTourPage extends BasePageObject {
  override popupHandlers(): PopupHandlerDef[] {
    return [popupDef("pendo-tour")];
  }
}

class RouteOnlyPage extends BasePageObject {
  override routeInterceptors(): RouteInterceptorDef[] {
    return [routeDef("block-analytics", "**/analytics/**")];
  }
}

class NoHooksPage extends BasePageObject {}

/** Exposes the protected `installPageHooks` and skips `initializeBrowser`. */
class TestEntryPoint extends EntryPointPageObject {
  async install(options?: PageSetupOptions): Promise<void> {
    await this.installPageHooks(options);
  }
}

class PlainEntry extends TestEntryPoint {}

class EntryWithPopups extends TestEntryPoint {
  override popupHandlers(): PopupHandlerDef[] {
    return [popupDef("cookie-banner", '[aria-label="cookieconsent"]')];
  }
}

class EntryWithRoutes extends TestEntryPoint {
  override routeInterceptors(): RouteInterceptorDef[] {
    return [routeDef("stub-config", "**/config.json")];
  }
}

describe("[CI] installPageHooks — contributed classes", () => {
  it("binds a contributed class to the entry point's page", async () => {
    // Classes rather than instances, so the package — not the workspace —
    // decides which page a contributor's defs are read against.
    const boundPages: Page[] = [];
    class PageRecordingPage extends BasePageObject {
      override popupHandlers(): PopupHandlerDef[] {
        boundPages.push(this.page);
        return [popupDef("recorded")];
      }
    }
    const { page } = makeFakePage();

    await new PlainEntry(page).install({ pageHooks: [PageRecordingPage] });

    expect(boundPages).toEqual([page]);
  });

  it("installs route hooks from a contributed class", async () => {
    const { page, routes } = makeFakePage();

    await new PlainEntry(page).install({ pageHooks: [RouteOnlyPage] });

    expect(routes).toEqual(["**/analytics/**"]);
  });

  it("routes a contributed cssSelector def into the shield, not addLocatorHandler", async () => {
    class ShieldedPage extends BasePageObject {
      override popupHandlers(): PopupHandlerDef[] {
        return [popupDef("intercom", "#intercom-container")];
      }
    }
    const { initScripts, locatorHandlerTriggers, page } = makeFakePage();

    await new PlainEntry(page).install({ pageHooks: [ShieldedPage] });

    expect(initScripts).toHaveLength(1);
    expect(initScripts[0]).toContain("#intercom-container");
    expect(locatorHandlerTriggers).toHaveLength(0);
  });

  it("contributes once for a class listed twice", async () => {
    // Contributing twice repeats every hook name, which
    // `assertUniqueHookNames` would reject; dedupe is by class identity.
    const { locatorHandlerTriggers, page } = makeFakePage();

    await expect(
      new PlainEntry(page).install({
        pageHooks: [PendoTourPage, PendoTourPage],
      }),
    ).resolves.toBeUndefined();

    expect(locatorHandlerTriggers).toHaveLength(1);
  });

  it("ignores a contributed class that declares no hooks", async () => {
    const { initScripts, locatorHandlerTriggers, page, routes } =
      makeFakePage();

    await new PlainEntry(page).install({ pageHooks: [NoHooksPage] });

    expect(initScripts).toHaveLength(0);
    expect(locatorHandlerTriggers).toHaveLength(0);
    expect(routes).toHaveLength(0);
  });
});

describe("[CI] installPageHooks — entry point contributes its own hooks", () => {
  it("installs hooks the entry point declares on itself", async () => {
    const { initScripts, page } = makeFakePage();

    await new EntryWithPopups(page).install();

    expect(initScripts).toHaveLength(1);
    // The shield embeds its selector list via JSON.stringify, so the quotes
    // inside the attribute selector arrive escaped.
    expect(initScripts[0]).toContain("cookieconsent");
  });

  it("installs the entry point's own hooks once when it is also in pageHooks", async () => {
    // The same class reached by both routes must not contribute twice.
    const { initScripts, page } = makeFakePage();

    await expect(
      new EntryWithPopups(page).install({ pageHooks: [EntryWithPopups] }),
    ).resolves.toBeUndefined();

    expect(initScripts).toHaveLength(1);
  });

  it("installs route interceptors the entry point declares", async () => {
    const { page, routes } = makeFakePage();

    await new EntryWithRoutes(page).install();

    expect(routes).toEqual(["**/config.json"]);
  });

  it("contributes nothing for an entry point declaring no hooks", async () => {
    const { initScripts, locatorHandlerTriggers, page, routes } =
      makeFakePage();

    await new PlainEntry(page).install();

    expect(initScripts).toHaveLength(0);
    expect(locatorHandlerTriggers).toHaveLength(0);
    expect(routes).toHaveLength(0);
  });

  it("does not contribute hooks a subclass merely inherits", async () => {
    // Overrides are detected with `Object.hasOwn`, so an inherited
    // `popupHandlers()` is not picked up.
    class SubclassedEntry extends EntryWithPopups {}
    const { initScripts, page } = makeFakePage();

    await new SubclassedEntry(page).install();

    expect(initScripts).toHaveLength(0);
  });
});

describe("[CI] installPageHooks — explicit pageHooks contributors", () => {
  it("installs popup hooks from a contributed class", async () => {
    const { locatorHandlerTriggers, page } = makeFakePage();

    await new PlainEntry(page).install({ pageHooks: [PendoTourPage] });

    // No cssSelector, so this def takes the addLocatorHandler path.
    expect(locatorHandlerTriggers).toEqual([{ name: "pendo-tour" }]);
  });
});

describe("[CI] installPageHooks — skips, collisions and flow-owned objects", () => {
  it("skips a contributed popup named in allowPopups", async () => {
    const { locatorHandlerTriggers, page } = makeFakePage();

    await new PlainEntry(page).install({
      allowPopups: ["pendo-tour"],
      pageHooks: [PendoTourPage],
    });

    expect(locatorHandlerTriggers).toHaveLength(0);
  });

  it("skips a contributed route named in allowRoutes", async () => {
    const { page, routes } = makeFakePage();

    await new PlainEntry(page).install({
      allowRoutes: ["block-analytics"],
      pageHooks: [RouteOnlyPage],
    });

    expect(routes).toHaveLength(0);
  });

  it("still rejects two contributors sharing a hook name", async () => {
    class RivalPendoPage extends BasePageObject {
      override popupHandlers(): PopupHandlerDef[] {
        return [popupDef("pendo-tour")];
      }
    }
    const { page } = makeFakePage();

    await expect(
      new PlainEntry(page).install({
        pageHooks: [PendoTourPage, RivalPendoPage],
      }),
    ).rejects.toThrow(
      'Duplicate popup hook name "pendo-tour" registered by both PendoTourPage and RivalPendoPage',
    );
  });

  it("rejects a contributor colliding with the entry point's own hook", async () => {
    class RivalCookiePage extends BasePageObject {
      override popupHandlers(): PopupHandlerDef[] {
        return [popupDef("cookie-banner")];
      }
    }
    const { page } = makeFakePage();

    await expect(
      new EntryWithPopups(page).install({ pageHooks: [RivalCookiePage] }),
    ).rejects.toThrow('Duplicate popup hook name "cookie-banner"');
  });

  it("merges the entry point's own hooks with contributed ones", async () => {
    const { initScripts, locatorHandlerTriggers, page, routes } =
      makeFakePage();

    await new EntryWithPopups(page).install({
      pageHooks: [PendoTourPage, RouteOnlyPage],
    });

    expect(initScripts[0]).toContain("cookieconsent"); // entry point
    expect(locatorHandlerTriggers).toEqual([{ name: "pendo-tour" }]); // contributed
    expect(routes).toEqual(["**/analytics/**"]); // contributed
  });

  it("registers contributed popups through a flow-owned PopupHandler", async () => {
    // With a handler supplied, every popup goes through it and the CSS
    // shield stays out of the way — including a def carrying a cssSelector.
    const handler = new PopupHandler("main");
    const { initScripts, page } = makeFakePage();

    await new EntryWithPopups(page).install({
      handler,
      pageHooks: [PendoTourPage],
    });

    expect(handler.registered).toEqual(["cookie-banner", "pendo-tour"]);
    expect(initScripts).toHaveLength(0);
  });

  it("does not register an allowPopups popup through the handler", async () => {
    const handler = new PopupHandler("main");
    const { page } = makeFakePage();

    await new PlainEntry(page).install({
      allowPopups: ["pendo-tour"],
      handler,
      pageHooks: [PendoTourPage],
    });

    expect(handler.registered).toHaveLength(0);
  });

  it("installs a flow-owned monitor on the entry point's page", async () => {
    const install = jest.fn<(page: Page) => void>();
    const monitor = { install } as unknown as NetworkMonitor;
    const { page } = makeFakePage();

    await new PlainEntry(page).install({ monitor, pageHooks: [PendoTourPage] });

    expect(install).toHaveBeenCalledWith(page);
  });

  it("accepts monitor: null, which existing flow code passes explicitly", async () => {
    const { locatorHandlerTriggers, page } = makeFakePage();

    await expect(
      new PlainEntry(page).install({
        monitor: null,
        pageHooks: [PendoTourPage],
      }),
    ).resolves.toBeUndefined();

    expect(locatorHandlerTriggers).toHaveLength(1);
  });
});
