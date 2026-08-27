import { ZkMeWidget, verifyKycWithZkMeServices } from '@zkmelabs/widget'

const cfg = window.KYC_CONFIG
const $ = (id) => document.getElementById(id)

const state = {
  identifier: '',
  widgets: new Map(), // appId/programNo -> ZkMeWidget
  link: null, // { curator, tokenProvided } when opened via a personal link
}

// zkMe cannot combine zkKYC and Proof-of-Address in one program, so each
// curator has an identity program (programNo) and optionally a residence
// program (poaProgramNo). The applicant completes both, one widget launch each.
function stepsOf(curator) {
  const steps = [{ key: 'kyc', label: 'Identity', programNo: curator.programNo }]
  if (curator.poaProgramNo) {
    steps.push({ key: 'poa', label: 'Residence', programNo: curator.poaProgramNo })
  }
  return steps
}

function stepKey(curator, step) {
  return `${curator.appId}/${step.programNo}`
}

// zkMe rejects with plain {code, msg} objects, which String() renders as
// "[object Object]"
function errText(e) {
  if (e instanceof Error) return e.message
  if (typeof e === 'string') return e
  if (e && (e.msg || e.code)) return [e.msg, e.code && `(${e.code})`].filter(Boolean).join(' ')
  try { return JSON.stringify(e).slice(0, 120) } catch { return 'unknown error' }
}

function hasTokenSource(c) {
  return Boolean(c.accessToken || c.tokenEndpoint || c.apiKey)
}

// Link-only: without a personal link naming a curator, no button is shown.
function visibleCurators() {
  return state.link ? [state.link.curator] : []
}

// Verification IDs are random per-person identifiers assigned by the curators
// (kv + 24 hex chars); they contain no personal data and are unguessable.
function plausibleId(s) {
  return /^kv[0-9a-f]{24}$/.test(s)
}

function tokenFetcher(curator) {
  return async function getAccessToken() {
    if (curator.accessToken) return curator.accessToken
    if (curator.tokenEndpoint) {
      const r = await fetch(curator.tokenEndpoint)
      if (!r.ok) throw new Error(`${curator.name}: token endpoint returned ${r.status}`)
      const j = await r.json()
      const token = j.accessToken ?? j.data?.accessToken
      if (!token) throw new Error(`${curator.name}: token endpoint returned no accessToken`)
      return token
    }
    if (curator.apiKey) {
      const r = await fetch('https://nest-api.zk.me/api/token/get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: curator.apiKey.replace(/^key/, ''),
          appId: curator.appId,
          apiModePermission: 0,
          lv: 1,
        }),
      })
      const j = await r.json()
      if (j.code !== 80000000) throw new Error(`${curator.name}: token error ${j.code} ${j.msg ?? ''}`)
      return j.data.accessToken
    }
    throw new Error(`${curator.name}: no session token available`)
  }
}

function getWidget(curator, step) {
  const key = stepKey(curator, step)
  let w = state.widgets.get(key)
  if (w) return w
  const provider = {
    getAccessToken: tokenFetcher(curator),
    async getUserAccounts() {
      return [state.identifier]
    },
  }
  w = new ZkMeWidget(curator.appId, cfg.appName, cfg.chainId, provider, {
    lv: 'zkKYC',
    programNo: step.programNo,
    mode: 'email',
    theme: 'auto',
    locale: 'en',
  })
  w.on('kycFinished', (results) => onStepFinished(curator, step, results))
  w.on('close', () => refreshStatus(curator, step))
  state.widgets.set(key, w)
  return w
}

function onStepFinished(curator, step, results) {
  const { isGrant, associatedAccount } = results
  const ok = isGrant && associatedAccount?.toLowerCase() === state.identifier.toLowerCase()
  setStatus(curator, step, ok ? 'granted' : 'error',
    ok ? null : `Finished but not granted for ${state.identifier}`)
}

function setStatus(curator, step, status, detail) {
  const el = $(`status-${stepKey(curator, step)}`)
  const btn = $(`btn-${stepKey(curator, step)}`)
  if (!el) return
  el.dataset.status = status
  el.textContent = {
    unknown: 'status unknown',
    checking: 'checking…',
    granted: '✓ verified',
    missing: 'not verified yet',
    error: detail || 'error',
  }[status]
  if (detail && status === 'error') el.title = detail
  btn.disabled = status === 'granted' || !state.identifier || !hasTokenSource(curator)
}

