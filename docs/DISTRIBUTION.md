# Distribution: signing, notarization, and (optionally) the app stores

This is the walkthrough for getting the OKF Editor into users' hands with a
verified publisher identity and the fewest practical OS warnings. It covers
account enrollment, certificate procurement, CI
wiring, and — as an optional extension — submission to the Mac App Store and
Microsoft Store. Written for someone doing this for the first time.

> **Read this first — "certified" means two different things:**
>
> 1. **Code signing + notarization** — proving to macOS/Windows that the app
>    comes from a known publisher and hasn't been tampered with. On macOS,
>    signing plus notarization removes the unidentified-developer warning. On
>    Windows, signing names the publisher immediately, but SmartScreen can still
>    warn until the certificate or artifact gains reputation. This works for apps
>    distributed **anywhere** (our plan: GitHub Releases). **This is what v0.1.0
>    requires** ([PLAN.md](PLAN.md) §M3) and what Parts 1–2 cover.
> 2. **App store listing** — additionally submitting the app to Apple's Mac
>    App Store or the Microsoft Store for review and distribution *by them*.
>    This is **optional**, adds real constraints (Part 4), and for the Mac App
>    Store is currently **blocked by our architecture** (we shell out to
>    system git, which App Sandbox breaks). The Microsoft Store is feasible.
>
> You can ship signed installers with a verified publisher on GitHub Releases
> without ever touching a store. macOS installers can be warning-free after
> notarization; newly signed Windows installers may still encounter SmartScreen
> while reputation develops. Do Parts 1–3 first; treat Part 4 as a post-v0.1.0
> decision.

**Costs and lead times at a glance**

