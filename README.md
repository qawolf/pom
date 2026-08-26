# @qawolf/pom

`@qawolf/pom` is a TypeScript toolkit for building Page Object Models (POMs) on
top of Playwright: base classes for page objects, a registry that constructs
page objects by name and collects their page hooks, and automatic popup and
route-hook installation.

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

A page object can also be built from its registered name, which keeps its
module out of the calling file's import graph until the first construction.

```ts
import { createPage, registerPage } from "@qawolf/pom";

registerPage("LoginPage", () => import("./pages/login-page.js"));

const loginPage = await createPage("LoginPage", page);
```

Inside a page object the same lookup is `await this.create("DashboardPage")`;
annotate the call — `this.create<DashboardPage>("DashboardPage")` — for the
return type when the name is not in `RegisteredPages`. Register the module for
its side effects before constructing anything.

A name that was never registered is resolved through the calling file's own
imports, so page objects can construct each other by name in a workspace with no
registry at all:

```ts
import { BasePageObject } from "@qawolf/pom";

import { DashboardPage } from "../primary/dashboard-page.js";

export class LoginPage extends BasePageObject {
  async signIn(): Promise<DashboardPage> {
    return this.create("DashboardPage");
  }
}
```

The import must be a value import: the specifier is read from the executing
file's source, and compilation erases a type-only import, so on the QA Wolf
runner a `import type` binding leaves nothing to resolve through (the
`require-value-import-for-created-page` lint rule catches this at edit time).
A name that no import binds does not resolve. The module must export the class
under that name.

Registration always takes precedence, and a page resolved this way is not part
of the registry, so its `popupHandlers()` and `routeInterceptors()` are not
collected by `installPageHooks()`.

Register a page object even when nothing constructs it by name if it declares
`popupHandlers()` or `routeInterceptors()` — `installPageHooks()` finds those
by walking the registry, and an unregistered page object's hooks never
install.

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

The core building blocks (`BasePageObject`, `SubPageObject`, the page registry
via `registerPage` and `createPage`, and popup and route hooks) do not call the
QA Wolf platform themselves. They still need `@qawolf/flows` to resolve, because
the package entry point re-exports `EntryPointPageObject` and `NetworkMonitor`,
which import it.

## License

[MIT](LICENSE) © QA Wolf Inc.
