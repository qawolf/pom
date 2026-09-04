import { beforeEach, describe, expect, it } from "@jest/globals";
import type { Page } from "playwright";

import { BasePageObject, createPageForCaller } from "./basePageObject.js";
import { ImportedPage } from "./testFixtures/primary/imported-page.js";
import { SlowPage } from "./testFixtures/slow-page.js";

const fakePage = {} as unknown as Page;

class DashboardPage extends BasePageObject {
  get sharedPage() {
    return this.page;
  }
}

class SlowHomePage extends BasePageObject {
  createSlowByClass(options?: { waitForReady?: boolean }) {
    return this.create(SlowPage, options);
  }
}

/**
 * Neither registered nor imported by name anywhere, so a `create` that went
 * through name resolution would reject with `Unknown page` -- a successful
 * construction proves the class form never consults it.
 */
class UnresolvablePage extends BasePageObject {
  get sharedPage() {
    return this.page;
  }
}

class HomePage extends BasePageObject {
  createByClass() {
    return this.create(UnresolvablePage);
  }

  /** Resolved through this test file's own value import of the class. */
  createByName() {
    return this.create<ImportedPage>("ImportedPage");
  }
}

/** Whether `promise` has settled by the next macrotask. */
async function hasSettled(promise: Promise<unknown>): Promise<boolean> {
  const pending = Symbol("pending");
  const timeout = new Promise<typeof pending>((resolve) => {
    setTimeout(() => resolve(pending), 0);
  });
  return (await Promise.race([promise, timeout])) !== pending;
}

beforeEach(() => {
  SlowPage.reset();
});

describe("[CI] createFromPage", () => {
  it("constructs a page object that declares no constructor of its own", async () => {
    const dashboardPage = await DashboardPage.createFromPage(fakePage);

    expect(dashboardPage).toBeInstanceOf(DashboardPage);
    expect(dashboardPage.sharedPage).toBe(fakePage);
  });

  it("constructs a page object through its own constructor", () => {
    const dashboardPage = new DashboardPage(fakePage);

    expect(dashboardPage.sharedPage).toBe(fakePage);
  });

  it("resolves only once waitForReady has", async () => {
    const creating = SlowPage.createFromPage(fakePage);

    expect(SlowPage.waits).toBe(1);
    expect(await hasSettled(creating)).toBe(false);

    SlowPage.settle();

    expect(await creating).toBeInstanceOf(SlowPage);
  });

  it("skips waitForReady when told to", async () => {
    const slowPage = await SlowPage.createFromPage(fakePage, {
      waitForReady: false,
    });

    expect(slowPage).toBeInstanceOf(SlowPage);
    expect(SlowPage.waits).toBe(0);
  });
});

describe("[CI] create", () => {
  it("constructs a class directly, without resolving it by name", async () => {
    const created = new HomePage(fakePage).createByClass();

    // Kept promise-returning so the two forms are drop-in for each other.
    expect(created).toBeInstanceOf(Promise);

    const unresolvablePage = await created;
    expect(unresolvablePage).toBeInstanceOf(UnresolvablePage);
    expect(unresolvablePage.sharedPage).toBe(fakePage);
  });

  it("still resolves a name through the caller's imports", async () => {
    const importedPage = await new HomePage(fakePage).createByName();

    expect(importedPage).toBeInstanceOf(ImportedPage);
    expect(importedPage.sharedPage).toBe(fakePage);
  });

  it("awaits the sibling's waitForReady in the class form", async () => {
    const creating = new SlowHomePage(fakePage).createSlowByClass();

    expect(SlowPage.waits).toBe(1);
    expect(await hasSettled(creating)).toBe(false);

    SlowPage.settle();

    expect(await creating).toBeInstanceOf(SlowPage);
  });

  it("awaits the sibling's waitForReady in the name form", async () => {
    // Resolved through this file's value import of `SlowPage`, so the
    // construction goes through the resolved class's `createFromPage`.
    const creating = createPageForCaller({
      callerUrl: import.meta.url,
      name: "SlowPage",
      page: fakePage,
    });
    // Name resolution imports the module first, so the wait starts a tick
    // later than the class form's.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(SlowPage.waits).toBe(1);
    expect(await hasSettled(creating)).toBe(false);

    SlowPage.settle();

    expect(await creating).toBeInstanceOf(SlowPage);
  });

  it("skips waitForReady when told to", async () => {
    const slowPage = await new SlowHomePage(fakePage).createSlowByClass({
      waitForReady: false,
    });

    expect(slowPage).toBeInstanceOf(SlowPage);
    expect(SlowPage.waits).toBe(0);
  });
});
