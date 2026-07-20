# @qawolf/pom

`@qawolf/pom` is a TypeScript toolkit for building Page Object Models (POMs) on
top of Playwright: base classes for page objects, a central registry that lets
page objects construct one another without circular imports, and automatic
popup and route-hook installation.

To learn more about how to use `@qawolf/pom`, check out the
[API Reference](https://docs.qawolf.com/qawolf/libraries/pom/api-reference/index)
and [Documentation](https://docs.qawolf.com/qawolf/libraries/pom).

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
