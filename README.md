# Kusama Vision KYC landing page (zkMe)

Static page for `kyc.brenzi.ch`. Applicants enter the payout address from their
proposal and complete zkMe zkKYC once per curator account. The page has no
backend, stores nothing, and talks only to zkMe (`nest-api.zk.me` for tokens,
the zkMe widget/API for the flow and status checks).

Scope per the curators' process (`/work/LEGAL/`): zkMe is the identity +
residence layer only. What zkMe collects and what it discloses to each curator
(selective disclosure of name/DOB/country, residence-not-in-embargoed-set,
liveness, uniqueness) is configured per program in each curator's zkMe
dashboard, not in this page. The page only carries `lv: 'zkKYC'` + the
program number, uses email login (no wallet connect, no on-chain mint), and
binds the verification to the applicant's payout address as the zkMe
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

Publishing to IPFS + ENS (`kyc.kusama-vision-pop.eth` via eth.limo/eth.link,
plus the plain-DNS host `kyc.brenzi.ch`) is `./scripts/deploy.sh`; the CID log
is `DEPLOYMENTS.md`; the full procedure incl. the SAFE-owned ENS update and
zkMe domain whitelisting is in `HOWTO_DEPLOY.md`.

## Token source per curator: pick one

1. `tokenEndpoint` (recommended): a curator-hosted URL that returns
   `{"accessToken": "..."}`. Keeps the API key private. Cloudflare Worker:

   ```js
   export default {
     async fetch(req, env) {
       const r = await fetch('https://nest-api.zk.me/api/token/get', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ apiKey: env.ZKME_API_KEY, appId: env.ZKME_APP_ID,
                                apiModePermission: 0, lv: 1 }),
       })
       const j = await r.json()
       return Response.json({ accessToken: j.data?.accessToken }, {
         headers: { 'Access-Control-Allow-Origin': 'https://kyc.brenzi.ch' },
       })
     },
   }
   ```

2. `accessToken`: a pre-minted token, either pasted into `config.js` or, the
   intended flow, encoded into a personal link the curator posts in the
   applicant's E2EE Matrix room. Mint locally:

   ```sh
   curl -s -X POST https://nest-api.zk.me/api/token/get \
     -H 'Content-Type: application/json' \
     -d '{"apiKey":"'$ZKME_API_KEY'","appId":"'$ZKME_APP_ID'","apiModePermission":0,"lv":1}' \
     | jq -r .data.accessToken
   ```

   Link format (fragment, so nothing after `#` ever reaches the web server or
   its logs):

   ```
   https://kyc.brenzi.ch/#c=Alain&t=<accessToken>&a=<payout address>
   ```

   Note: the dashboard displays the API key with a literal `key` prefix
   (`key...`); the API expects the key **without** that prefix, otherwise
   `token/get` fails with 81000014 "AppID and API Key do not match".
   `mint-link.mjs` strips it automatically; the curl above and the Worker do
   not.

   `c` is the curator's `name` (or `appId`) from `config.js`, `a` prefills the
   payout address. Or let `mint-link.mjs` do both steps: copy `.env.example`
   to `.env` (git-ignored), fill in your key, appId and curator name, then
   `node mint-link.mjs <payout-address>` prints the finished link. Each curator
   mints with their own key and posts their own link. Caveats: the token is a bearer secret until it expires (a leak means
   verifications billed to that curator, not data access), so post it only in
   the E2EE room; and turn off inline URL previews for that room, because a
   client generating previews sends the full URL, fragment included, to its
   homeserver. Token lifetime and whether a token is single-use are not
   documented by zkMe; test after activation and treat tokens as
   mint-per-session.

3. `apiKey` in `config.js`: works with zero infrastructure but **publishes the
   key**. Anyone can then mint access tokens against the curator's account and,
   depending on what the key authorizes on zkMe's cooperator API, potentially
   query verification results (disclosed PII). Use only for a quick test with a
   key you will rotate, never for production. Ask zkMe what the API key
   authorizes beyond token minting before even considering it.

## To confirm with zkMe before go-live (contact@zk.me)

- Domain whitelisting: production widgets require the host to be whitelisted
  per account; ask each curator account to whitelist `kyc.brenzi.ch`.
- CORS: whether `nest-api.zk.me/api/token/get` accepts browser-origin calls
  (only relevant for the discouraged `apiKey` mode).
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
- `config.public.js` - tracked, published runtime config (no secrets)
- `scripts/deploy.sh`, `HOWTO_DEPLOY.md`, `DEPLOYMENTS.md` - IPFS + ENS
  release pipeline and CID log
