import { describe, expect, it } from "@jest/globals";
import type { Page } from "playwright";

import { BasePageObject } from "./basePageObject.js";
import { importedSpecifier, toKebabCase } from "./pageModuleResolution.js";
import { registerPage } from "./pageRegistry.js";
import { AnotherPage } from "./testFixtures/another-page.js";
import { NestedPage } from "./testFixtures/nested/nested-page.js";

const fakePage = {} as unknown as Page;

describe("[CI] create without register-pages.ts", () => {
  it("resolves a name through the caller's import, wherever it points", async () => {
    const importedPage = await new AnotherPage(fakePage).goToImported();

    expect(importedPage.constructor.name).toBe("ImportedPage");
    expect(importedPage.sharedPage).toBe(fakePage);
  });

  it("prefers the caller's import over a same-named module beside it", async () => {
    const somePage = await new NestedPage(fakePage).doSomething();

    expect(somePage.origin).toBe("testFixtures/some-page.ts");
  });

  it("falls back to the kebab-cased module beside a name nothing imports", async () => {
    const somePage = await new AnotherPage(fakePage).goToUnimported();

    expect(somePage.constructor.name).toBe("SomePage");
    expect(somePage).toBeInstanceOf(BasePageObject);
  });

  it("resolves once and reuses the class", async () => {
    const anotherPage = new AnotherPage(fakePage);

    const [first, second] = await Promise.all([
      anotherPage.goToImported(),
      anotherPage.goToImported(),
    ]);

    expect(first).not.toBe(second);
    expect(first.constructor).toBe(second.constructor);
  });

  it("prefers a registered page over anything the caller resolves to", async () => {
    class RegisteredOverridePage extends BasePageObject {}
    registerPage("OverridePage", RegisteredOverridePage);

    const overridePage = await new AnotherPage(fakePage).createOverride();

    expect(overridePage).toBeInstanceOf(RegisteredOverridePage);
  });

  it("reports what it looked for when nothing resolves", async () => {
    const create = new AnotherPage(fakePage).createMissingPage();

    await expect(create).rejects.toThrow("Unknown page: NoSuchPage");
    await expect(create).rejects.toThrow(
      '"./no-such-page.js", "./no-such-page.ts"',
    );
    await expect(create).rejects.toThrow("testFixtures/another-page.ts");
  });
});

describe("[CI] importedSpecifier", () => {
  it("finds the specifier that binds a name", () => {
    const source = [
      `import { BasePageObject } from "@qawolf/pom";`,
      `import type { SomePage } from "../primary/some-page.ts";`,
    ].join("\n");

    expect(importedSpecifier("SomePage", source)).toBe(
      "../primary/some-page.ts",
    );
    expect(importedSpecifier("MissingPage", source)).toBeUndefined();
  });

  it("reads inline type modifiers, aliases, defaults, and multi-line lists", () => {
    expect(
      importedSpecifier(
        "AliasedPage",
        `import { AliasedPage as P } from "./a.js";`,
      ),
    ).toBe("./a.js");
    expect(
      importedSpecifier(
        "InlinePage",
        `import { type InlinePage } from "./b.js";`,
      ),
    ).toBe("./b.js");
    expect(
      importedSpecifier("DefaultPage", `import DefaultPage from "./c.js";`),
    ).toBe("./c.js");
    expect(
      importedSpecifier(
        "ListedPage",
        `import type {\n  OtherPage,\n  ListedPage,\n} from "./d.js";`,
      ),
    ).toBe("./d.js");
  });

  it("ignores an aliased binding that is not the imported name", () => {
    const source = `import { OtherPage as SomePage } from "./other-page.js";`;

    expect(importedSpecifier("SomePage", source)).toBeUndefined();
    expect(importedSpecifier("OtherPage", source)).toBe("./other-page.js");
  });

  it("skips a commented-out import but not an indented one", () => {
    expect(
      importedSpecifier("SomePage", `  import { SomePage } from "./a.js";`),
    ).toBe("./a.js");
    expect(
      importedSpecifier("SomePage", `// import { SomePage } from "./a.js";`),
    ).toBeUndefined();
  });

  it("does not run past the end of a side-effect import", () => {
    const source = [
      `import "./register-pages.js";`,
      `import { SomePage } from "./some-page.js";`,
    ].join("\n");

    expect(importedSpecifier("SomePage", source)).toBe("./some-page.js");
  });
});

describe("[CI] toKebabCase", () => {
  it("maps a page-object class name to its module file name", () => {
    expect(toKebabCase("SomePage")).toBe("some-page");
    expect(toKebabCase("APIKeyPage")).toBe("api-key-page");
    expect(toKebabCase("Dashboard2Page")).toBe("dashboard2-page");
  });
});
