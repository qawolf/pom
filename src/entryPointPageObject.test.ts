import { describe, expect, it, jest } from "@jest/globals";
import type { Browser, BrowserContext, Locator, Page, Route } from "playwright";

import type { InitializeBrowserOptions } from "./entryPointPageObject.js";
import type { NetworkMonitor } from "./networkMonitor.js";
import type { PopupHandlerDef, RouteInterceptorDef } from "./pageHooks.js";
import { PopupHandler } from "./popupHandler.js";

const launch = jest.fn<(options: unknown) => Promise<unknown>>();

jest.unstable_mockModule("@qawolf/flows/web", () => ({ launch }));

const { EntryPointPageObject } = await import("./entryPointPageObject.js");

function pageWithBrowser(browser: Browser | null): Page {
  return {
    context: () => ({ browser: () => browser }),
  } as unknown as Page;
}

type FakePage = { locatorHandlerTriggers: Locator[]; page: Page };

/**
 * Records what `initializeBrowser` installed, and where. Context-level and
 * page-level installs are distinguished because that split is behaviour a
 * workspace depends on: a `cssSelector` def reaching `addLocatorHandler`
 * would be a regression (it deadlocks when overlays stack), and a hook on the
 * page rather than the context would miss a popup window.
 */
function makeFakeContext() {
  const events: string[] = [];
  const initScripts: string[] = [];
  const listeners: ((page: Page) => void)[] = [];
  const pages: FakePage[] = [];
  const routes: string[] = [];

  /** A page the context produced — the first one, or a window the app opens. */
  function openPage(): FakePage {
    const locatorHandlerTriggers: Locator[] = [];
    const page = {
      async addLocatorHandler(trigger: Locator) {
        locatorHandlerTriggers.push(trigger);
      },
      on() {
        return page;
      },
    } as unknown as Page;
    const record = { locatorHandlerTriggers, page };
    pages.push(record);
    for (const listener of listeners) listener(page);
    return record;
  }

  const context = {
    async addInitScript(script: string) {
      events.push("addInitScript");
      initScripts.push(script);
    },
    async newPage() {
      events.push("newPage");
      return openPage().page;
    },
    on(_event: "page", listener: (page: Page) => void) {
      listeners.push(listener);
    },
    async route(pattern: string) {
      events.push("route");
      routes.push(pattern);
    },
  } as unknown as BrowserContext;

  launch.mockReset();
  launch.mockResolvedValue({ browser: {}, context });

  return { events, initScripts, openPage, pages, routes };
}

