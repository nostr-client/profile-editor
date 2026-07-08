/**
 * profile-editor.js — <nostr-profile-editor>, a kind-0 metadata editor.
 * No build step. Composes with any pool + any NIP-07-shaped signer.
 *
 * Part of https://github.com/nostr-client — one repo, one thing.
 * License: AGPL-3.0-or-later
 *
 * Usage:
 *   <script type="module" src="https://nostr-client.github.io/profile-editor/profile-editor.js"></script>
 *   <nostr-profile-editor></nostr-profile-editor>
 *
 * Contract (see https://github.com/nostr-client):
 *   - pubkey primitive is HEX (the `pubkey` attribute, if set, is hex)
 *   - signer comes from window.nostrSigner or the 'nostr:login' window event
 *     (e.g. https://nostr-client.github.io/login/login.js) — or set .signer
 *   - relays default to the shared pool; override with relays="wss://…,wss://…"
 *     or set .pool to any object with .get(filter) / .publish(event)
 */

import { Pool, defaultPool } from 'https://nostr-client.github.io/pool/pool.js'

const FIELDS = [
  ['name', 'Name', 'input'],
  ['display_name', 'Display name', 'input'],
  ['about', 'About', 'textarea'],
  ['picture', 'Picture URL', 'input'],
  ['banner', 'Banner URL', 'input'],
  ['website', 'Website', 'input'],
  ['nip05', 'NIP-05 (user@domain)', 'input'],
  ['lud16', 'Lightning address', 'input'],
]

const TEMPLATE = /* html */ `
<style>
  :host { display: block; font-family: system-ui, sans-serif; font-size: .95rem;
    max-width: 34rem; }
  form { display: grid; gap: .7rem; border: 1px solid rgba(127,127,127,.3);
    border-radius: 12px; padding: 1rem; }
  label { display: grid; gap: .25rem; font-size: .8rem; opacity: .85; }
  input, textarea { font: inherit; font-size: .95rem; padding: .45em .6em; border-radius: 8px;
    border: 1px solid rgba(127,127,127,.4); background: transparent; color: inherit;
    width: 100%; box-sizing: border-box; }
  textarea { min-height: 4.5em; resize: vertical; }
  .head { display: flex; align-items: center; gap: .8rem; }
  .avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover;
    background: rgba(127,127,127,.2); }
  .head .who { font-family: ui-monospace, monospace; font-size: .8rem; opacity: .7;
    overflow-wrap: anywhere; }
  button { font: inherit; cursor: pointer; border-radius: 8px; padding: .5em 1.2em;
    border: 1px solid rgba(127,127,127,.4);
    background: var(--nostr-accent, #8e30eb); color: #fff; justify-self: start; }
  button:disabled { opacity: .5; cursor: default; }
  .status { font-size: .8rem; white-space: pre-wrap; }
  .placeholder { border: 1px dashed rgba(127,127,127,.4); border-radius: 12px;
    padding: 1.5rem; text-align: center; opacity: .7; }
</style>
<div id="root"></div>
`

class NostrProfileEditor extends HTMLElement {
  static observedAttributes = ['pubkey']

  constructor() {
    super()
    this.attachShadow({ mode: 'open' }).innerHTML = TEMPLATE
    this.root = this.shadowRoot.getElementById('root')
    this.pool = null           // injectable
    this.signer = null         // injectable; defaults to window.nostrSigner
    this._extra = {}           // unknown kind-0 fields — preserved on save
    this._loadSeq = 0
    this._onLogin = (e) => { this.signer = e.detail.signer; this._setPubkey(e.detail.pubkey) }
    this._onLogout = () => { this.signer = null; this._setPubkey(null) }
  }

  connectedCallback() {
    window.addEventListener('nostr:login', this._onLogin)
    window.addEventListener('nostr:logout', this._onLogout)
    const attr = this.getAttribute('pubkey')
    this._setPubkey(attr || window.nostrPubkey || null)
    if (!this.signer && window.nostrSigner) this.signer = window.nostrSigner
  }

