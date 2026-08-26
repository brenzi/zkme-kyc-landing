# Deploying the KYC landing page to IPFS + ENS

Same pattern as `/work/kv-pop` (HOWTO_IPFS.md / HOWTO-ENS.md): content pinned on
IPFS, the ENS name owned by the curators' SAFE, contenthash updated per release,
no IPNS (single-key ownership and an extra indirection; the SAFE already gives
multiparty control of updates).

## One-time setup

1. Install kubo (`ipfs`) and run the daemon.
2. `cp src/config.example.js config.public.js` and fill in every curator's
   `name`, `appId` (mchNo), `programNo` and, where used, `tokenEndpoint`.
   This file is tracked and gets published; it must never contain an
   `apiKey` or `accessToken` value; the deploy script refuses to publish if
   an apiKey slips in. Applicants are served tokens via minted links
   (`mint-link.mjs`) or curator-hosted `tokenEndpoint`s.
3. ENS subname (via the SAFE that owns `kusama-vision-pop.eth`, see
   `/work/kv-pop/HOWTO-ENS.md`): open the ENS app inside
   [SAFE](https://app.safe.global/), create the subname `kyc`, then execute the
   pending transaction in the SAFE queue.

## Per release

```
./scripts/deploy.sh
```

The script builds `dist/`, stages `index.html`, `app.js`, `zkme-style.css` and
`config.public.js` (as `config.js`), refuses to continue if the config contains
a key, adds the directory to IPFS as CIDv1, appends the CID to
`DEPLOYMENTS.md` (the CID log the screening procedure requires), optionally
pins on a mirror, and prints preview URLs.

Then update the contenthash: SAFE -> ENS app -> `kyc.kusama-vision-pop.eth` ->
records -> contenthash = `ipfs://<CID>` -> sign -> execute the pending SAFE
transaction. Any curator can propose; the SAFE policy decides how many must
confirm.

## Availability

- Your own node pins on `ipfs add` (`--pin=true`).
- Mirror pin on the shared node (kv-pop pattern):

  ```
  ipfs swarm connect /ip4/129.212.213.82/tcp/4001/p2p/12D3KooWCtS4Li5YJhjj2fWWKxgqZi7t6FReuVtrN9MRQtLrg7Tj
  MIRROR_API=https://ipfs2-api.encointer.org MIRROR_AUTH=user:pwd ./scripts/deploy.sh
  ```

- Curators who run a node can mirror each other's pins with
  `/work/kv-pop/scripts/pin-follower.sh` (no cluster, no consensus; see
  `/work/kv-pop/HOWTO_IPFS.md`).

## Verifying a release (any curator)

```
./scripts/deploy.sh --check <CID>
```

Rebuilds and stages locally, hashes without publishing, and compares against
`<CID>`. Same commit + same `config.public.js` must reproduce the same CID
(esbuild is pinned by `package-lock.json`), so each curator can confirm the
page behind the ENS name is the code in the repo before approving the SAFE
transaction.

## URLs and zkMe whitelisting

Stable hosts (whitelist these in every curator's zkMe dashboard under
Integration -> Settings):

- `kyc.kusama-vision-pop.eth.limo` (primary)
- `kyc.kusama-vision-pop.eth.link` (backup)
- `kyc.brenzi.ch` (plain-DNS host, serves the same `.stage/` content)

Raw-CID gateways (`ipfs://<cid>` in Brave, `https://<cid>.ipfs.dweb.link/`)
have a different origin on every release, so the zkMe widget will not run
there unless zkMe supports wildcard whitelisting (`*.ipfs.dweb.link`; ask
contact@zk.me). Until confirmed, treat raw-CID URLs as preview-only and give
applicants the `.limo` URL. `mint-link.mjs` links inherit this via
`KYC_BASE_URL` in `.env`: set it to `https://kyc.kusama-vision-pop.eth.limo/`
once the ENS record is live (URL fragments survive all gateways).

Reachability trade-off, same as kv-pop found: `ipfs://` works natively in
Brave and in Chrome with the MetaMask extension, but not in Firefox or most
mobile browsers, which is why the gateway hosts are the applicant-facing URLs.
