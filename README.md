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

### Constructing by name

A page object can also be built from its class name, resolved through the
calling file's own imports. A type-only import is enough, so the module stays
out of that file's runtime import graph — which is what lets two page objects
name each other without a cycle:

```ts
import { BasePageObject } from "@qawolf/pom";

import type { DashboardPage } from "../primary/dashboard-page.js";

export class LoginPage extends BasePageObject {
  async signIn(): Promise<DashboardPage> {
    return this.create("DashboardPage");
  }
}
```

The import above is enough, including a type-only one: the specifier is read
from the file's source, not from its runtime module graph. A name that no import
binds falls back to the kebab-cased module beside the caller —
`this.create("DashboardPage")` looking for `./dashboard-page.js`. Either way the
module must export the class under that name.

`create` is deliberately `protected` and has no flow-facing counterpart: flow
code never holds a Playwright `Page`, so it cannot construct page objects
directly. A flow gets its first POM from an entry point's static `create()`,
and every subsequent one from methods on POMs it already has.

### Page hooks

A page object declares the popups it owns with `popupHandlers()`, and the
routes it intercepts with `routeInterceptors()`. The entry point installs them:
its own overrides are picked up automatically, and any other page object
contributes by being named in `pageHooks`.

```ts
import { EntryPointPageObject } from "@qawolf/pom";

import { ActivityLogPage } from "./pages/activity-log-page.js";

export class LoginPage extends EntryPointPageObject {
  static async create(options?: PageSetupOptions): Promise<LoginPage> {
    const page = await this.initializeBrowser(options);
    const entry = new this(page);
    await entry.installPageHooks({ ...options, pageHooks: [ActivityLogPage] });
    return entry;
  }
}
```

A page object whose hooks are neither declared on the entry point nor
contributed through `pageHooks` never installs them — its popups simply stop
being dismissed, with no error. Contributing the same class twice is safe:
classes are deduped by identity.

Only overrides declared directly on a class count. A subclass that merely
inherits `popupHandlers()` contributes nothing.

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

The core building blocks (`BasePageObject`, `SubPageObject`, name-based
construction via `this.create`, and popup and route hooks) do not call the
QA Wolf platform themselves. They still need `@qawolf/flows` to resolve, because
the package entry point re-exports `EntryPointPageObject` and `NetworkMonitor`,
which import it.

## License

[MIT](LICENSE) © QA Wolf Inc.