  disconnectedCallback() {
    window.removeEventListener('nostr:login', this._onLogin)
    window.removeEventListener('nostr:logout', this._onLogout)
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (name === 'pubkey' && newVal !== oldVal && this.isConnected) this._setPubkey(newVal)
  }

  get _pool() {
    if (!this.pool) {
      const relays = this.getAttribute('relays')
      this.pool = relays ? new Pool(relays.split(',').map((s) => s.trim())) : defaultPool()
    }
    return this.pool
  }

  _setPubkey(pubkey) {
    this.pubkey = pubkey && /^[0-9a-f]{64}$/i.test(pubkey) ? pubkey.toLowerCase() : null
    this.pubkey ? this._load() : this._renderPlaceholder()
  }

  _renderPlaceholder() {
    this.root.innerHTML = ''
    const div = document.createElement('div')
    div.className = 'placeholder'
    div.textContent = 'Log in to edit your profile (add a <nostr-login> element, or set the pubkey attribute).'
    this.root.append(div)
  }

  async _load() {
    const seq = ++this._loadSeq
    this._renderForm({}, 'loading current profile…')
    const event = await this._pool.get({ kinds: [0], authors: [this.pubkey] })
    if (seq !== this._loadSeq) return
    let profile = {}
    if (event) { try { profile = JSON.parse(event.content) } catch {} }
    const known = new Set(FIELDS.map(([key]) => key))
    this._extra = Object.fromEntries(Object.entries(profile).filter(([k]) => !known.has(k)))
    this._renderForm(profile, event ? '' : 'no existing profile found — this will create one')
  }

  _renderForm(profile, statusText) {
    this.root.innerHTML = ''
    const form = document.createElement('form')

    const head = document.createElement('div')
    head.className = 'head'
    const avatar = document.createElement('img')
    avatar.className = 'avatar'
    avatar.alt = ''
    if (profile.picture) avatar.src = profile.picture
    const who = document.createElement('div')
    who.className = 'who'
    who.textContent = this.pubkey
    head.append(avatar, who)
    form.append(head)

    this._inputs = {}
    for (const [key, label, tag] of FIELDS) {
      const wrap = document.createElement('label')
      wrap.append(label)
      const input = document.createElement(tag)
      if (tag === 'input') input.type = 'text'
      input.value = profile[key] ?? ''
      if (key === 'picture') input.addEventListener('change', () => { avatar.src = input.value })
      this._inputs[key] = input
      wrap.append(input)
      form.append(wrap)
    }

    const save = document.createElement('button')
    save.textContent = 'Save profile'
    const status = document.createElement('div')
    status.className = 'status'
    status.textContent = statusText || ''
    form.append(save, status)

    form.onsubmit = async (e) => {
      e.preventDefault()
      const signer = this.signer || window.nostrSigner
      if (!signer) { status.textContent = '✗ no signer — log in first'; return }
      save.disabled = true
      status.textContent = 'signing…'
      try {
        const content = { ...this._extra }
        for (const [key] of FIELDS) {
          const value = this._inputs[key].value.trim()
          if (value) content[key] = value
        }
        const event = await signer.signEvent({
          kind: 0,
          created_at: Math.floor(Date.now() / 1000),
          tags: [],
          content: JSON.stringify(content),
        })
        status.textContent = 'publishing…'
        const results = await this._pool.publish(event)
        status.textContent = results
          .map((r) => (r.ok ? '✓ ' : '✗ ') + r.relay + (r.message ? ' — ' + r.message : ''))
          .join('\n')
        this.dispatchEvent(new CustomEvent('nostr:profile-saved', {
          detail: { event, results }, bubbles: true, composed: true,
        }))
      } catch (err) {
        status.textContent = '✗ ' + (err.message || err)
      } finally {
        save.disabled = false
      }
    }

    this.root.append(form)
  }
}

if (!customElements.get('nostr-profile-editor')) {
  customElements.define('nostr-profile-editor', NostrProfileEditor)
}
