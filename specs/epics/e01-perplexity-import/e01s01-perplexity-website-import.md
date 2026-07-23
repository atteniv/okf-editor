# Story e01s01: Create an OKF bundle from a website

## 1. Identity

- Type: feature
- Risk: P0
- Context: external AI integration

## 2. Intent

Offer an optional Perplexity-powered workflow that researches a supplied website and drafts a source-grounded OKF bundle without changing the existing sample or OpenRouter creation modes.

## 3. User

An OKF author who has a Perplexity API key and wants an editable first draft based on public website information.

## 4. Problem

The current creation flow accepts pasted descriptions but cannot discover or read website material.

## 5. Outcome

The author connects Perplexity, supplies one public website URL, reviews a proposed 4–8 document plan, and creates a valid bundle whose generated documents identify their source URLs.

## 6. Scope

- Perplexity Agent API with `web_search` and `fetch_url`.
- Same-domain research with a maximum of ten fetched URLs per tool call.
- Pinned canonical OKF specification URL.
- Structured plan output and per-document generation.
- OS-keychain credential storage and verification.

## 7. Out of scope

- Exhaustive website mirroring.
- Authenticated, paywalled, or private pages.
- Multiple seed domains.
- Importing images or downloadable assets.
- Silent generation without plan review.

## 8. Requirements

### ADDED: Optional Perplexity integration

The settings dialog stores and verifies a Perplexity API key in the native OS keychain. Existing features remain available without it.

### ADDED: Website creation mode

The New Bundle dialog displays a discoverable website mode. Without a valid/saved key it is disabled and directs the user to Settings.

### ADDED: Grounded planning

The Agent API reads the canonical OKF specification, researches only the supplied website domain, and returns a structured bundle plan with source URLs.

### ADDED: Reviewed generation

No files are written until the user reviews the plan. Approved documents are generated separately and receive deterministic Markdown source links.

### MODIFIED: New-bundle provider choices

**Before:** New bundles use sample files or an OpenRouter-generated plan based on pasted text.

**After:** Those paths remain unchanged and an optional Perplexity website path is added.

## 9. External contract

`POST https://api.perplexity.ai/v1/agent` uses Bearer authentication. The current API accepts `web_search`, `fetch_url` (`max_urls` 1–10), and JSON Schema structured output. API billing is separate from consumer subscriptions.

## 10. Security

The API key never enters the webview. Website content is explicitly treated as untrusted data. Requests use a same-domain search filter, and all returned paths, types, URLs, and output sizes are validated before file creation.

## 11. Privacy

The UI explains that the URL, discovered website content, bundle name, schema, and author instructions are sent to Perplexity under the user's API key.

## 12. Failure behavior

Authentication, billing, unreachable-site, malformed-output, and generation failures leave the dialog open, display an actionable error, and write no partial bundle.

## 13. Data model

Website plans add `siteTitle`, `siteSummary`, `sources`, and per-document `sourceUrls` to the existing planned-document fields.

## 14. Compatibility

The integration is additive. Existing OpenRouter, sample generation, filesystem, and Git flows retain their interfaces and behavior.

## 15. Dependencies

No new frontend package. Rust continues using `reqwest` and `serde_json`; direct URL parsing uses the mature MIT/Apache-compatible `url` crate [OK].

## 16. Observability

Errors include provider status and safe response details but never credentials. The UI reports planning and per-document generation progress.

## 17. Acceptance criteria

1. A Perplexity key can be saved, verified, replaced, and removed.
2. Website mode is discoverable but disabled without the key.
3. Unsafe/malformed plan entries are rejected.
4. The user reviews the proposed documents before generation.
5. Generated documents contain source links and valid OKF paths/frontmatter behavior.
6. Existing tests, lint, typecheck, frontend build, Rust format, clippy, and tests pass.

## 18. Verification

- Unit-test prompt construction and structured-plan parsing.
- Unit-test native Agent API output/error parsing and key allowlisting.
- Manually create a sanitized bundle from a public website with a billed test key.

## 19. Rollback

Removing the additive Perplexity commands, settings section, and website mode restores prior behavior without migrating user bundles. A stale keychain entry is inert.

## 20. Decision

Use Perplexity Agent API directly with a standard research preset. Keep OpenRouter as the existing general-writing provider and Perplexity as the optional website-research provider.
