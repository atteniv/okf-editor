## Target

Optional Perplexity Agent API website-to-OKF import, extending the new-bundle flow, settings, platform seam, native AI boundary, and keychain allowlist.

## Dependents (13 shared-platform callers)

- `src/ui/NewBundleDialog.tsx`: owns sample and AI-assisted bundle creation.
- `src/ui/SettingsDialog.tsx`: owns BYOK integrations and credential verification.
- `src/ui/App.tsx` and `src/ui/store.ts`: expose provider readiness to the UI.
- `src/platform/index.ts` and `src/platform/tauri.ts`: shared native-command contract used throughout the UI.
- `src-tauri/src/lib.rs`, `ai.rs`, and `secrets.rs`: native command registration, network access, and credential custody.

All platform additions are additive; existing callers and OpenRouter behavior must remain unchanged.

## Affected Stories

No release-plan or prior story artifacts exist in this repository. The feature extends the shipped AI-1 new-bundle workflow documented in `docs/PLAN.md`.

## Test Coverage

- `src/core/ai.test.ts`: prompt and AI-output parsing patterns.
- `src/core/starter.test.ts`: generated starter-bundle behavior.
- `src-tauri/src/ai.rs`: native API parsing tests.
- `src-tauri/src/secrets.rs`: key allowlist tests.
- Gap: React dialog behavior has no component-test harness; UI requires manual Tauri verification.
- Gap: live Perplexity behavior requires a user-provided, billed API key and cannot run in CI.

## Risk: High

This is an external, billed AI integration that accepts untrusted website content and extends a shared platform/security boundary, although its APIs are additive and optional.

## Recommended action

Proceed behind an optional keychain-backed integration. Use strict structured-output parsing, same-domain research limits, safe path/type validation, plan review before writes, deterministic source attribution, mocked response fixtures, and a manual live-key acceptance test.
