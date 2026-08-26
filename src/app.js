import { ZkMeWidget, verifyKycWithZkMeServices } from '@zkmelabs/widget'

const cfg = window.KYC_CONFIG
const $ = (id) => document.getElementById(id)

const state = {
  identifier: '',
  widgets: new Map(), // curator.appId+programNo -> ZkMeWidget
  link: null, // { curator, tokenProvided } when opened via a personal link
}

function curatorKey(c) {
  return `${c.appId}/${c.programNo}`
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

// Base58 charset sanity check only; exact validity is enforced by the curators
// against the proposal, not by this page.
function plausibleAddress(s) {
  return /^[1-9A-HJ-NP-Za-km-z]{40,60}$/.test(s)
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

function getWidget(curator) {
  const key = curatorKey(curator)
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
    programNo: curator.programNo,
    mode: 'email',
    theme: 'auto',
    locale: 'en',
  })
  w.on('kycFinished', (results) => onKycFinished(curator, results))
  w.on('close', () => refreshStatus(curator))
  state.widgets.set(key, w)
  return w
}

function onKycFinished(curator, results) {
  const { isGrant, associatedAccount } = results
  const ok = isGrant && associatedAccount?.toLowerCase() === state.identifier.toLowerCase()
  setStatus(curator, ok ? 'granted' : 'error',
    ok ? null : `Finished but not granted for ${state.identifier}`)
}

function setStatus(curator, status, detail) {
  const el = $(`status-${curatorKey(curator)}`)
  const btn = $(`btn-${curatorKey(curator)}`)
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

async function refreshStatus(curator) {
  if (!state.identifier) return setStatus(curator, 'unknown')
  setStatus(curator, 'checking')
  try {
    const { isGrant } = await verifyKycWithZkMeServices(curator.appId, state.identifier, {
      programNo: curator.programNo,
    })
    setStatus(curator, isGrant ? 'granted' : 'missing')
  } catch (e) {
    setStatus(curator, 'error', `status check failed: ${errText(e)}`)
  }
}

function refreshAll() {
  visibleCurators().forEach(refreshStatus)
}

function render() {
  const list = $('curators')
  list.innerHTML = ''
  for (const curator of visibleCurators()) {
    const li = document.createElement('li')
    li.className = 'curator'
    if (state.link) li.classList.add('linked')
    const btn = document.createElement('button')
    btn.id = `btn-${curatorKey(curator)}`
    btn.textContent = `Verify with ${curator.name}`
    btn.disabled = true
    if (!hasTokenSource(curator)) {
      btn.title = 'No session token available for this curator; open the personal link they sent you.'
    }
    btn.addEventListener('click', () => {
      try {
        getWidget(curator).launch()
      } catch (e) {
        setStatus(curator, 'error', errText(e))
      }
    })
    const status = document.createElement('span')
    status.id = `status-${curatorKey(curator)}`
    status.className = 'status'
    status.textContent = 'enter your address first'
    li.append(btn, status)
    list.appendChild(li)
  }
}

// Personal links, minted by a curator (mint-link.mjs):
//   https://kyc.kusama-vision-pop.eth.limo/#c=<curator name or appId>&t=<accessToken>&a=<payout address>
// The fragment never reaches the web server. With c present only that
// curator's button is shown; without t it stays disabled with a warning.
function parseLink() {
  const h = new URLSearchParams(location.hash.slice(1))
  const c = h.get('c')
  const t = h.get('t')
  const a = h.get('a')
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
  const v = $('identifier').value.trim()
  const ok = plausibleAddress(v)
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
