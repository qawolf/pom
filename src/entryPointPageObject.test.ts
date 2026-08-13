import { beforeEach, describe, expect, it } from "@jest/globals";
import type { Locator, Page, Route } from "playwright";

import { BasePageObject } from "./basePageObject.js";
import { EntryPointPageObject } from "./entryPointPageObject.js";
import type {
  PageSetupOptions,
  PopupHandlerDef,
  RouteInterceptorDef,
} from "./pageHooks.js";
import { entries, registerPage } from "./pageRegistry.js";

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

class PlainEntry extends TestEntryPoint {}

// The registry is module-global with no public reset, so each test starts from
// an empty one rather than inheriting registrations from the test above it.
beforeEach(() => {
  for (const name of Object.keys(entries)) delete entries[name];
});

describe("[CI] installPageHooks — entry point contributes its own hooks", () => {
  it("installs hooks the entry point declares while unregistered", async () => {
    const { initScripts, page } = makeFakePage();

    await new EntryWithPopups(page).install();

    expect(initScripts).toHaveLength(1);
    // The shield embeds its selector list via JSON.stringify, so the quotes
    // inside the attribute selector arrive escaped.
    expect(initScripts[0]).toContain("cookieconsent");
  });

  it("installs a registered entry point's own hooks exactly once", async () => {
    // The compatibility case: a workspace that already registers its entry
    // point reaches the same class by both routes. Contributing twice repeats
    // every hook name, which `assertUniqueHookNames` rejects.
    registerPage("EntryWithPopups", EntryWithPopups);
    const { initScripts, page } = makeFakePage();

    await expect(new EntryWithPopups(page).install()).resolves.toBeUndefined();

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
    // Matches how the registry detects overrides: `Object.hasOwn`, so an
    // inherited `popupHandlers()` is not picked up.
    class SubclassedEntry extends EntryWithPopups {}
    const { initScripts, page } = makeFakePage();

    await new SubclassedEntry(page).install();

    expect(initScripts).toHaveLength(0);
  });
});

describe("[CI] installPageHooks — explicit pageHooks contributors", () => {
  it("installs popup hooks from a contributed class with no registry", async () => {
    const { locatorHandlerTriggers, page } = makeFakePage();

    await new PlainEntry(page).install({ pageHooks: [PendoTourPage] });

    // No cssSelector, so this def takes the addLocatorHandler path.
    expect(locatorHandlerTriggers).toEqual([{ name: "pendo-tour" }]);
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

  it("contributes once for a class that is also registered", async () => {
    registerPage("PendoTourPage", PendoTourPage);
    const { locatorHandlerTriggers, page } = makeFakePage();

    await expect(
      new PlainEntry(page).install({ pageHooks: [PendoTourPage] }),
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

  it("merges registry, entry point, and contributed hooks together", async () => {
    registerPage("RouteOnlyPage", RouteOnlyPage);
    const { initScripts, locatorHandlerTriggers, page, routes } =
      makeFakePage();

    await new EntryWithPopups(page).install({ pageHooks: [PendoTourPage] });

    expect(initScripts[0]).toContain("cookieconsent"); // entry point
    expect(locatorHandlerTriggers).toEqual([{ name: "pendo-tour" }]); // contributed
    expect(routes).toEqual(["**/analytics/**"]); // registry
  });

  it("behaves identically to registry-only when pageHooks is omitted", async () => {
    registerPage("PendoTourPage", PendoTourPage);
    const { locatorHandlerTriggers, page } = makeFakePage();

    await new PlainEntry(page).install({});

    expect(locatorHandlerTriggers).toEqual([{ name: "pendo-tour" }]);
  });
});
