import { describe, expect, it } from "@jest/globals";
import type { Page } from "playwright";

import { BasePageObject } from "./basePageObject.js";
import { registerPage } from "./pageRegistry.js";

const fakePage = {} as unknown as Page;

class DashboardPage extends BasePageObject {
  get sharedPage() {
    return this.page;
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

  createByName() {
    return this.create<DashboardPage>("RegisteredDashboardPage");
  }
}

describe("[CI] createFromPage", () => {
  it("constructs a page object that declares no constructor of its own", () => {
    const dashboardPage = DashboardPage.createFromPage(fakePage);

    expect(dashboardPage).toBeInstanceOf(DashboardPage);
    expect(dashboardPage.sharedPage).toBe(fakePage);
  });

  it("constructs a page object through its own constructor", () => {
    const dashboardPage = new DashboardPage(fakePage);

    expect(dashboardPage.sharedPage).toBe(fakePage);
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

  it("still resolves a name", async () => {
    registerPage("RegisteredDashboardPage", DashboardPage);

    const dashboardPage = await new HomePage(fakePage).createByName();

    expect(dashboardPage).toBeInstanceOf(DashboardPage);
    expect(dashboardPage.sharedPage).toBe(fakePage);
  });
});
