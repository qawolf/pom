import { expectTypeOf } from "expect-type";
import type { Page } from "playwright";

import { BasePageObject } from "./basePageObject.js";
import type { ImportedPage } from "./testFixtures/primary/imported-page.js";

const fakePage = {} as unknown as Page;

class DashboardPage extends BasePageObject {
  buildGreeting(email: string): string {
    return `hello ${email}`;
  }
}

class ProbePage extends BasePageObject {
  siblingByName() {
    return this.create("DashboardPage");
  }

  siblingByNameWithGeneric() {
    return this.create<DashboardPage>("DashboardPage");
  }

  siblingViaClass() {
    return this.create(DashboardPage);
  }

  siblingViaClassWithoutWait() {
    return this.create(DashboardPage, { waitForReady: false });
  }

  siblingViaTypeOnlyImport() {
    // @ts-expect-error -- TS1361: a type-only import has no value to construct
    // from, so the mistake that only a cloud run catches in the name form is a
    // compile error here.
    return this.create(ImportedPage);
  }
}

describe("BasePageObject.createFromPage", () => {
  it("resolves to the constructed class", () => {
    expectTypeOf(DashboardPage.createFromPage(fakePage)).toEqualTypeOf<
      Promise<DashboardPage>
    >();
  });

  it("keeps the type when options are passed", () => {
    expectTypeOf(
      DashboardPage.createFromPage(fakePage, { waitForReady: false }),
    ).toEqualTypeOf<Promise<DashboardPage>>();
  });
});

describe("BasePageObject.create", () => {
  it("infers the page type from the class, with no annotation", () => {
    expectTypeOf<ReturnType<ProbePage["siblingViaClass"]>>().toEqualTypeOf<
      Promise<DashboardPage>
    >();
  });

  it("keeps the inferred type when options are passed", () => {
    expectTypeOf<
      ReturnType<ProbePage["siblingViaClassWithoutWait"]>
    >().toEqualTypeOf<Promise<DashboardPage>>();
  });

  it("defaults the name form to BasePageObject", () => {
    expectTypeOf<
      Awaited<ReturnType<ProbePage["siblingByName"]>>
    >().toEqualTypeOf<BasePageObject>();
  });

  it("keeps the explicit-generic name form working", () => {
    expectTypeOf<
      ReturnType<ProbePage["siblingByNameWithGeneric"]>
    >().toEqualTypeOf<Promise<DashboardPage>>();
  });
});
