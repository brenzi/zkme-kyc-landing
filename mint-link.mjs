#!/usr/bin/env node
// Mint a zkMe access token and print the applicant's personal verification link.
// Reads .env in this directory; usage: node mint-link.mjs <payout-address>

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const env = {}
try {
  const raw = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '.env'), 'utf8')
  for (const line of raw.split('\n')) {
    if (/^\s*(#|$)/.test(line)) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if (val.length > 1 && val[0] === '"' && val.at(-1) === '"') val = val.slice(1, -1)
    env[key] = val
  }
} catch {
  console.error('No .env found; copy .env.example to .env and fill it in.')
  process.exit(1)
}

const { ZKME_API_KEY, ZKME_APP_ID, KYC_CURATOR } = env
const baseUrl = env.KYC_BASE_URL || 'https://kyc.kusama-vision-pop.eth.limo/'
if (!ZKME_API_KEY || !ZKME_APP_ID || !KYC_CURATOR) {
  console.error('Set ZKME_API_KEY, ZKME_APP_ID and KYC_CURATOR in .env')
  process.exit(1)
}

const address = process.argv[2]
if (!address || !/^[1-9A-HJ-NP-Za-km-z]{40,60}$/.test(address)) {
  console.error('Usage: node mint-link.mjs <payout-address>   (SS58 address from the proposal)')
  process.exit(1)
}

// The dashboard displays the API key with a literal "key" prefix; the API
// expects it without.
const apiKey = ZKME_API_KEY.replace(/^key/, '')
const r = await fetch('https://nest-api.zk.me/api/token/get', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ apiKey, appId: ZKME_APP_ID, apiModePermission: 0, lv: 1 }),
})
const j = await r.json().catch(() => ({}))
if (!r.ok || j.code !== 80000000 || !j.data?.accessToken) {
  console.error(`Token mint failed: HTTP ${r.status}, code ${j.code ?? 'n/a'}, ${j.msg ?? 'no message'}`)
  console.error(`Sent appId "${ZKME_APP_ID}" with an API key of ${apiKey.length} chars ending "…${apiKey.slice(-4)}"`)
  if (j.code === 81000014) {
    console.error('81000014 means the appId/apiKey pair is wrong: ZKME_APP_ID must be the'
      + ' mchNo (merchant number); it and the API key are shown together at'
      + ' dashboard.zk.me -> Integration -> Configuration. Copy both from that screen.')
  }
  process.exit(1)
}

const hash = new URLSearchParams({ c: KYC_CURATOR, t: j.data.accessToken, a: address })
console.log(`${baseUrl}#${hash}`)