function popupDef(name: string, cssSelector?: string): PopupHandlerDef {
  return {
    ...(cssSelector === undefined ? {} : { cssSelector }),
    dismiss: async () => undefined,
    name,
    // Carries the page it was built for, so a test can see the binding.
    trigger: (page: Page) => ({ name, page }) as unknown as Locator,
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

function triggerNames(fakePage: FakePage | undefined): string[] {
  if (!fakePage) throw Error("no page was opened");
  return fakePage.locatorHandlerTriggers.map(
    (trigger) => (trigger as unknown as { name: string }).name,
  );
}

/** The shape every workspace entry point writes. */
class TestEntry extends EntryPointPageObject {
  static async create(options?: InitializeBrowserOptions): Promise<TestEntry> {
    const page = await this.initializeBrowser(options);
    return new this(page);
  }
}

class PlainEntry extends TestEntry {}

class ShopEntry extends TestEntry {
  protected static override popupHandlers(): PopupHandlerDef[] {
    return [
      popupDef("cookie-banner", "#cookie-consent"),
      popupDef("pendo-tour"),
    ];
  }

  protected static override routeInterceptors(): RouteInterceptorDef[] {
    return [routeDef("block-analytics", "**/analytics/**")];
  }
}

class AdminEntry extends ShopEntry {
  protected static override popupHandlers(): PopupHandlerDef[] {
    return [...super.popupHandlers(), popupDef("admin-tip", "#admin-tip")];
  }
}

class TwiceEntry extends TestEntry {
  protected static override popupHandlers(): PopupHandlerDef[] {
    return [popupDef("twice"), popupDef("twice")];
  }
}

describe("[CI] EntryPointPageObject browser lifecycle", () => {
  it("closes the browser that owns its page", async () => {
    const close = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const entry = new PlainEntry(
      pageWithBrowser({ close } as unknown as Browser),
    );

    await entry.closeBrowser();

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("resolves when its page has no owning browser", async () => {
    const entry = new PlainEntry(pageWithBrowser(null));

    await expect(entry.closeBrowser()).resolves.toBeUndefined();
  });

  it("resolves when browser teardown rejects", async () => {
    const close = jest
      .fn<() => Promise<void>>()
      .mockRejectedValue(Error("browser already closed"));
    const entry = new PlainEntry(
      pageWithBrowser({ close } as unknown as Browser),
    );

    await expect(entry.closeBrowser()).resolves.toBeUndefined();
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("[CI] EntryPointPageObject browser launch", () => {
  it("accepts and forwards every Figma entry-point launch option", async () => {
    makeFakeContext();
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

    await PlainEntry.create(options);

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

  it("keeps the hook options out of the launch call", async () => {
    makeFakeContext();

    await ShopEntry.create({
      allowPopups: "all",
      allowRoutes: ["block-analytics"],
      headless: true,
      popupHandlers: [],
      routeInterceptors: [],
    });

    const launched = launch.mock.calls[0]?.[0];
    expect(launched).toEqual(expect.objectContaining({ headless: true }));
    expect(launched).not.toHaveProperty("allowPopups");
    expect(launched).not.toHaveProperty("allowRoutes");
    expect(launched).not.toHaveProperty("popupHandlers");
    expect(launched).not.toHaveProperty("routeInterceptors");
  });

  it("constructs the entry point on the first page", async () => {
    const { pages } = makeFakeContext();

    const entry = await ShopEntry.create();

    expect(entry).toBeInstanceOf(ShopEntry);
    expect(pages).toHaveLength(1);
    expect(entry["page"]).toBe(pages[0]?.page);
  });

  it("installs the hooks on the context before its first page exists", async () => {
    const { events } = makeFakeContext();

    await ShopEntry.create();

    const firstPage = events.indexOf("newPage");
    expect(firstPage).toBeGreaterThan(events.indexOf("addInitScript"));
    expect(firstPage).toBeGreaterThan(events.indexOf("route"));
  });
});

describe("[CI] initializeBrowser — declared hooks", () => {
  it("shields cssSelector popups with one init script on the context", async () => {
    const { initScripts, pages } = makeFakeContext();

    await AdminEntry.create();

    expect(initScripts).toHaveLength(1);
    expect(initScripts[0]).toContain("#cookie-consent");
    expect(initScripts[0]).toContain("#admin-tip");
    // The shield handles these; they must not reach addLocatorHandler.
    expect(triggerNames(pages[0])).toEqual(["pendo-tour"]);
  });

  it("binds a popup without a cssSelector to each page through addLocatorHandler", async () => {
    const { pages } = makeFakeContext();

    await ShopEntry.create();

    expect(pages[0]?.locatorHandlerTriggers).toEqual([
      expect.objectContaining({ name: "pendo-tour", page: pages[0]?.page }),
    ]);
  });

  it("covers a window the app opens later", async () => {
    const { openPage } = makeFakeContext();
    await ShopEntry.create();

    const popupWindow = openPage();

    expect(popupWindow.locatorHandlerTriggers).toEqual([
      expect.objectContaining({ name: "pendo-tour", page: popupWindow.page }),
    ]);
  });

  it("intercepts declared routes on the context", async () => {
    const { routes } = makeFakeContext();

    await ShopEntry.create();

    expect(routes).toEqual(["**/analytics/**"]);
  });

  it("lets a subclass extend its parent's hooks with super", async () => {
    const { initScripts, pages } = makeFakeContext();

    await AdminEntry.create();

    expect(initScripts[0]).toContain("#cookie-consent");
    expect(initScripts[0]).toContain("#admin-tip");
    expect(triggerNames(pages[0])).toEqual(["pendo-tour"]);
  });

  it("installs nothing for an entry point declaring no hooks", async () => {
    const { initScripts, pages, routes } = makeFakeContext();

    await PlainEntry.create();

    expect(initScripts).toHaveLength(0);
    expect(pages[0]?.locatorHandlerTriggers).toHaveLength(0);
    expect(routes).toHaveLength(0);
  });

  it("rejects a name declared twice", async () => {
    makeFakeContext();

    await expect(TwiceEntry.create()).rejects.toThrow(
      'Duplicate popup hook name "twice" declared on TwiceEntry.',
    );
  });
});

describe("[CI] initializeBrowser — a flow's adjustments", () => {
  it("lets a named popup show", async () => {
    const { initScripts, pages } = makeFakeContext();

    await ShopEntry.create({ allowPopups: ["cookie-banner"] });

    expect(initScripts).toHaveLength(0);
    expect(triggerNames(pages[0])).toEqual(["pendo-tour"]);
  });

  it('lets every declared popup show with "all", keeping the flow\'s own', async () => {
    const { initScripts, pages } = makeFakeContext();

    await ShopEntry.create({
      allowPopups: "all",
      popupHandlers: [popupDef("survey")],
    });

    expect(initScripts).toHaveLength(0);
    expect(triggerNames(pages[0])).toEqual(["survey"]);
  });

  it("lets a named request through, or all of them", async () => {
    const byName = makeFakeContext();
    await ShopEntry.create({ allowRoutes: ["block-analytics"] });
    expect(byName.routes).toHaveLength(0);

    const all = makeFakeContext();
    await ShopEntry.create({
      allowRoutes: "all",
      routeInterceptors: [routeDef("block-chat", "**/chat/**")],
    });
    expect(all.routes).toEqual(["**/chat/**"]);
  });

  it("adds the flow's own popups and routes on top of the declared ones", async () => {
    const { pages, routes } = makeFakeContext();

    await ShopEntry.create({
      popupHandlers: [popupDef("survey")],
      routeInterceptors: [routeDef("block-chat", "**/chat/**")],
    });

    expect(triggerNames(pages[0])).toEqual(["pendo-tour", "survey"]);
    expect(routes).toEqual(["**/analytics/**", "**/chat/**"]);
  });

  it("replaces a declared hook with the flow's same-named one", async () => {
    const { initScripts, pages } = makeFakeContext();

    // The declared cookie-banner has a cssSelector; this one does not, so the
    // replacement is visible in which mechanism ends up handling it.
    await ShopEntry.create({ popupHandlers: [popupDef("cookie-banner")] });

    expect(initScripts).toHaveLength(0);
    // A replacement keeps the declared hook's position.
    expect(triggerNames(pages[0])).toEqual(["cookie-banner", "pendo-tour"]);
  });

  it("installs the flow's own hook even when its name is also allowed", async () => {
    const { pages } = makeFakeContext();

    await ShopEntry.create({
      allowPopups: ["cookie-banner"],
      popupHandlers: [popupDef("cookie-banner")],
    });

    expect(triggerNames(pages[0])).toEqual(["pendo-tour", "cookie-banner"]);
  });

  it("rejects a name the flow passes twice", async () => {
    makeFakeContext();

    await expect(
      PlainEntry.create({
        routeInterceptors: [routeDef("x", "**/a"), routeDef("x", "**/b")],
      }),
    ).rejects.toThrow(
      'Duplicate route hook name "x" passed to initializeBrowser.',
    );
  });
});

describe("[CI] initializeBrowser — flow-owned objects", () => {
  it("registers every popup through a flow-owned PopupHandler on the first page", async () => {
    // With a handler supplied, every popup goes through it and the CSS
    // shield stays out of the way — including a def carrying a cssSelector.
    const handler = new PopupHandler("main");
    const { initScripts, pages } = makeFakeContext();

    await ShopEntry.create({ handler, popupHandlers: [popupDef("survey")] });

    expect(handler.registered).toEqual([
      "cookie-banner",
      "pendo-tour",
      "survey",
    ]);
    expect(initScripts).toHaveLength(0);
    expect(pages[0]?.locatorHandlerTriggers).toEqual([
      expect.objectContaining({ name: "cookie-banner", page: pages[0]?.page }),
      expect.objectContaining({ name: "pendo-tour" }),
      expect.objectContaining({ name: "survey" }),
    ]);
  });

  it("does not register an allowed popup through the handler", async () => {
    const handler = new PopupHandler("main");
    makeFakeContext();

    await ShopEntry.create({ allowPopups: "all", handler });

    expect(handler.registered).toHaveLength(0);
  });

  it("installs a flow-owned monitor on the first page", async () => {
    const install = jest.fn<(page: Page) => void>();
    const monitor = { install } as unknown as NetworkMonitor;
    const { pages } = makeFakeContext();

    await ShopEntry.create({ monitor });

    expect(install.mock.calls[0]?.[0]).toBe(pages[0]?.page);
  });

  it("accepts monitor: null, which existing flow code passes explicitly", async () => {
    const { pages } = makeFakeContext();

    await expect(ShopEntry.create({ monitor: null })).resolves.toBeInstanceOf(
      ShopEntry,
    );

    expect(triggerNames(pages[0])).toEqual(["pendo-tour"]);
  });
});
