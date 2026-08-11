import { describe, expect, it } from "@jest/globals";
import type { Page } from "playwright";

import { BasePageObject } from "./basePageObject.js";
import { registerPage } from "./pageRegistry.js";
import { toKebabCase } from "./siblingPageResolution.js";
import { AnotherPage } from "./testFixtures/another-page.js";

const fakePage = {} as unknown as Page;

describe("[CI] create without register-pages.ts", () => {
  it("constructs an unregistered sibling from the module next to the caller", async () => {
    const somePage = await new AnotherPage(fakePage).doSomething();

    expect(somePage.constructor.name).toBe("SomePage");
    expect(somePage).toBeInstanceOf(BasePageObject);
    expect(somePage.sharedPage).toBe(fakePage);
  });

  it("resolves the sibling once and reuses the class", async () => {
    const anotherPage = new AnotherPage(fakePage);

    const [first, second] = await Promise.all([
      anotherPage.doSomething(),
      anotherPage.doSomething(),
    ]);

    expect(first).not.toBe(second);
    expect(first.constructor).toBe(second.constructor);
  });

  it("prefers a registered page over the sibling module", async () => {
    class RegisteredOverridePage extends BasePageObject {}
    registerPage("OverridePage", RegisteredOverridePage);

    const overridePage = await new AnotherPage(fakePage).createOverride();

    expect(overridePage).toBeInstanceOf(RegisteredOverridePage);
  });

  it("reports the module it looked for when neither a registration nor a sibling exists", async () => {
    const create = new AnotherPage(fakePage).createMissingSibling();

    await expect(create).rejects.toThrow("Unknown page: NoSuchPage");
    await expect(create).rejects.toThrow(
      '"no-such-page.js" or "no-such-page.ts"',
    );
    await expect(create).rejects.toThrow("testFixtures/another-page.ts");
  });
});

describe("[CI] toKebabCase", () => {
  it("maps a page-object class name to its module file name", () => {
    expect(toKebabCase("SomePage")).toBe("some-page");
    expect(toKebabCase("APIKeyPage")).toBe("api-key-page");
    expect(toKebabCase("Dashboard2Page")).toBe("dashboard2-page");
  });
});
