// Runtime configuration for the Kusama Vision KYC landing page.
// Copy to config.public.js at the repo root and fill in the NON-SECRET values
// (name, appId, programNo, tokenEndpoint). It is tracked and published;
// scripts/deploy.sh stages it as config.js and refuses to publish secrets.
window.KYC_CONFIG = {
  appName: 'Kusama Vision KYC',
  // Hex chain id the widget is told; no on-chain transaction happens in this
  // flow (email login mode, off-chain verification), so any zkMe-supported
  // chain id works. '0x89' = Polygon.
  chainId: '0x89',

  // One entry per curator account the applicant must verify against.
  // Token acquisition per entry, tried in this order:
  //   accessToken   - a pre-minted token (short-lived; for supervised sessions)
  //   tokenEndpoint - URL of a curator-hosted endpoint returning {"accessToken": "..."}
  //                   (recommended; see README for a 20-line Cloudflare Worker)
  //   apiKey        - the curator's zkMe API key, used to mint tokens in the
  //                   browser. WARNING: this publishes the key; read README first.
  curators: [
    {
      name: 'brenzi',                // must match the c= value in minted links
      appId: 'M2026082545302140009179261407841',
      programNo: '202608260001',     // identity (zkKYC) program
      poaProgramNo: '202608270002',  // residence (PoA) program number from the dashboard
      tokenEndpoint: '',
      accessToken: '',
      apiKey: '',
    },
    {
      name: 'northvane',
      appId: 'M2026082733075865663019032178252',
      programNo: '202608270001',
      tokenEndpoint: '',
    },
    {
      name: 'Curator 3',
      appId: '',
      programNo: '',
      tokenEndpoint: '',
    },
    // Add a fourth entry if all four curators run their own zkMe account.
  ],
}
