# @qawolf/pom

`@qawolf/pom` is a TypeScript toolkit for building Page Object Models (POMs) on
top of Playwright: base classes for page objects, construction of sibling page
objects by class or by name, and automatic popup and route-hook installation.

It is built for and maintained as part of the [QA Wolf](https://www.qawolf.com)
platform, and it is the foundation the POMs in QA Wolf workspaces are generated
against. The core page-object building blocks are written against plain
Playwright APIs, while the package as a whole expects the QA Wolf runtime to be
present (see [Platform integration](#platform-integration) below).

To learn more about how to use `@qawolf/pom`, check out the
[API Reference](https://docs.qawolf.com/qawolf/libraries/pom/api-reference/index)
and [Documentation](https://docs.qawolf.com/qawolf/libraries/pom).

## Requirements

- Node.js `>=22.22.0 <25`
- [Playwright](https://playwright.dev) `1.58.2` (peer dependency)
- [`@qawolf/flows`](https://www.npmjs.com/package/@qawolf/flows) `^0.1.4` (peer
  dependency, supplied by the QA Wolf runner)

Both are optional peers, so npm will not install them for you. That is
deliberate for `@qawolf/flows`: a second copy of it on the module path breaks a
run, because Playwright refuses to load twice in one process. The QA Wolf runner
supplies flows at runtime, so a QA Wolf workspace needs nothing here. Outside
one, add `@qawolf/flows` to your own dependencies, or importing `@qawolf/pom`
throws `ERR_MODULE_NOT_FOUND`.

## Install

```sh
npm install @qawolf/pom
```

## Usage

Define a page object by extending `BasePageObject`, keeping selectors in a
private `locators` getter. To hand off to the next page object, import it and
build it from the current Playwright `page`.

```ts
import { BasePageObject } from "@qawolf/pom";

import { DashboardPage } from "./dashboard-page.js";

export class LoginPage extends BasePageObject {
  private get locators() {
    return {
      email: this.page.getByLabel("Email"),
      submit: this.page.getByRole("button", { name: "Sign in" }),
    } as const;
  }

  async signIn(email: string) {
    await this.locators.email.fill(email);
    await this.locators.submit.click();
    return DashboardPage.createFromPage(this.page);
  }
}
```

`dashboard-page.js` may import `login-page.js` back, so two pages that navigate
to each other can both expose the trip. The one shape to avoid is a page object
that `extend`s a class in a file that imports it back — whichever of the two
loads second throws `Cannot access 'X' before initialization`.

### Constructing a sibling

Inside a page object, pass the sibling's class to `create`:

```ts
import { BasePageObject } from "@qawolf/pom";

import { DashboardPage } from "../primary/dashboard-page.js";

export class LoginPage extends BasePageObject {
  async signIn() {
    return this.create(DashboardPage);
  }
}
```

The return type is inferred from the class, so there is no name to repeat and
no annotation to drift from it, and nothing is resolved at runtime. Passing a
type-only import is a compile error, which is the point: the class must be a
value.

### Constructing by name

A page object can also be built from its class name, resolved through the
calling file's own imports:

```ts
import { BasePageObject } from "@qawolf/pom";

import { DashboardPage } from "../primary/dashboard-page.js";

export class LoginPage extends BasePageObject {
  async signIn() {
    return this.create<DashboardPage>("DashboardPage");
  }
}
```

The import must be a value import: the specifier is read from the executing
file's source, and compilation erases a type-only import, so on the QA Wolf
runner an `import type` binding leaves nothing to resolve through (the
`require-value-import-for-created-page` lint rule catches this at edit time).
A name that no import binds does not resolve. The module must export the class
under that name. Annotate the call for a return type more specific than
`BasePageObject` — and note that nothing checks the annotation and the name
agree, which is the other reason to prefer passing the class.

`create` is deliberately `protected` and has no flow-facing counterpart: flow
code never holds a Playwright `Page`, so it cannot construct page objects
directly. A flow gets its first POM from an entry point's static `create()`,
and every subsequent one from methods on POMs it already has.

### Page hooks

An entry point declares the popups to dismiss and the routes to intercept on
every page of every browser it launches. The declarations are static because
they are installed on the browser context before its first page exists, so
each def is built against whichever page it ends up applying to:

```ts
import { EntryPointPageObject } from "@qawolf/pom";
import type { PopupHandlerDef, RouteInterceptorDef } from "@qawolf/pom";

export class LoginPage extends EntryPointPageObject {
  static async create(options?: PageSetupOptions): Promise<LoginPage> {
    const page = await this.initializeBrowser(options);
    return new this(page);
  }

  protected static override popupHandlers(): PopupHandlerDef[] {
    return [
      {
        cssSelector: "#cookie-consent",
        dismiss: (page) => page.locator("#cookie-consent .accept").click(),
        name: "cookie-banner",
        trigger: (page) => page.locator("#cookie-consent"),
      },
    ];
  }

  protected static override routeInterceptors(): RouteInterceptorDef[] {
    return [
      {
        handler: (route) => route.abort(),
        name: "block-analytics",
        pattern: "**/analytics/**",
      },
    ];
  }
}
```

`initializeBrowser()` launches the browser, installs the hooks on its context,
and returns the first page; `create()` adds whatever else the first page needs
— a `goto`, a sign-in. Because the hooks live on the context, a second
tab or a popup window the app opens carries them too. A popup with a
`cssSelector` is hidden by a `<style>` tag injected before any navigation; one
without falls back to `addLocatorHandler` on each page. `super.popupHandlers()`
extends a parent entry point's list. Other page objects declare nothing.

The declared hooks are the default. A flow adjusts them through the options
it passes to `create()`:

```ts
// Test the cookie banner itself, and let analytics through.
await LoginPage.create({ allowPopups: ["cookie-banner"], allowRoutes: "all" });

// Block one more endpoint, in this flow only.
await LoginPage.create({
  routeInterceptors: [
    {
      handler: (route) => route.abort(),
      name: "block-chat",
      pattern: "**/chat/**",
    },
  ],
});
```

`allowPopups` / `allowRoutes` skip declared hooks by name, or all of them with
`"all"`; `popupHandlers` / `routeInterceptors` add the flow's own, a same-named
one replacing the declared one. A flow-owned `PopupHandler` (`handler`) takes
over every popup on the entry point's page, and a flow-owned `NetworkMonitor`
(`monitor`) is installed there; both are one-per-page objects, so they cover
the first page only.

### Migrating from the page registry

`registerPage`, `createPage` and the `RegisteredPages` augmentation are gone.
To move a workspace off `register-pages.ts`:

- Delete `register-pages.ts`, including its `declare module "@qawolf/pom"`
  block, and every import of it.
- Where a page object calls `this.create("Name")`, import the class as a
  value and pass it: `this.create(Name)`. The name form keeps working given a
  value import, but a type-only one no longer resolves anywhere.
- Where a page object declares `popupHandlers()` / `routeInterceptors()`,
  move the declaration onto the entry point as a `static` method. `trigger`
  and `dismiss` now take the `page` they apply to, since the hooks cover
  every page of the browser context, and `installPageHooks()` is gone —
  `initializeBrowser()` installs them.
- Flow code that called `createPage("Name", page)` gets its page objects from
  methods on the entry point instead.

## Platform integration

`@qawolf/pom` is designed to run on the QA Wolf platform, and a few of its
features talk to that platform directly:

- **`EntryPointPageObject`** launches the browser through
  [`@qawolf/flows`](https://www.npmjs.com/package/@qawolf/flows) in a QA Wolf
  run context.
- **Cleanup reporting** (`reportCleanupFailure`) posts cleanup failures to the
  QA Wolf automation API when a run is active.
- **`callPlatformAPI`** calls the QA Wolf platform tRPC API and requires a
  `QAW_TOKEN`.

These features read their configuration from the environment provided by a QA
Wolf run, including:

| Variable                                                                   | Purpose                                                         |
| -------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `QAW_TOKEN`                                                                | Auth token for QA Wolf platform API calls (`callPlatformAPI`).  |
| `DEFAULT_URL`                                                              | Default URL used by `EntryPointPageObject.goto()`.              |
| `AUTH_USERNAME`, `AUTH_PASSWORD`                                           | Optional HTTP basic-auth credentials applied at browser launch. |
| `QAWOLF_RUN_ID`, `QAWOLF_SUITE_ID`, `QAWOLF_TEAM_ID`, `QAWOLF_WORKFLOW_ID` | Run metadata attached to cleanup failure reports.               |

The core building blocks (`BasePageObject`, `SubPageObject`, and popup and
route hooks) do not call the QA Wolf platform themselves. They still need `@qawolf/flows` to resolve, because
the package entry point re-exports `EntryPointPageObject` and `NetworkMonitor`,
which import it.

## License

[MIT](LICENSE) © QA Wolf Inc.
