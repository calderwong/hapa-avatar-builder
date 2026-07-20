# Public-safe judge fixture boundary

The judge package is a source package with a deliberately small, empty bootstrap. It does not bundle the operator's local Card library, media library, generated assets, personal corpus, local model weights, P2P secrets, Gate Passes, credentials, or machine-local runtime contents. Some source and provenance documentation retains historical checkout-path examples; those paths do not include the referenced local files.

Four previously machine-local import defaults now resolve to tracked files under `fixtures/build-week/judge-data/`:

- Dear Papa songbook: empty bootstrap only
- Hapa Songs store: empty bootstrap only
- Ballad of Bella packet: withheld placeholder only
- Kanban store: empty three-lane bootstrap only

These files exist so a clean checkout can compile. They do not replace the local-first stores. When the application is launched with its API, the API hydrates operator-owned runtime data from the configured local environment.

The package builder also excludes:

- all of `data/**`, including the explanatory local-store README
- generated media and `artifacts/**`
- the tracked third-party reference images under `public-static/media/`
- the tracked sample reference board under `public-static/sample/`
- prebuilt application bundles

The included `JUDGE_PACKAGE_MANIFEST.json` pins every copied file by SHA-256 and records the claim boundary. `npm run judge:preflight -- --root <package>` verifies the manifest, required fixtures, bundled Overcard dependency, forbidden directories, and obvious secret patterns before release.

This is a judge-access route, not a claim that the application ships with the operator's private Hapa world. The demonstrated product path is evaluated with curated local fixtures and recorded evidence.
