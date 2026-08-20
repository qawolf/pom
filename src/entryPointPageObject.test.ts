import { describe, expect, it, jest } from "@jest/globals";
import type { Browser, Page } from "playwright";

import type { InitializeBrowserOptions } from "./entryPointPageObject.js";

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
