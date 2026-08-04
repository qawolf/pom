# Releasing

`@qawolf/pom` uses **version-driven publishing**: a release happens when the
`version` in [`package.json`](package.json) is higher than the version on npm.
There is no separate "publish" button — merging a version bump to `main` is the
release.

## Cut a release

1. Open a PR that bumps the version:

   ```sh
   npm version patch   # or: minor | major  (updates package.json, no git tag)
   ```

   `npm version` creates a commit by default; include it in your PR. (Pass
   `--no-git-tag-version` if you prefer to stage the bump yourself — the
   workflow creates the tag, so don't push one manually.)

2. Get the PR reviewed and merged to `main`.

3. On merge, [`.github/workflows/release.yml`](.github/workflows/release.yml):
   - builds and tests the package,
   - runs [`scripts/publish.sh`](scripts/publish.sh), which publishes to npm
     only if `package.json`'s version is greater than the published version,
   - on publish, creates the `vX.Y.Z` git tag and a GitHub Release whose notes
     are auto-generated from the PRs merged since the previous tag.

If the version is unchanged, the workflow runs, finds nothing to publish, and
exits cleanly — merging non-release PRs to `main` is safe.

## Release notes

Notes come from GitHub's `--generate-notes`, which lists merged PRs since the
last tag. To improve them, write clear PR titles and use the
[GitHub release-notes categories](https://docs.github.com/en/repositories/releasing-projects-on-github/automatically-generated-release-notes)
via labels if you want grouping.

## Publishing auth (no token)

Publishing uses **npm trusted publishing (OIDC)** — there is no `NPM_TOKEN`
secret. npm is configured to trust this repo's `release.yml` workflow, which
authenticates via GitHub's OIDC identity (`id-token: write`). This also attaches
build provenance automatically. The GitHub Release step uses the built-in
`GITHUB_TOKEN` (`contents: write`); no secret is needed there either.

Provenance ties the tarball to this repository, so npm rejects the publish with
a 422 unless `package.json`'s `repository.url` matches
`https://github.com/qawolf/pom`. Keep that field pointing here.

If publishing ever needs to be re-authorized, manage the trusted publisher on
the package's npmjs settings page.
