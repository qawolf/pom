import { describe, expect, it } from "@jest/globals";
import type { Page } from "playwright";

import { BasePageObject } from "./basePageObject.js";

const fakePage = {} as unknown as Page;

class DashboardPage extends BasePageObject {
  get sharedPage() {
    return this.page;
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
