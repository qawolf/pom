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
npm run lint:circular       # fail on circular imports
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
├── pageRegistry.ts        # registerPage / createPage and the typed registry
├── pageHooks.ts           # Popup and route-interceptor hook definitions
├── pageHookCollection.ts  # Collects hooks contributed by registered page objects
├── popupHandler.ts        # Popup dismissal via addLocatorHandler
├── popupShieldInitScript.ts # CSS-injection popup shield init script
├── networkMonitor.ts      # NetworkMonitor — collects network errors
├── platformClient.ts      # callPlatformAPI — QA Wolf platform tRPC client
├── cleanupUtils.ts        # Cleanup-failure reporting to the QA Wolf platform
├── sequence.ts            # SequencePromise type
└── testDataUtilities.ts   # Money/price helpers for test data
```

The core building blocks (`BasePageObject`, `SubPageObject`, the page registry, popup/route hooks, and the network monitor) work with any Playwright project. `entryPointPageObject.ts`, `platformClient.ts`, and `cleanupUtils.ts` integrate with the QA Wolf platform — see the README for details.

## Releasing

See [RELEASING.md](RELEASING.md). Releases are version-driven: bump the version in `package.json` in a PR, and merging to `main` publishes to npm.
