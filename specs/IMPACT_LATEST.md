# Impact Analysis: Bundled Sample Bundles

## Target

Add a first-class “Try a sample bundle” flow from `StartScreen`, backed by new
sample catalog/loading code and versioned sample assets. Reuse the existing
platform methods for destination selection, file writes, Git initialization,
commit, and opening the resulting bundle.

## Dependents (4)

- `src/ui/StartScreen.tsx`: gains the sample entry point and dialog state.
- `src/ui/App.css`: gains responsive sample-picker presentation.
- `src/ui/store.ts`: consumed by the dialog to open the copied bundle; no store
  interface change is expected.
- `src/platform/index.ts`: existing `pickFolder`, `gitInit`, `writeDoc`, and
  `gitCommit` methods are reused; no platform interface or Rust command change.

## Affected Stories

No active release-plan epic owns this work. It extends MVP first-run onboarding
and the existing starter-bundle workflow.

## Test Coverage

- `src/ui/StartScreen.test.tsx`: covers splash-page discoverability and opening
  the sample picker.
- New `src/core/samples.test.ts`: will cover catalog integrity, safe asset paths,
  and loading every file in a selected sample.
- New `src/ui/SampleBundleDialog.test.tsx`: will cover creating an editable copy
  through the public UI/platform seam.
- Existing full lint, typecheck, test, build, and Rust CI remain regression gates.

## Risk: Medium

Most code and assets are additive, but the workflow writes a multi-file bundle,
initializes Git, and must work from packaged Tauri assets on macOS and Windows.

## Recommended action

Proceed test-first. Keep packaged samples read-only, always create an editable
copy in a user-selected folder, preserve Apache-2.0 attribution, and avoid new
native commands by loading assets through Vite/Tauri’s bundled frontend.
