import { expectTypeOf } from "expect-type";
import type { Page } from "playwright";

import { EntryPointPageObject } from "./entryPointPageObject.js";
import type { PageSetupOptions } from "./pageHooks.js";

/** The shape every workspace entry point writes. */
class ShopEntry extends EntryPointPageObject {
  static async create(options?: PageSetupOptions): Promise<ShopEntry> {
    const page = await this.initializeBrowser(options);
    return new this(page);
  }
}

/** Extra options of its own, forwarded on to `initializeBrowser`. */
class SignedInEntry extends EntryPointPageObject {
  static async create(
    options?: PageSetupOptions & { username?: string },
  ): Promise<SignedInEntry> {
    const page = await this.initializeBrowser(options);
    return new this(page);
  }
}

describe("EntryPointPageObject", () => {
  it("types the create() pattern", () => {
    expectTypeOf(ShopEntry.create()).toEqualTypeOf<Promise<ShopEntry>>();
    expectTypeOf(
      ShopEntry.create({ allowPopups: "all", headless: true, url: "/" }),
    ).toEqualTypeOf<Promise<ShopEntry>>();
    expectTypeOf(SignedInEntry.create({ username: "erice" })).toEqualTypeOf<
      Promise<SignedInEntry>
    >();
  });

  it("returns a Page from initializeBrowser", () => {
    class Probe extends EntryPointPageObject {
      static launch() {
        return this.initializeBrowser({ allowRoutes: ["block-analytics"] });
      }
    }

    expectTypeOf(Probe.launch()).toEqualTypeOf<Promise<Page>>();
  });
});
