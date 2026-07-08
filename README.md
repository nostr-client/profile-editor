# profile-editor

`<nostr-profile-editor>` — edit and publish your nostr profile (kind 0).
**No build step.** One file: [`profile-editor.js`](profile-editor.js).

Part of [nostr-client](https://github.com/nostr-client) — a modular, composable
nostr client where each repo does one thing.

**Live demo:** https://nostr-client.github.io/profile-editor/

## Use

```html
<script type="module" src="https://nostr-client.github.io/login/login.js"></script>
<script type="module" src="https://nostr-client.github.io/profile-editor/profile-editor.js"></script>

<nostr-login></nostr-login>
<nostr-profile-editor></nostr-profile-editor>
```

That's a working profile editor. The editor discovers the logged-in user via
the shared contract (`window.nostrSigner` + `nostr:login`/`nostr:logout`
events), loads the current kind-0 from the shared relay pool, and publishes
signed updates with per-relay acknowledgements.

## Composability

Everything is swappable:

| dependency | default | override |
|---|---|---|
| pubkey | logged-in user | `pubkey="<hex>"` attribute (hex is the primitive) |
| signer | `window.nostrSigner` | set the `.signer` property (`{ getPublicKey, signEvent }`) |
| relays | shared `defaultPool()` | `relays="wss://a,wss://b"` attribute, or set `.pool` |

Fields: name, display name, about, picture, banner, website, NIP-05,
lightning address. **Unknown fields in an existing kind-0 are preserved** on
save — this editor won't destroy metadata other clients wrote.

Fires `nostr:profile-saved` (bubbling) with `{ event, results }`.

## License

AGPL-3.0-or-later