async function refreshStatus(curator, step) {
  if (!state.identifier) return setStatus(curator, step, 'unknown')
  setStatus(curator, step, 'checking')
  try {
    const { isGrant } = await verifyKycWithZkMeServices(curator.appId, state.identifier, {
      programNo: step.programNo,
    })
    setStatus(curator, step, isGrant ? 'granted' : 'missing')
  } catch (e) {
    setStatus(curator, step, 'error', `status check failed: ${errText(e)}`)
  }
}

function refreshAll() {
  for (const curator of visibleCurators()) {
    for (const step of stepsOf(curator)) refreshStatus(curator, step)
  }
}

function render() {
  const list = $('curators')
  list.innerHTML = ''
  for (const curator of visibleCurators()) {
    const steps = stepsOf(curator)
    for (const [i, step] of steps.entries()) {
      const li = document.createElement('li')
      li.className = 'curator'
      if (state.link) li.classList.add('linked')
      const btn = document.createElement('button')
      btn.id = `btn-${stepKey(curator, step)}`
      btn.textContent = steps.length > 1
        ? `${i + 1}. ${step.label} check with ${curator.name}`
        : `Verify with ${curator.name}`
      btn.disabled = true
      if (!hasTokenSource(curator)) {
        btn.title = 'No session token available for this curator; open the personal link they sent you.'
      }
      btn.addEventListener('click', () => {
        try {
          getWidget(curator, step).launch()
        } catch (e) {
          setStatus(curator, step, 'error', errText(e))
        }
      })
      const status = document.createElement('span')
      status.id = `status-${stepKey(curator, step)}`
      status.className = 'status'
      status.textContent = 'enter your verification ID first'
      li.append(btn, status)
      list.appendChild(li)
    }
  }
}

// Personal links, minted by a curator (mint-link.mjs):
//   https://kyc.kusama-vision-pop.eth.limo/#c=<curator name or appId>&t=<accessToken>&id=<verification id>
// The fragment never reaches the web server. With c present only that
// curator's steps are shown; without t they stay disabled with a warning.
function parseLink() {
  const h = new URLSearchParams(location.hash.slice(1))
  const c = h.get('c')
  const t = h.get('t')
  const a = h.get('id')
  state.link = null
  let note = ''
  if (!c) {
    note = 'This page works only with the personal verification link a curator sends you in your Matrix room. Open that link to start.'
  } else {
    const curator = cfg.curators.find(
      (x) => x.name.toLowerCase() === c.toLowerCase() || x.appId === c
    )
    if (!curator) {
      note = `This link names an unknown curator ("${c}"), so verification cannot start. Ask for a fresh link in your Matrix room.`
    } else {
      if (t) curator.accessToken = t
      state.link = { curator, tokenProvided: Boolean(t) }
      if (!t) {
        note = `This link for ${curator.name} is missing its session token, so verification cannot start. Ask ${curator.name} for a fresh link in your Matrix room.`
      }
    }
  }
  return { address: a, note }
}

function onIdentifierInput() {
  const v = $('identifier').value.trim().toLowerCase()
  const ok = plausibleId(v)
  $('identifier-hint').hidden = ok || v === ''
  state.identifier = ok ? v : ''
  state.widgets.forEach((w) => w.destroy())
  state.widgets.clear()
  refreshAll()
}

function initFromLocation() {
  state.widgets.forEach((w) => w.destroy())
  state.widgets.clear()
  const { address, note } = parseLink()
  render()
  const n = $('link-note')
  n.textContent = note
  n.hidden = !note
  $('check-all').hidden = !state.link
  if (address) $('identifier').value = address
  onIdentifierInput()
}

initFromLocation()
window.addEventListener('hashchange', initFromLocation)
$('identifier').addEventListener('change', onIdentifierInput)
$('identifier').addEventListener('blur', onIdentifierInput)
$('check-all').addEventListener('click', () => {
  onIdentifierInput()
})
