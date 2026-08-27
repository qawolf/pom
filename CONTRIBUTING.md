# Contributing

## Contribution policy

QA Wolf currently maintains `@qawolf/pom` internally and isn't accepting external pull requests yet. Bug reports and feature requests via [GitHub Issues](https://github.com/qawolf/pom/issues) are very welcome.

## Prerequisites

- [Node.js](https://nodejs.org) `>=22.22.0 <25` (see the `engines` field in `package.json`)
- npm (ships with Node.js)

## Setup

```bash
npm ci
```

## Quality

```bash
npm run tsc:check           # typecheck (tsc --noEmit)
npm run lint                # eslint + prettier --check
npm run lint:fix            # eslint --fix + prettier --write
npm test                    # run all tests
npm run test:watch          # run tests in watch mode
npm run build               # compile to dist/ via tsconfig.build.json
```

Run `npm run lint:fix` after editing files, and make sure `npm run lint`, `npm test`, and `npm run build` all pass — this mirrors what [CI](.github/workflows/ci.yml) runs on every pull request.

## Project structure

```
src/
├── index.ts               # Public entry point and re-exports
├── basePageObject.ts      # BasePageObject — core page-object base class
├── subPageObject.ts       # SubPageObject — page objects scoped to a region
├── entryPointPageObject.ts# EntryPointPageObject — browser launch + hook install (QA Wolf platform)
├── pageHooks.ts           # Popup and route-interceptor hook definitions
├── popupHandler.ts        # Popup dismissal via addLocatorHandler
├── popupShieldInitScript.ts # CSS-injection popup shield init script
├── networkMonitor.ts      # NetworkMonitor — collects network errors
├── platformClient.ts      # callPlatformAPI — QA Wolf platform tRPC client
├── cleanupUtils.ts        # Cleanup-failure reporting to the QA Wolf platform
├── sequence.ts            # SequencePromise type
├── testDataUtilities.ts   # Money/price helpers for test data
└── eslintRules/           # Lint rules for page-object code (./eslint-rules export)
```

The core building blocks (`BasePageObject`, `SubPageObject`, popup/route hooks, and the network monitor) work with any Playwright project. `entryPointPageObject.ts`, `platformClient.ts`, and `cleanupUtils.ts` integrate with the QA Wolf platform — see the README for details.

## Writing a lint rule

Add a file to `src/eslintRules/`, list it in `src/eslintRules/index.ts`, and
cover it with ESLint's `RuleTester`.

### Constraints

A rule may run outside Node, and under either ESLint 8 or 9, so keep it to plain
AST work:

- **No Node built-ins.** No `fs`; use string operations instead of `path`.
- **No APIs that changed between ESLint 8 and 9.** The `eslint` peer range is
  `>=8.40.0`.
- **No `playwright` or `@qawolf/flows`.** Both are optional peer dependencies.
- **No imports from outside `src/eslintRules/`.** The rest of the package is not
  written to these constraints, so a single `../index.js` pulls all of it into
  your rule.
- **No autofixes.** Describe the fix in the message instead.

All but the last are enforced by an `.eslintrc.cjs` override, so breaking one is
a lint error rather than a surprise later.

### Which files should the rule check?

A rule sees every file in a workspace, so it has to recognise its own subject —
and it is usually better to do that from the code than from the file path.

Paths are not dependable. Most page objects sit in a `pages/` directory, but not
all of them: an entry point often lives elsewhere, and layouts differ between
workspaces. The class declaration is the more stable signal:

```ts
export class SignInPage extends BasePageObject { ... }
```

So check the superclass: `BasePageObject`, `EntryPointPageObject` or
`SubPageObject`. It is right there in the AST and needs no type information.
`no-inline-locator-in-page-object` is the worked example, and it handles the
variations you would expect — `abstract class`, `export default class`, and the
generic `extends SubPageObject<Parent>`.

**Where this approach stops.** A page object that extends _another page object_
names neither base class, so a superclass check does not match it:

```ts
export class AdminLoginPage extends LoginPage { ... } // not matched
```

Following that chain means resolving an import, which needs type information a
rule does not have. Every page object in the workspaces checked so far extends a
base class directly, so this is a known blind spot rather than a common one — but
say so in the rule rather than implying full coverage.

One thing to watch. A rule that recognises nothing reports nothing, which looks
exactly like a rule that found no problems. So add a `RuleTester` case for a file
your rule should _not_ touch, then break the check on purpose and confirm that
case fails.

## Releasing

See [RELEASING.md](RELEASING.md). Releases are version-driven: bump the version in `package.json` in a PR, and merging to `main` publishes to npm.