| Item | Cost | Lead time | Needed for |
| --- | --- | --- | --- |
| Apple Developer Program (org) | $99/year | days–2 weeks (D‑U‑N‑S + verification) | macOS signing & notarization |
| Azure Artifact Signing (recommended for Windows) | Basic SKU subscription (see [pricing](https://azure.microsoft.com/pricing/details/artifact-signing/)) + a paid Azure subscription | days–weeks (org identity validation) | Windows signing |
| — or a classic OV code-signing cert from a CA | ~$200–500/year + hardware token | 1–4 weeks (org validation) | Windows signing (alternative) |
| Microsoft Partner Center (only if listing in the Store) | ~$99 one-time (company) | days | Microsoft Store listing |

Both identity-validation processes are **long-lead and out of our control** —
start them immediately (they're the M0 procurement checkboxes in PLAN.md).

---

## Part 1 — macOS: Developer ID signing + notarization

Without this, macOS Gatekeeper tells users the app "cannot be opened because
the developer cannot be verified." With it, the app opens cleanly. Two steps:
**sign** with a Developer ID certificate, then **notarize** (upload to Apple's
automated malware scan, which staples a ticket to the app).

### 1.1 Enroll in the Apple Developer Program (as an organization)

1. Get a **D‑U‑N‑S number** for Atteniv, Inc. if it doesn't have one — check
   via [Apple's D‑U‑N‑S lookup](https://developer.apple.com/enroll/duns-lookup/)
   (free; requesting a new one takes up to ~2 weeks, corrections a few days).
2. Enroll at [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll/)
   with an Apple ID that will become the **Account Holder** — this person must
   have legal authority to bind the company. Choose **Organization**, not
   Individual (users then see "Atteniv, Inc." as the publisher).
3. Pay the $99/year fee. Apple may phone or email to verify the company.
   Budget a few days to two weeks end-to-end.

### 1.2 Create the Developer ID Application certificate

Must be done **by the Account Holder** (Apple restricts this certificate type),
on a Mac:

1. On the Mac, open **Keychain Access → Certificate Assistant → Request a
   Certificate From a Certificate Authority…**. Enter your email, select
   "Saved to disk". This produces a `.certSigningRequest` (CSR) file. (The
   CSR's email doesn't have to be the Account Holder's.)
2. In [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/certificates/list),
   click **+**, choose **Developer ID Application** (NOT "Apple Distribution" —
   that's the App Store type), and upload the CSR.
3. Download the `.cer` file and double-click it to install it into the login
   keychain **of the same Mac that generated the CSR** (the private key lives
   there — the `.cer` alone is useless elsewhere).
4. Verify it's usable:

   ```bash
   security find-identity -v -p codesigning
   # → 1) ABC123… "Developer ID Application: Atteniv, Inc. (TEAMID)"
   ```

5. **Export for CI:** in Keychain Access → My Certificates, right-click the
   certificate (expand it and make sure the private key is included) →
   **Export** as `certificate.p12` with a strong password. Then:

   ```bash
   openssl base64 -A -in certificate.p12 -out certificate-base64.txt
   ```

   Keep the `.p12` and password in the company password manager; the base64
   text becomes a GitHub Actions secret (Part 3).

### 1.3 Create notarization credentials (App Store Connect API key)

Notarization needs credentials for Apple's notary service. Two options; the
**API key is the right one for CI** (app-specific passwords are tied to a
person's Apple ID and 2FA):

1. In [App Store Connect → Users and Access → Integrations](https://appstoreconnect.apple.com/access/integrations/api),
   generate a **Team key** with the **Developer** role.
2. Note the **Issuer ID** and **Key ID**, and download the private key
   (`AuthKey_<KEYID>.p8`). **You can only download it once** — store it in the
   password manager.

### 1.4 Local signing + notarization (do this once before wiring CI)

Signing and notarization are driven entirely by environment variables — no
`tauri.conf.json` changes needed (the Tauri bundler enables the hardened
runtime, which notarization requires, by default):

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: Atteniv, Inc. (TEAMID)"
export APPLE_API_ISSUER="<issuer id>"
export APPLE_API_KEY="<key id>"
export APPLE_API_KEY_PATH="$HOME/secrets/AuthKey_<KEYID>.p8"

pnpm tauri build --bundles dmg
```

When the notarization variables are present, Tauri uploads the bundle to
Apple, waits for the verdict (usually minutes, occasionally longer), and
staples the ticket. Then verify like a user would:

```bash
spctl -a -vv "src-tauri/target/release/bundle/macos/OKF Editor.app"
# → accepted, source=Notarized Developer ID
```

Also do a real-world test: put the `.dmg` somewhere on the web, download it
in a browser (this sets the quarantine attribute), and confirm it opens with
no warning.

### 1.5 Gotchas

- Notarization rejections come with a JSON log URL — the common causes
  (unsigned nested binaries, missing hardened runtime, no secure timestamp)
  are all handled by Tauri's bundler, so a failure usually means a
  misconfigured identity or a stray unsigned sidecar.
- Our **keychain access** (github-token / OpenRouter key via the `keyring`
  crate) needs no special entitlement for Developer ID distribution — and
  properly signed builds have a **stable** code signature, which fixes the
  dev-build annoyance of re-prompting after every rebuild.
- The certificate is valid for 5 years; the notarization API key doesn't
  expire but can be revoked. Diary a renewal reminder anyway.

---

## Part 2 — Windows: Authenticode code signing

Unsigned Windows binaries trigger Microsoft Defender SmartScreen ("Windows
protected your PC"). Signing fixes the "Unknown publisher" line immediately;
the blue SmartScreen interstitial disappears as **reputation** accrues on the
certificate/files (downloads over time). There are three routes:

| Route | Cost | SmartScreen | Notes |
| --- | --- | --- | --- |
| **Azure Artifact Signing** (recommended) | Basic SKU/month | reputation builds over time | Cloud HSM, no hardware token, integrates with CI via a CLI. Formerly "Trusted Signing". Available to US/CA/EU/UK orgs. |
| Classic **OV** cert from a CA (Sectigo, DigiCert, SSL.com…) | ~$200–500/yr | reputation builds over time | Since June 2023 keys must live on a hardware token or HSM — painful for cloud CI. |
| **EV** cert | ~$300–700/yr | **immediate** reputation | Same hardware/HSM pain, higher cost. Artifact Signing does *not* offer EV. |

**Recommendation:** Azure Artifact Signing. It's the cheapest, the private key
never exists as a file (FIPS 140-2 Level 3 HSM), and it avoids shipping a USB
token to whoever runs CI. The trade-off vs. EV is a period of SmartScreen
warnings while reputation builds — acceptable for a v0.1.0 with modest
download volume, and you can [submit the signed installer to Microsoft for
review](https://www.microsoft.com/wdsi/filesubmission) to speed it up.

### 2.1 Set up Azure Artifact Signing

1. You need a **paid** Azure subscription (pay-as-you-go is fine; free/trial
   subscriptions are explicitly not supported). Create one at
   [portal.azure.com](https://portal.azure.com) under an Atteniv tenant.
2. Register the `Microsoft.CodeSigning` resource provider on the subscription
   (Subscription → Resource providers).
3. Create an **Artifact Signing account** (pick the Basic SKU; note the
   account name and endpoint region, e.g. `eus`/`wus2`).
4. Start **Identity validation → Public Trust** for Atteniv, Inc. This is the
   long-lead step: Microsoft's validation team verifies the legal entity, and
   there's an email-verification link that **expires in 7 days** — watch for
   it (and check spam). The validated legal name becomes the certificate
   subject (`CN=Atteniv, Inc.`) — no customization allowed.
5. Once validation completes, create a **certificate profile** (Public Trust)
   bound to that identity.
6. Create a Microsoft Entra **app registration** (service principal) for CI:
   note tenant ID, client ID, and create a client secret. Grant the service
   principal the **Artifact Signing Certificate Profile Signer** role on the
   account.

### 2.2 Wire it into the Tauri build

Tauri delegates Windows signing to a configurable command. Using
[`trusted-signing-cli`](https://github.com/Levminer/trusted-signing-cli):

```jsonc
// tauri.conf.json > bundle > windows
"signCommand": "trusted-signing-cli -e https://wus2.codesigning.azure.net -a <account> -c <profile> -d \"OKF Editor\" %1"
```

with `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` set in the
environment (CI secrets). `%1` is the file to sign; the bundler invokes it for
the executable and the installer.

If you go the classic OV/EV route instead, the cert lives in the Windows cert
store and the config is `certificateThumbprint` + `digestAlgorithm: "sha256"`
+ `timestampUrl` — see [Tauri's Windows signing guide](https://tauri.app/distribute/sign/windows/).

### 2.3 Verify

On a Windows machine (or VM): check the installer's **Properties → Digital
Signatures** tab shows "Atteniv, Inc." with a valid countersignature
(timestamp), then download it through a browser and run it — the dialog
should name the publisher. Expect the SmartScreen "more info / run anyway"
interstitial early on; it fades with downloads.

---

## Part 3 — Updater + release CI (GitHub Actions + tauri-action)

The M3 release workflow builds on
[`tauri-action`](https://github.com/tauri-apps/tauri-action), which builds,
signs, and attaches artifacts to a GitHub Release. The updater is not configured
in the repository yet; generating a key alone is not enough.

### 3.1 Configure and prove the updater

1. Add Tauri's updater plugin (and process plugin if the app will relaunch after
   installing):

   ```bash
   pnpm tauri add updater
   pnpm tauri add process
   ```

2. In `src-tauri/tauri.conf.json`, set `bundle.createUpdaterArtifacts` to `true`
   and configure `plugins.updater.pubkey` with the **contents** of the generated
   `.pub` file plus an HTTPS `endpoints` URL that serves `latest.json`. The public
   key belongs in source control; the private key does not.
3. Grant only the updater/process capabilities the UI uses (check,
   download-and-install, and restart), then add explicit UI handling for update
   available, progress, signature failure, and restart.
4. Configure `tauri-action` with `includeUpdaterJson: true`. During builds it
   consumes `TAURI_SIGNING_PRIVATE_KEY` and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to sign updater artifacts and produce
   `latest.json`.
5. Before v0.1.0, install version N, publish N+1 through the real release path,
   and prove check → download → signature verification → install → restart on
   every supported OS. Keep an older signed test release so this remains
   repeatable.

See the [Tauri updater guide](https://v2.tauri.app/plugin/updater/) for the exact
config schema and capability names for the pinned plugin version.

### 3.2 Secrets and release trust boundary

Store production signing values in a protected GitHub **Environment** named
`release`, not as secrets available to every job:

| Secret or derived value | Contents |
| --- | --- |
| `APPLE_CERTIFICATE` | base64 of the Developer ID `.p12` (step 1.2) |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12` export password |
| `KEYCHAIN_PASSWORD` | any strong string (CI builds a throwaway keychain) |
| `APPLE_SIGNING_IDENTITY` | `Developer ID Application: Atteniv, Inc. (TEAMID)` |
| `APPLE_API_ISSUER` / `APPLE_API_KEY` | notarization API key IDs (step 1.3) |
| `APPLE_API_KEY_PATH` *(derived)* | temporary path written from a secret holding the `.p8` contents |
| `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` | Artifact Signing service principal (step 2.1) |
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri updater private key; generate with `pnpm tauri signer generate` and never lose it |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | updater private-key password |

The release workflow must:

- trigger only for protected release tags (for example `v*`) governed by a
  repository ruleset;
- run a no-secrets preflight job that verifies the tagged commit is reachable
  from the protected release branch, then make signing jobs depend on it;
- put signing jobs behind the protected `release` Environment, with required
  approval and deployment branch/tag restrictions;
- default workflow permissions to `contents: read`, granting `contents: write`
  only to the job that creates the GitHub Release; and
- never expose the Environment or signing secrets to pull-request workflows.

macOS variables are consumed by the Tauri bundler during `tauri-action`'s build
step; Azure variables are consumed by the Windows `signCommand`. The workflow
must write the `.p8` secret to a temporary file and export `APPLE_API_KEY_PATH`
as that path (the bundler expects a path, not key contents), then securely remove
the file. Linux needs no OS-signing identity, though updater artifacts are still
signed; optionally publish SHA256SUMS or a GPG signature too.

---

## Part 4 — Optional: the actual app stores

Everything above ships verified-publisher installers from GitHub Releases
(subject to the Windows reputation caveat in Part 2). Store listing is a
separate, additional effort. Honest assessment for this app:

### 4.1 Mac App Store — **currently not feasible for us**

Beyond the extra mechanics (different certificates — "Apple Distribution" +
"Mac Installer Distribution", a provisioning profile embedded in the bundle,
`productbuild` to make a `.pkg`, upload via `xcrun altool`, human App Review),
the hard requirement is **App Sandbox**. Sandboxed apps can't usefully shell
out to system git: the child process inherits the sandbox and loses access to
the user's repos, config, and the network the way we need it. Our git
integration is the product ([DESIGN.md](DESIGN.md) §7.3 deliberately chose
system git over an embedded library), so a Mac App Store build would require
re-architecting git support (e.g. bundling libgit2 with sandbox-safe file
access) plus security-scoped bookmarks for folder access. **Decision: skip
the Mac App Store; Developer ID + notarization covers macOS.** Revisit only
if there's real demand.

### 4.2 Microsoft Store — feasible with modest extra work

The Store now accepts traditional Win32 installers (as an "app that links to
an external installer"), which fits Tauri's EXE/NSIS output. Requirements on
top of Part 2:

1. **Enroll in [Partner Center](https://partner.microsoft.com/dashboard/registration)**
   as a company (~$99 one-time). Company verification takes a few days.
2. The installer must be **code signed** (Part 2 covers this) — signing is
   mandatory for Store listing.
3. The installer must support **silent installation** — NSIS uses `/S`
   (capital S); register that parameter in the Partner Center submission or
   it will be rejected.
4. WebView2 must use the **offline installer** bundling mode
   (`bundle > windows > webviewInstallMode > type: "offlineInstaller"`) —
   Store installs can't depend on a download at install time. Consider a
   separate `tauri.microsoftstore.conf.json` so the GitHub Releases build
   keeps the smaller online installer.
5. **Publisher name must differ from product name** in the installer metadata.
6. Updates remain **our job** (Tauri updater) — the Store doesn't manage
   binaries for externally-hosted apps.
7. Submit via Partner Center: listing copy, screenshots, age rating
   questionnaire, privacy policy URL; then certification review (usually a
   few days).

**Decision suggestion:** worth doing post-v0.1.0 for discoverability, since
the marginal work over Part 2 is small — but not on the v0.1.0 critical path.

---

## Action checklist (in order)

Start-now (long-lead, blocks M3):

- [ ] Confirm/request D‑U‑N‑S number for Atteniv, Inc.
- [ ] Enroll in Apple Developer Program (Organization, $99/yr)
- [ ] Create paid Azure subscription + Artifact Signing account; start Public
      Trust identity validation (watch for the 7-day email link)

Once accounts exist:

- [ ] Create + export Developer ID Application cert (Account Holder, on a Mac)
- [ ] Create App Store Connect API key for notarization
- [ ] Create Artifact Signing certificate profile + CI service principal
- [ ] Prove out one local signed+notarized macOS build (§1.4) and one signed
      Windows build (§2.3)
- [ ] Add and configure the updater plugin, generate its keypair, and store the
      private key and password like production secrets (§3.1)
- [ ] Protect release tags and the `release` Environment; add all signing
      secrets and wire the least-privilege `tauri-action` workflow (§3.2)
- [ ] Prove an N → N+1 signed update on macOS, Windows, and Linux

Post-v0.1.0 (optional):

- [ ] Microsoft Store: Partner Center enrollment + Store-flavored installer
- [ ] Mac App Store: revisit only with demand (requires git re-architecture)
