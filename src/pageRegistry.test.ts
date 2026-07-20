import { describe, expect, it, jest } from "@jest/globals";
import type { Locator, Page } from "playwright";

import { BasePageObject } from "./basePageObject.js";
import {
  getRegisteredPopupHandlers,
  getRegisteredRouteInterceptors,
} from "./pageHookCollection.js";
import type { PopupHandlerDef, RouteInterceptorDef } from "./pageHooks.js";
import {
  type PomModuleLoader,
  createPage,
  registerPage,
} from "./pageRegistry.js";

// The registry is module-global state with no reset (matching how a
// workspace uses it: one registration pass at import time), so every test
// registers under a unique name instead of clearing shared state.
const fakePage = {} as unknown as Page;

class PlainPage extends BasePageObject {}

class PopupPage extends BasePageObject {
  override popupHandlers(): PopupHandlerDef[] {
    return [
      {
        dismiss: async () => undefined,
        name: "cookie-banner",
        trigger: {} as unknown as Locator,
      },
    ];
  }
}

describe("[CI] registerPage / createPage", () => {
  it("constructs eagerly registered classes", async () => {
    registerPage("EagerPage", PlainPage);
    const instance = await createPage("EagerPage", fakePage);
    expect(instance).toBeInstanceOf(PlainPage);
  });

  it("rejects duplicate registrations", () => {
    registerPage("DuplicatePage", PlainPage);
    expect(() => registerPage("DuplicatePage", PlainPage)).toThrow(
      'Page "DuplicatePage" is already registered.',
    );
  });

  it("throws for unknown pages", async () => {
    await expect(createPage("NeverRegisteredPage", fakePage)).rejects.toThrow(
      "Unknown page: NeverRegisteredPage",
    );
  });

  it("loads lazily registered modules on first use, once", async () => {
    class LazyPage extends BasePageObject {}
    const loader = jest.fn(async () => ({ LazyPage }));
    registerPage("LazyPage", loader);
    expect(loader).not.toHaveBeenCalled();

    const [first, second] = await Promise.all([
      createPage("LazyPage", fakePage),
      createPage("LazyPage", fakePage),
    ]);
    expect(first).toBeInstanceOf(LazyPage);
    expect(second).toBeInstanceOf(LazyPage);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("throws when a providesPageHooks: false entry actually declares hooks", async () => {
    // The flag lied: the class grew a popupHandlers() override but stayed
    // flagged as hookless. Loading it must surface the contradiction rather
    // than silently skipping hook installation.
    registerPage(
      "LyingHookFlagPage",
      async () => ({ LyingHookFlagPage: PopupPage }),
      {
        providesPageHooks: false,
      },
    );
    await expect(createPage("LyingHookFlagPage", fakePage)).rejects.toThrow(
      "was registered with { providesPageHooks: false } but its class declares",
    );
  });

  it("throws at registration when an eager class contradicts providesPageHooks: false", () => {
    expect(() =>
      registerPage("EagerLyingHookFlagPage", PopupPage, {
        providesPageHooks: false,
      }),
    ).toThrow(
      "was registered with { providesPageHooks: false } but its class declares",
    );
  });

  it("retries a lazy load after a transient loader failure", async () => {
    class RecoveringPage extends BasePageObject {}
    const loader = jest
      .fn<() => Promise<{ RecoveringPage: typeof RecoveringPage }>>()
      .mockRejectedValueOnce(Error("transient"))
      .mockResolvedValue({ RecoveringPage });
    registerPage("RecoveringPage", loader);

    await expect(createPage("RecoveringPage", fakePage)).rejects.toThrow(
      "transient",
    );
    // A rejected load is not memoized, so the next call retries and succeeds.
    const instance = await createPage("RecoveringPage", fakePage);
    expect(instance).toBeInstanceOf(RecoveringPage);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("reports a lazy module that does not export the registered name", async () => {
    // providesPageHooks: false keeps this intentionally broken loader out of
    // hook collection, which loads every unflagged lazy entry (the registry
    // is shared module state across the tests in this file).
    registerPage(
      "MisnamedPage",
      // Cast past the compile-time name check: this test drives the runtime
      // guard for loaders whose module shape isn't statically verified.
      (async () => ({ SomethingElse: PlainPage })) as PomModuleLoader,
      { providesPageHooks: false },
    );
    await expect(createPage("MisnamedPage", fakePage)).rejects.toThrow(
      'Lazy registration for page "MisnamedPage" did not resolve to a page-object class',
    );
  });
});

describe("[CI] getRegisteredPopupHandlers", () => {
  it("collects hooks from lazy entries by loading them", async () => {
    class LazyPopupPage extends PopupPage {
      override popupHandlers(): PopupHandlerDef[] {
        return [
          {
            dismiss: async () => undefined,
            name: "lazy-banner",
            trigger: {} as unknown as Locator,
          },
        ];
      }
    }
    registerPage("LazyPopupPage", async () => ({ LazyPopupPage }));

    const groups = await getRegisteredPopupHandlers(fakePage);
    const group = groups.find((entry) => entry.className === "LazyPopupPage");
    expect(group?.defs.map((def) => def.name)).toEqual(["lazy-banner"]);
  });

  it("skips loading lazy entries registered with providesPageHooks: false", async () => {
    const loader = jest.fn(async () => ({ SkippedPage: PlainPage }));
    registerPage("SkippedPage", loader, { providesPageHooks: false });

    await getRegisteredPopupHandlers(fakePage);
    expect(loader).not.toHaveBeenCalled();
  });

  it("detects hook overrides on eager classes via own-property check", async () => {
    registerPage("EagerPopupPage", PopupPage);
    registerPage("EagerPlainPage", PlainPage);

    const groups = await getRegisteredPopupHandlers(fakePage);
    const classNames = groups.map((entry) => entry.className);
    expect(classNames).toContain("EagerPopupPage");
    expect(classNames).not.toContain("EagerPlainPage");
  });
});

describe("[CI] getRegisteredRouteInterceptors", () => {
  it("collects route defs from classes that override routeInterceptors", async () => {
    class RoutePage extends BasePageObject {
      override routeInterceptors(): RouteInterceptorDef[] {
        return [
          {
            handler: async () => undefined,
            name: "block-analytics",
            pattern: "**/analytics/**",
          },
        ];
      }
    }
    registerPage("RoutePage", RoutePage);

    const groups = await getRegisteredRouteInterceptors(fakePage);
    const group = groups.find((entry) => entry.className === "RoutePage");
    expect(group?.defs.map((def) => def.name)).toEqual(["block-analytics"]);
  });

  it("does not report popup-only classes as route bearing", async () => {
    registerPage("PopupOnlyPage", PopupPage);

    const groups = await getRegisteredRouteInterceptors(fakePage);
    expect(groups.map((entry) => entry.className)).not.toContain(
      "PopupOnlyPage",
    );
  });
});
