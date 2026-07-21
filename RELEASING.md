# Releasing

`@qawolf/pom` is published to npm **when you cut a GitHub Release**. Creating a
Release (tag `vX.Y.Z`) is the trigger; pushing to `main` never publishes.

## Cut a release

1. Bump the version in a PR and merge it to `main`:

   ```sh
   npm version patch   # or: minor | major  (updates package.json)
   ```

   (Pass `--no-git-tag-version` if you don't want the local tag — the GitHub
   Release creates the authoritative tag in the next step.)

2. Create a **GitHub Release** with tag `vX.Y.Z`, where `X.Y.Z` exactly matches
   the version you just merged:

   ```sh
   gh release create v1.2.3 --title v1.2.3 --generate-notes
   ```

   or use the GitHub UI (**Releases → Draft a new release**) and click
   **Generate release notes**. Point the tag at the merged commit on `main`.

3. Publishing the Release triggers
   [`.github/workflows/release.yml`](.github/workflows/release.yml), which:
   - checks out the release tag,
   - verifies `package.json`'s version matches the tag
     ([`scripts/verify-version.sh`](scripts/verify-version.sh)) and fails the
     run if they disagree,
   - builds and tests,
   - publishes to npm via [`scripts/publish.sh`](scripts/publish.sh) (which
     publishes only if the version isn't already on npm, so re-running a Release
     is a safe no-op).

Release notes live on the GitHub Release itself — authored/generated in step 2.

## One-time setup

- **`NPM_TOKEN`** repository secret — an npm **automation** token for an account
  with publish rights to the `@qawolf` scope. Add it under
  _Settings → Secrets and variables → Actions_.
