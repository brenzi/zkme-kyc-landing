# CLAUDE.md

Static, link-only KYC landing page for the Kusama Vision Program, built on the
zkMe widget SDK. Published to IPFS + ENS at
`https://kyc.kusama-vision-pop.eth.limo/`. The screening process it implements
is defined in `/work/LEGAL/kusama-vision-curator-run-process.md`; zkMe covers
identity + residence only, sanctions screening stays with the curators.

## Architecture, in short

- No backend. The page renders nothing unless opened via a personal link
  `#c=<curator name>&t=<accessToken>&a=<payout address>`; the fragment never
  reaches any server. One button per link, for exactly that curator.
- Applicant identity binding: the payout address (SS58) is passed to zkMe as
  the "unique identifier" in email-login mode; no wallet connect, no on-chain
  mint, so `chainId` in config is arbitrary and the delegate-transaction
  provider methods are unimplemented on purpose.
- `config.public.js` (repo root, tracked, secrets forbidden) is the single
  source of runtime config. `scripts/deploy.sh` stages it as `config.js`;
  `dist/` is disposable build output. Editing `dist/config.js` does not
  survive a deploy.
- Tokens are minted locally by each curator (`mint-link.mjs` + `.env`), never
  by the page. The config fields `accessToken`/`tokenEndpoint`/`apiKey` exist
  in `src/app.js` but stay empty; `deploy.sh` refuses to publish a config
  containing a secret.

## Hard-won zkMe facts (all verified empirically)

- **API key prefix.** The dashboard shows the key as `key...`; the API wants
  it *without* the `key` prefix. Sending it as displayed yields
  `81000014 "AppID and API Key do not match"`. `mint-link.mjs` strips it.
- **Token minting.** `POST https://nest-api.zk.me/api/token/get` with JSON
  `{apiKey, appId, apiModePermission: 0, lv: 1}` (0 = email login, 1 = zkKYC).
  `appId` = mchNo (`M2026...`), shown next to the key on
  dashboard.zk.me -> Integration -> Configuration. Token lifetime/single-use:
  undocumented; treat as mint-per-session.
- **Domain whitelist compares full origins.** The widget checks
  `new URL(entry).origin === new URL(dappOrigin).origin` over the dashboard's
  comma-joined list; an entry without a scheme throws inside `new URL()` and
  silently never matches. Whitelist entries must be e.g.
  `https://kyc.kusama-vision-pop.eth.limo` (scheme mandatory, subdomain exact,
  paths/trailing slashes harmless). Per-CID gateway origins
  (`<cid>.ipfs.dweb.link`) change every release and cannot be whitelisted
  stably.
- **Widget error vocabulary.** `UNAUTHORIZED_DOMAIN` "Domain not whitelisted
  by project" (origin vs `mchDomains` from `/api/mchInfo/design`);
  `NULL_PROGRAM` (program not created/applied); `PROGRAM_PENDING` "being
  configured on chain, try again later" (automated wait after activation);
  "system error" = generic API envelope `code 80000001`. Success envelope code
  is `80000000`.
- **Program lifecycle.** Dashboard: create program -> click the record ->
  Activate/"Apply program" (self-serve, no zkMe human review) -> short
  automated on-chain configuration window -> live.
- **Public status endpoint** (no auth; good for debugging config):
  `POST https://nest-api.zk.me/api/grant/check_v2` with
  `{userAccount, programNo, appId}` -> `{code: 80000000, data: {isGrant, ...}}`.
  Omitting `programNo` returns the app's default program. The SDK's
  `verifyKycWithZkMeServices` wraps this; it rejects with the raw `{code,msg}`
  object (render via `errText()` in `src/app.js`, else "[object Object]").
- **Debugging the widget.** The iframe (`widget.zk.me`) appends
  `origin=location.origin` plus all widget params to its URL; its bundle at
  `widget.zk.me/assets/index-*.js` is readable and greppable for error strings
  and endpoints. Backend calls go to `agw.zk.me/{webapi,popup,nest,guest}` and
  `popupapi.zk.me`; direct probing of most of them fails on a signed
  `x-appversion` header, so use the browser Network tab (read response bodies:
  HTTP 200 still carries error codes).
- Verification email login happens *before* the domain check, so a flow can
  get through email verification and still die on whitelisting.

## Deployment

`./scripts/deploy.sh` builds, stages, refuses secrets, `ipfs add` as CIDv1
(subdomain-gateway requirement), logs the CID to `DEPLOYMENTS.md`, optionally
mirror-pins (`MIRROR_API`/`MIRROR_AUTH`). ENS contenthash for
`kyc.kusama-vision-pop.eth` is updated via the curators' SAFE (multiparty; no
IPNS by design). `./scripts/deploy.sh --check <CID>` verifies reproducibility
before confirming the SAFE tx. Full procedure: `HOWTO_DEPLOY.md`. The pipeline
mirrors `/work/kv-pop` (HOWTO_IPFS.md, HOWTO-ENS.md, pin-follower). A custom
DNS host needs DNSLink + a vhost on a gateway we control; a bare CNAME to
eth.limo or any public gateway cannot work (TLS + host mapping).

## Rules

- Never publish or commit an apiKey; `.env` is git-ignored and used only by
  `mint-link.mjs`. A leaked *token* is bounded (billing abuse until expiry); a
  leaked *key* also exposes applicant PII via the cooperator API.
- Test fixtures never go to real paths in this repo (a `.env` was destroyed
  that way once); use the session scratchpad and check targets before
  overwrite/delete.
- Applicant-facing wording must not claim "data never leaves your phone":
  zkMe uploads ID + selfie server-side at issuance (see
  `/work/LEGAL/zkme-evaluation-report.md`).

## References

- Process + legal basis: `/work/LEGAL/kusama-vision-curator-run-process.md`,
  `/work/LEGAL/zkme-evaluation-report.md`,
  `/work/LEGAL/kusama-vision-curator-compliance-report.md`
- Deployment pattern source: `/work/kv-pop/`
- zkMe docs: https://docs.zk.me/hub/start/onboarding/integration/js-sdk/zkkyc
  (append `.md`, or `?ask=<question>` for the docs QA endpoint;
  index: https://docs.zk.me/llms.txt)
- SDK: `@zkmelabs/widget` (npm; types in `index.d.ts` are the best API
  reference; repo github.com/zkMeLabs/zkme-sdk-js)
- Dashboard: https://dashboard.zk.me - Integration -> Configuration (key,
  mchNo, whitelist), Configuration -> zkKYC (programs)
- zkMe contact for account/production issues: contact@zk.me
