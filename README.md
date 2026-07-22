# @qawolf/pom

`@qawolf/pom` is a TypeScript toolkit for building Page Object Models (POMs) on
top of Playwright: base classes for page objects, a central registry that lets
page objects construct one another without circular imports, and automatic
popup and route-hook installation.

It is built for and maintained as part of the [QA Wolf](https://www.qawolf.com)
platform, and it is the foundation the POMs in QA Wolf workspaces are generated
against. The core page-object building blocks work with any Playwright setup,
while some features integrate directly with the QA Wolf platform (see
[Platform integration](#platform-integration) below).

To learn more about how to use `@qawolf/pom`, check out the
[API Reference](https://docs.qawolf.com/qawolf/libraries/pom/api-reference/index)
and [Documentation](https://docs.qawolf.com/qawolf/libraries/pom).

## Requirements

- Node.js `>=22.22.0 <25`
- [Playwright](https://playwright.dev) `1.58.2` (peer dependency)

## Install

```sh
npm install @qawolf/pom
```

## Usage

Define a page object by extending `BasePageObject`, keeping selectors in a
private `locators` getter and constructing sibling page objects with
`this.create(...)`.

```ts
import { BasePageObject } from "@qawolf/pom";

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
    return this.create("DashboardPage");
  }
}
```

Register every page object once — importing the registration module for its
side effects before constructing any page object — then build one for a
Playwright `page`.

```ts
import { createPage, registerPage } from "@qawolf/pom";

registerPage("LoginPage", () => import("./pages/login-page.js"));

const loginPage = await createPage("LoginPage", page);
```

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

The core building blocks — `BasePageObject`, `SubPageObject`, the page registry
(`registerPage` / `createPage`), popup and route hooks, and the network monitor
— do not require the QA Wolf platform and can be used with any Playwright
project.

## License

[MIT](LICENSE) © QA Wolf Inc.
