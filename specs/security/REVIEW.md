# Security Review

- **Branch:** `feat/perplexity-website-import`
- **Baseline:** `origin/main` (`f0123d1`)
- **Scope:** committed branch diff plus the pending CodeMirror diagnostic-refresh fix
- **Reviewed:** 2026-07-23
- **Security-sensitive diff SHA-256:** `33b9cfa33a9f3c112f021ccd8034d968b6abd735565b9f62641ad37b74e52c07`
- **Verdict:** PASS

## Trust boundaries reviewed

1. Website URL and author instructions crossing from the webview into the Rust Perplexity client.
2. Perplexity-generated JSON crossing back into the application and becoming bundle paths, document types, source URLs, and Markdown.
3. Perplexity API credentials crossing from the OS keychain into authenticated Rust HTTP requests.
4. Generated relative paths crossing into the existing root-confined filesystem command boundary.
5. Externally recomputed diagnostics crossing into CodeMirror presentation state.

## Assessment

- The Rust client accepts only HTTP(S) URLs without embedded credentials, rejects localhost/private literal IP targets, fixes the API origin to `https://api.perplexity.ai/v1`, limits request size, and applies bounded request/tool settings.
- The webview never receives the Perplexity key. Secret names remain allowlisted, and authenticated requests consume the key only inside Rust.
- Agent-produced plans are parsed as JSON and rejected unless document counts, known schema types, unique safe relative Markdown paths, same-site source URLs, and a required root `index.md` are present.
- Generated paths are additionally confined by `fs::resolve_in_root`, which rejects absolute/parent paths and canonicalizes the deepest existing ancestor to block symlink escapes.
- React renders agent and website text through normal JSX; no `dangerouslySetInnerHTML`, `innerHTML`, shell execution, SQL construction, unsafe deserialization, or dynamic code evaluation was introduced.
- Retrieved website instructions are explicitly treated as untrusted data in both planning and drafting prompts. Prompt injection is not classified as a code vulnerability under the review policy, but the implementation still includes a defense-in-depth instruction boundary.
- The diagnostic refresh change dispatches a typed CodeMirror state effect and calls `forceLinting`; it introduces no new input-to-security-sensitive sink.
- Secret-pattern scanning found no credentials, private keys, or provider tokens in the branch diff.

## Findings

No findings met the reporting threshold of confidence ≥ 8/10. No unresolved HIGH findings exist.

## Verification evidence

- `pnpm test`: 118 passed
- `pnpm typecheck`: passed
- `pnpm lint`: passed
- `pnpm build`: passed
- `cargo fmt --check`: passed
- `cargo clippy --all-targets --all-features -- -D warnings`: passed
- `cargo test`: 31 passed, 1 ignored platform-keychain integration test
- `pnpm audit --prod`: no known vulnerabilities
