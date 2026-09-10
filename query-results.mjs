#!/usr/bin/env node
// Query a verified applicant's zkMe results (booleans only; zkMe never returns
// name/DOB/country values to cooperators). Reads .env in this directory.
// Usage: node query-results.mjs <verification-id>

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
    let val = line.slice(eq + 1).trim()
    if (val.length > 1 && val[0] === '"' && val.at(-1) === '"') val = val.slice(1, -1)
    env[line.slice(0, eq).trim()] = val
  }
} catch {
  console.error('No .env found; copy .env.example to .env and fill it in.')
  process.exit(1)
}

const { ZKME_API_KEY, ZKME_APP_ID, ZKME_PROGRAM_NO } = env
if (!ZKME_API_KEY || !ZKME_APP_ID || !ZKME_PROGRAM_NO) {
  console.error('Set ZKME_API_KEY, ZKME_APP_ID and ZKME_PROGRAM_NO in .env')
  process.exit(1)
}

const account = (process.argv[2] || '').toLowerCase()
if (!account) {
  console.error('Usage: node query-results.mjs <verification-id>')
  process.exit(1)
}

// dashboard shows the key with a literal "key" prefix; the API wants it bare
const apiKey = ZKME_API_KEY.replace(/^key/, '')
const base = { mchNo: ZKME_APP_ID, apiKey, programNo: ZKME_PROGRAM_NO, account }

async function call(path, body) {
  const r = await fetch(`https://agw.zk.me/zkseradmin/openapi/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const j = await r.json().catch(() => ({}))
  if (j.code !== undefined && j.code !== 80000000) {
    return { error: `${j.code} ${j.msg ?? ''}` }
  }
  return j.data !== undefined ? j.data : j
}

// zkMe chain ids are decimal/named ('137', 'solana', ...); hex is rejected
const res = await call('queryKycInfoByAddress', { ...base, chainId: env.ZKME_CHAIN_ID || '137' })
console.log(`zkKYC for ${account} (program ${ZKME_PROGRAM_NO}):`)
if (res.error) console.log(`  error: ${res.error}`)
else {
  const rows = Array.isArray(res) ? res : [res]
  if (!rows.length) console.log('  no record')
  for (const kyc of rows) {
    console.log(`  status: ${kyc.kycStatus}   completed: ${kyc.kycCompleteTimeUnix ? new Date(Number(kyc.kycCompleteTimeUnix)).toISOString() : 'n/a'}   zkmeId: ${kyc.zkmeId}`)
    const v = kyc.verifierValues || {}
    for (const k of ['sanction', 'age', 'citizenship', 'location', 'unique']) {
      console.log(`  ${k}: ${v[k] === null || v[k] === undefined ? 'not configured in program' : v[k]}`)
    }
  }
}

const poa = await call('queryPoAInfoByAddress', { ...base, programNo: env.ZKME_POA_PROGRAM_NO || ZKME_PROGRAM_NO })
console.log(`Proof-of-Address (program ${env.ZKME_POA_PROGRAM_NO || ZKME_PROGRAM_NO}):`)
if (poa.error) console.log(`  error: ${poa.error}`)
else {
  const rows = Array.isArray(poa) ? poa : [poa]
  if (!rows.length) console.log('  no PoA record')
  for (const p of rows) {
    const v = p.verifierValues || {}
    console.log(`  status: ${p.status}   countryRegion (passes jurisdiction policy): ${v.countryRegion ?? 'not configured in program'}`)
    if (v.countryRegionCode || v.countryRegionName) {
      console.log(`  residence country: ${v.countryRegionName ?? '?'} (${v.countryRegionCode ?? '?'})`)
    }
  }
}
