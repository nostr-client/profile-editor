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
  :host { display: block;
    font-family: var(--nc-font, ui-sans-serif, system-ui, sans-serif);
    font-size: .95rem; color: var(--nc-ink, #201d26); max-width: 34rem; }
  form { display: grid; gap: .8rem; padding: 1.1rem 1.2rem;
    background: var(--nc-surface, #fff);
    border: 1px solid var(--nc-line, #e9e6e0);
    border-radius: var(--nc-radius, 14px);
    box-shadow: var(--nc-shadow, 0 1px 2px rgb(32 27 51 / 4%), 0 6px 24px -10px rgb(32 27 51 / 10%)); }
  label { display: grid; gap: .3rem; font-size: .76rem; font-weight: 600;
    color: var(--nc-soft, #6d6a76); text-transform: uppercase; letter-spacing: .04em; }
  input, textarea { font: inherit; font-size: .95rem; font-weight: 400;
    padding: .5em .7em; border-radius: var(--nc-radius-sm, 9px);
    border: 1px solid var(--nc-line, #e9e6e0);
    background: var(--nc-inset, #f4f2ee); color: var(--nc-ink, #201d26);
    width: 100%; box-sizing: border-box; text-transform: none; letter-spacing: normal; }
  input:focus, textarea:focus { outline: 2px solid var(--nc-accent-soft, #f2ecfd);
    border-color: var(--nc-accent, #7c3aed); }
  textarea { min-height: 4.5em; resize: vertical; line-height: 1.5; }
  .head { display: flex; align-items: center; gap: .9rem; }
  .avatar { width: 56px; height: 56px; border-radius: 50%; object-fit: cover;
    background: var(--nc-inset, #f4f2ee); border: 1px solid var(--nc-line, #e9e6e0); }
  .head .who { font-family: var(--nc-mono, ui-monospace, monospace); font-size: .78rem;
    color: var(--nc-faint, #a8a4b0); overflow-wrap: anywhere; }
  button { font: inherit; cursor: pointer; border: none; border-radius: 999px;
    padding: .55em 1.4em; font-weight: 600; justify-self: start;
    background: var(--nc-accent, #7c3aed); color: var(--nc-accent-ink, #fff);
    transition: filter .15s ease, transform .15s ease; }
  button:hover { filter: brightness(1.08); }
  button:active { transform: translateY(1px); }
  button:disabled { opacity: .45; cursor: default; filter: none; }
  .status { font-size: .8rem; white-space: pre-wrap; color: var(--nc-soft, #6d6a76); }
  .placeholder { border: 1px dashed var(--nc-line, #e9e6e0);
    border-radius: var(--nc-radius, 14px); background: var(--nc-surface, #fff);
    padding: 1.6rem; text-align: center; color: var(--nc-soft, #6d6a76); }
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
