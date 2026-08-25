import { describe, expect, it } from "@jest/globals";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Page } from "playwright";

import { BasePageObject } from "./basePageObject.js";
import { importedSpecifier } from "./pageModuleResolution.js";
import { createPageForCaller, registerPage } from "./pageRegistry.js";
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

  it("does not resolve a name nothing imports, even a same-named sibling", async () => {
    // A some-page.ts sits right next to the caller, which the removed
    // kebab-case fallback would have found; only an import counts now.
    const create = new AnotherPage(fakePage).goToUnimported();

    await expect(create).rejects.toThrow("Unknown page: SomePage");
    await expect(create).rejects.toThrow("no import that binds it");
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

  it("says the caller lacks an import when an unimported name fails", async () => {
    const create = new AnotherPage(fakePage).createMissingPage();

    await expect(create).rejects.toThrow("Unknown page: NoSuchPage");
    await expect(create).rejects.toThrow("no import that binds it");
    await expect(create).rejects.toThrow("testFixtures/another-page.ts");
  });

  it("reports what it looked for when an import points at a missing module", async () => {
    // Written to a temp file rather than a fixture so tsc never has to
    // typecheck an import of a module that does not exist.
    const directory = await mkdtemp(join(tmpdir(), "pom-resolution-"));
    const callerPath = join(directory, "caller.ts");
    await writeFile(
      callerPath,
      'import { MissingPage } from "./missing-page.js";\n',
    );

    const create = createPageForCaller(
      "MissingPage",
      fakePage,
      pathToFileURL(callerPath).href,
    );

    await expect(create).rejects.toThrow("Unknown page: MissingPage");
    await expect(create).rejects.toThrow(
      '"./missing-page.js", "./missing-page.ts"',
    );
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
