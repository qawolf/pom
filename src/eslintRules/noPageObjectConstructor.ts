import { enclosingPageObject } from "./pageObjects.js";
import type { PomLintRule } from "./types.js";

/**
 * A page object declares no constructor.
 *
 * ```ts
 * // Reported
 * constructor(page: Page, private readonly locale: string) {
 *   super(page);
 * }
 *
 * // Expected
 * // nothing: `BasePageObject`'s `(page: Page)` constructor is inherited
 * ```
 *
 * Every way a page object is built -- `createFromPage(page)`,
 * `this.create(Class)`, `this.create("Name")`, `new this(page)` in an entry
 * point's `create` -- calls `new Cls(page)`. A constructor with any other
 * signature cannot be satisfied from those sites, and for the name form the
 * failure is at runtime rather than in `tsc`, because the class is resolved
 * by duck-typing. A constructor that only forwards `page` does nothing; one
 * that stores something is `no-mutable-state-in-page-object`.
 */
export const noPageObjectConstructorRule: PomLintRule = {
  module: {
    create(context) {
      return {
        MethodDefinition(node) {
          if (node.kind !== "constructor") return;
          if (!enclosingPageObject(node)) return;

          context.report({ messageId: "constructor", node });
        },
      };
    },
    meta: {
      messages: {
        constructor:
          "Remove this constructor; the base class's `(page: Page)` is inherited. Page objects are built as `new Cls(page)` by `createFromPage`, `this.create(...)` and an entry point's `create`, so a constructor taking anything else cannot be called from them -- and for `this.create(\"Name\")` that fails on the runner, not in `tsc`. Anything it would store is state a page object does not keep.",
      },
    },
  },

  name: "no-page-object-constructor",

  severity: "error",
};
