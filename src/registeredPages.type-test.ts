import { expectTypeOf } from "expect-type";
import type { Page } from "playwright";

import { BasePageObject } from "./basePageObject.js";
import { createPage } from "./pageRegistry.js";

// Mirrors the augmentation a workspace's generated `register-pages.ts`
// declares (there against "@qawolf/pom"; here against the source entry
// module, which is the same file after publishing).
declare module "./index.js" {
  // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- module augmentation merges interfaces only
  interface RegisteredPages {
    TypedLoginPage: TypedLoginPage;
  }
}

class TypedLoginPage extends BasePageObject {
  buildGreeting(email: string): string {
    return `hello ${email}`;
  }
}

class ProbePage extends BasePageObject {
  siblingFromMap() {
    return this.create("TypedLoginPage");
  }

  siblingOutsideMap() {
    return this.create("UnknownPage");
  }

  siblingViaExplicitGeneric() {
    return this.create<TypedLoginPage>("UnknownPage");
  }
}

describe("RegisteredPages", () => {
  it("types create() for names in the augmented map", () => {
    expectTypeOf<ReturnType<ProbePage["siblingFromMap"]>>().toEqualTypeOf<
      Promise<TypedLoginPage>
    >();
  });

  it("defaults names outside the map to BasePageObject", () => {
    expectTypeOf<
      Awaited<ReturnType<ProbePage["siblingOutsideMap"]>>
    >().toEqualTypeOf<BasePageObject>();
  });

  it("keeps the pre-map explicit-generic call style working", () => {
    expectTypeOf<
      ReturnType<ProbePage["siblingViaExplicitGeneric"]>
    >().toEqualTypeOf<Promise<TypedLoginPage>>();
  });

  it("types createPage() for names in the augmented map", () => {
    expectTypeOf(
      createPage("TypedLoginPage", undefined as unknown as Page),
    ).toEqualTypeOf<Promise<TypedLoginPage>>();
  });
});
