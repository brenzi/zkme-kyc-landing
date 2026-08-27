# Kusama Vision KYC landing page (zkMe)

Static page published at `https://kyc.kusama-vision-pop.eth.limo/` (IPFS + ENS,
see `HOWTO_DEPLOY.md`). Every beneficial owner of a proposal opens the personal
link a curator minted for them and completes zkMe zkKYC (and the residence
check) once per curator account; without a link the page shows no buttons. The page has no backend, stores nothing, and talks only to
zkMe (widget + public status API). Access tokens are minted locally by each
curator with `mint-link.mjs`; no key or token lives in the deployed page.

Scope per the curators' process (`/work/LEGAL/`): zkMe is the identity +
residence layer only. What zkMe collects and what it discloses to each curator
(selective disclosure of name/DOB/country, residence-not-in-embargoed-set,
liveness, uniqueness) is configured per program in each curator's zkMe
dashboard, not in this page. The page only carries `lv: 'zkKYC'` + the
program number, uses email login (no wallet connect, no on-chain mint), and
binds each verification to a random per-person verification ID as the zkMe
"unique identifier". Sanctions screening stays with the curators.

## Build

```
npm install
node build.mjs
```

Runtime config lives in `config.public.js` at the repo root (copy
`src/config.example.js`, one entry per curator: name, `appId` = mchNo,
`programNo`, and a token source; never a key). For a local test,
`cp config.public.js dist/config.js` and serve `dist/`.

Publishing to IPFS + ENS (`kyc.kusama-vision-pop.eth` via eth.limo/eth.link;
optionally a DNSLink host on our own gateway) is `./scripts/deploy.sh`; the CID
log is `DEPLOYMENTS.md`; the full procedure incl. the SAFE-owned ENS update and
zkMe domain whitelisting is in `HOWTO_DEPLOY.md`.

## Tokens: minted locally, delivered as personal links

Each curator mints access tokens on their own machine and hands the applicant
a personal link; that is the only supported token flow. Copy `.env.example` to
`.env` (git-ignored), fill in your API key, mchNo and curator name, then:

```
node mint-link.mjs --new-id
# kv6b1b464bebab81eda239b8bd
node mint-link.mjs <verification-id>
```

prints the finished link, e.g.

```
https://kyc.kusama-vision-pop.eth.limo/#c=brenzi&t=<accessToken>&id=kv3f9a…
```

`c` must match your entry's `name` (or `appId`) in `config.public.js`; `id`
prefills the beneficial owner's verification ID. Everything sits in the URL fragment, so neither
token nor address ever reaches a web server or its logs. Post the link only in
the applicant's E2EE Matrix room, with inline URL previews off (a client
generating previews sends the full URL, fragment included, to its homeserver).

## Verification IDs: one per beneficial owner

A payout address can have several beneficial owners, and every one of them
must pass KYC, so the zkMe identifier is not the address but a random
per-person verification ID (`kv` + 24 hex chars, unguessable, no personal
data). The order is fixed:

1. Curators generate one ID per beneficial owner (`node mint-link.mjs
   --new-id`) and post them in the applicant's E2EE Matrix room.
2. The applicant returns a message signed with the destination wallet naming
   every beneficial owner together with their assigned ID (this doubles as the
   wallet-control proof and the beneficial-owner declaration).
3. Only after every curator has verified that signature does each curator mint
   and post the personal links, one per beneficial owner.

The ID-to-person mapping lives in the signed declaration and the curators'
records; zkMe only ever sees the opaque ID. A leaked token therefore cannot be
used to bind a verification to a foreign payout address, and an ID by itself
identifies nobody.

Token notes:

- The dashboard displays the API key with a literal `key` prefix; the API
  wants it without, else `token/get` fails with 81000014 ("AppID and API Key
  do not match"). `mint-link.mjs` strips it automatically.
- A token is a bearer secret until it expires; a leak means verifications
  billed to that curator, not data access. Lifetime and single-use semantics
  are undocumented; treat tokens as mint-per-session.
- `config.public.js` also has `accessToken`/`tokenEndpoint`/`apiKey` fields
  the page code can consume; they are deliberately left empty. The deploy
  script refuses to publish a config containing a secret.

## To confirm with zkMe before go-live (contact@zk.me)

- Domain whitelisting: each curator's dashboard must whitelist the full
  origins `https://kyc.kusama-vision-pop.eth.limo` and
  `https://kyc.kusama-vision-pop.eth.link` (scheme included; the widget
  compares whole origins and silently drops entries without a scheme).
- Access-token lifetime and reuse: how long a token from `token/get` stays
  valid, whether it is single-use or reusable within its lifetime, and whether
  minting a new token invalidates earlier ones.
- Email login + an arbitrary unique identifier (a Kusama SS58 address) with no
  on-chain mint: confirm this flow completes without any EVM wallet.
- Credential reuse across the curator accounts: the applicant should complete
  full KYC once and only re-grant for the other programs; confirm, and confirm
  the per-verification fee applies per grant (about $0.50 each).
- Selective-disclosure and Jurisdiction Policy configuration per program:
  each curator's program must be configured identically (disclose name/DOB/
  country; denylist Iran, North Korea, Cuba, Syria, Crimea, Donetsk, Luhansk,
  Russia; liveness + uniqueness required) so all curators receive the same
  result set. This lives in the dashboard, not in this page.

## Files

- `src/index.html` - page, inline styles, loads `config.js` then `app.js`
- `src/app.js` - widget wiring: status check per curator
  (`verifyKycWithZkMeServices`), one `ZkMeWidget` per curator, launch/refresh
- `src/config.example.js` - runtime config template
- `build.mjs` - esbuild bundle + copies (`dist/zkme-style.css` is the widget's
  own stylesheet)
- `mint-link.mjs` + `.env.example` - curator-local: mint a token with the
  curator's API key and print the applicant's personal link
- `query-results.mjs` - curator-local: fetch a beneficial owner's zkMe results
  by verification ID (KYC status plus boolean verifier values; zkMe never returns
  name/DOB/country values to cooperators, so identity data for sanctions
  screening comes from the Matrix-room uploads per the LEGAL process)
- `config.public.js` - tracked, published runtime config (no secrets)
- `scripts/deploy.sh`, `HOWTO_DEPLOY.md`, `DEPLOYMENTS.md` - IPFS + ENS
  release pipeline and CID log
